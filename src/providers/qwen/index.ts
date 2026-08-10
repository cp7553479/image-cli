import type { GenerateRequest } from "../../protocol/request.js";
import type {
  CurlExecutionResult,
  CurlRequest
} from "../../transport/curl.js";
import type {
  FailureClassification,
  GenerateResult,
  ProviderErrorContext,
  ProviderGenerateContext,
  ProviderImageResult,
  ProviderOperation,
  ProviderPlugin
} from "../types.js";
import { getBuiltInProviderAliases } from "../identity.js";
import {
  collectOpenAIImageRequestFields,
  qwenSizeFromOpenAIImageSize
} from "../openai-image-options.js";
import {
  assertSuccessfulResponse,
  parseJsonBody as parseProviderJsonBody
} from "../response.js";
import { resolveImageToDataUrl } from "../image-input.js";

/** Qwen API 默认基地址。用于拼接同步/异步端点。 */
const DEFAULT_BASE_URL = "https://dashscope.aliyuncs.com/api/v1";
const SYNC_ENDPOINT = "/services/aigc/multimodal-generation/generation";
const ASYNC_ENDPOINT = "/services/aigc/text2image/image-synthesis";
const TASK_ENDPOINT = "/tasks";
const ASYNC_HEADER_NAME = "X-DashScope-Async";
const ASYNC_HEADER_VALUE = "enable";
/** 异步任务最大轮询次数（次）。超过后视为超时失败。 */
const MAX_POLL_ATTEMPTS = 30;
const ASYNC_MODEL_IDS = new Set(["qwen-image", "qwen-image-plus"]);

type QwenResponse = {
  usage?: Record<string, unknown>;
  output?: {
    choices?: Array<{
      message?: {
        content?: Array<{
          image?: string;
        }>;
      };
    }>;
    task_id?: string;
    task_status?: string;
    results?: Array<{
      url?: string;
    }>;
    code?: string;
    message?: string;
  };
};

/**
 * qwenProvider 的导出入口。
 */
export const qwenProvider: ProviderPlugin = {
  providerId: "qwen",
  aliases: getBuiltInProviderAliases("qwen"),
  capabilities: {
    generate: true,
    edit: true,
    asyncTasks: true,
    streaming: false,
    background: false,
    multipleOutputs: true,
    transparentOutput: false
  },
  async buildGenerateOperation(input: ProviderGenerateContext): Promise<ProviderOperation> {
    const useAsync = shouldUseAsyncPath(input.request.model.modelId);
    if (useAsync) {
      return buildAsyncOperation(input);
    }
    return await buildSyncOperation(input);
  },
  async parseGenerateResponse(
    result: CurlExecutionResult,
    input: ProviderGenerateContext
  ): Promise<GenerateResult> {
    const payload = parseJsonResponse(result.bodyText, result.statusCode >= 400);
    assertSuccessfulResponse("Qwen", result, payload);

    const images = extractImages(payload);

    return {
      providerId: "qwen",
      modelId: input.request.model.modelId,
      images,
      warnings: [],
      raw: payload,
      usage: payload.usage
    };
  },
  classifyFailure(context: ProviderErrorContext): FailureClassification {
    const statusCode = context.response?.statusCode ?? 0;

    if (statusCode === 400) {
      return {
        kind: "non-retryable-request",
        reason: "Qwen rejected the request with HTTP 400."
      };
    }

    if (statusCode === 401 || statusCode === 403 || statusCode === 429) {
      return {
        kind: "retryable-credential",
        reason: `Qwen rejected credentials with HTTP ${statusCode}.`
      };
    }

    if (statusCode >= 500 && statusCode <= 599) {
      return {
        kind: "retryable-transport",
        reason: `Qwen returned HTTP ${statusCode}.`
      };
    }

    return {
      kind: "unknown",
      reason: context.error instanceof Error ? context.error.message : "Unknown Qwen failure."
    };
  }
};

async function buildSyncOperation(input: ProviderGenerateContext): Promise<ProviderOperation> {
  return {
    request: {
      method: "POST",
      url: `${normalizeBaseUrl(input.providerConfig.apiBaseUrl)}${SYNC_ENDPOINT}`,
      headers: buildJsonHeaders(input.credential.value),
      json: {
        model: input.request.model.modelId,
        input: {
          messages: [
            {
              role: "user",
              content: await buildSyncContent(input.request)
            }
          ]
        },
        parameters: buildParameters(input.request)
      },
      timeoutMs: input.providerConfig.timeoutMs
    }
  };
}

function buildAsyncOperation(input: ProviderGenerateContext): ProviderOperation {
  return {
    request: {
      method: "POST",
      url: `${normalizeBaseUrl(input.providerConfig.apiBaseUrl)}${ASYNC_ENDPOINT}`,
      headers: buildJsonHeaders(input.credential.value, {
        [ASYNC_HEADER_NAME]: ASYNC_HEADER_VALUE
      }),
      json: {
        model: input.request.model.modelId,
        input: {
          prompt: input.request.prompt
        },
        parameters: buildParameters(input.request)
      },
      timeoutMs: input.providerConfig.timeoutMs
    },
    followUp: async (initialResult, tools) => {
      const initialPayload = parseJsonResponse(
        initialResult.bodyText,
        initialResult.statusCode >= 400
      );
      assertSuccessfulResponse("Qwen", initialResult, initialPayload);

      const taskId = initialPayload.output?.task_id?.trim();
      if (!taskId) {
        throw new Error("Qwen async response did not include a task_id.");
      }

      let currentResult = initialResult;
      for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
        const currentPayload = parseJsonResponse(
          currentResult.bodyText,
          currentResult.statusCode >= 400
        );
        assertSuccessfulResponse("Qwen", currentResult, currentPayload);

        const taskStatus = currentPayload.output?.task_status?.trim();

        if (taskStatus === "SUCCEEDED") {
          return currentResult;
        }

        if (taskStatus === "FAILED" || taskStatus === "CANCELED") {
          const code = currentPayload.output?.code;
          const message = currentPayload.output?.message;
          throw new Error(
            code || message
              ? `Qwen task ${taskId} ${taskStatus.toLowerCase()}: ${[code, message].filter(Boolean).join(": ")}`
              : `Qwen task ${taskId} ${taskStatus.toLowerCase()}.`
          );
        }

        if (taskStatus !== "PENDING" && taskStatus !== "RUNNING" && attempt === 0) {
          throw new Error(`Qwen task ${taskId} returned unknown status "${taskStatus ?? ""}".`);
        }

        const pollResult = await tools.execute({
          method: "GET",
          url: `${normalizeBaseUrl(tools.providerConfig.apiBaseUrl)}${TASK_ENDPOINT}/${encodeURIComponent(taskId)}`,
          headers: buildAuthHeaders(tools.credential.value),
          timeoutMs: tools.providerConfig.timeoutMs
        });

        currentResult = pollResult;
      }

      throw new Error(`Qwen task ${taskId} did not complete within ${MAX_POLL_ATTEMPTS} polls.`);
    }
  };
}

function buildJsonHeaders(
  apiKey: string,
  extraHeaders: Record<string, string> = {}
): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    ...extraHeaders
  };
}

function buildAuthHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`
  };
}

async function buildSyncContent(
  request: GenerateRequest
): Promise<Array<Record<string, unknown>>> {
  const content: Array<Record<string, unknown>> = [{ text: request.prompt }];

  if (request.reference_images && request.reference_images.length > 0) {
    const dataUrls = await Promise.all(
      request.reference_images.map((image) => resolveImageToDataUrl(image))
    );
    for (const dataUrl of dataUrls) {
      content.push({ image: dataUrl });
    }
  }

  return content;
}

function buildParameters(request: GenerateRequest): Record<string, unknown> {
  const parameters: Record<string, unknown> = {
    ...(request.extra ?? {}),
    ...collectOpenAIImageRequestFields(request, {
      includeSize: false
    })
  };

  const size = qwenSizeFromOpenAIImageSize(request.size);
  if (size) {
    parameters.size = size;
  }

  if (typeof request.n === "number") {
    parameters.n = request.n;
  }

  return parameters;
}

function shouldUseAsyncPath(modelId: string): boolean {
  return ASYNC_MODEL_IDS.has(modelId);
}

function parseJsonResponse(bodyText: string, tolerateInvalid = false): QwenResponse {
  return parseProviderJsonBody<QwenResponse>("Qwen", bodyText, {
    allowEmpty: tolerateInvalid,
    tolerateInvalid
  });
}

function extractImages(payload: QwenResponse): ProviderImageResult[] {
  const asyncResults = payload.output?.results ?? [];
  if (asyncResults.length > 0) {
    return asyncResults.flatMap((result: { url?: string }) => {
      if (!result.url) {
        return [];
      }
      return [
        {
          url: result.url
        }
      ];
    });
  }

  const syncChoices = payload.output?.choices ?? [];
  const images: ProviderImageResult[] = [];
  for (const choice of syncChoices) {
    for (const item of choice.message?.content ?? []) {
      if (!item.image) {
        continue;
      }
      images.push({ url: item.image });
    }
  }
  return images;
}

/** 规范化 provider base URL，去除尾部斜杠并在空值时回退默认地址。 */
function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return DEFAULT_BASE_URL;
  }
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

export default qwenProvider;
