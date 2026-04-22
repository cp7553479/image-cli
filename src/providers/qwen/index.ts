import type { GenerateRequest } from "../../protocol/request.js";
import type {
  CurlExecutionResult,
  CurlRequest
} from "../../transport/curl.js";
import type {
  FailureClassification,
  GenerateResult,
  PreparedImageInput,
  ProviderErrorContext,
  ProviderGenerateContext,
  ProviderImageResult,
  ProviderOperation,
  ProviderPlugin
} from "../types.js";

const DEFAULT_BASE_URL = "https://dashscope.aliyuncs.com/api/v1";
const SYNC_ENDPOINT = "/services/aigc/multimodal-generation/generation";
const ASYNC_ENDPOINT = "/services/aigc/text2image/image-synthesis";
const TASK_ENDPOINT = "/tasks";
const ASYNC_HEADER_NAME = "X-DashScope-Async";
const ASYNC_HEADER_VALUE = "enable";
const MAX_POLL_ATTEMPTS = 30;

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

export const qwenProvider: ProviderPlugin = {
  providerId: "qwen",
  aliases: ["qwen", "qwen-image", "qwen-image-plus"],
  capabilities: {
    generate: true,
    edit: true,
    inputImages: true,
    asyncTasks: true,
    streaming: false,
    background: false,
    negativePrompt: true,
    multipleOutputs: true,
    transparentOutput: false
  },
  async buildGenerateOperation(input: ProviderGenerateContext): Promise<ProviderOperation> {
    const useAsync = shouldUseAsyncPath(input.request.model.modelId, input.preparedImages);
    if (useAsync) {
      return buildAsyncOperation(input);
    }
    return buildSyncOperation(input);
  },
  async parseGenerateResponse(
    result: CurlExecutionResult,
    input: ProviderGenerateContext
  ): Promise<GenerateResult> {
    const payload = parseJsonResponse(result.bodyText);
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

function buildSyncOperation(input: ProviderGenerateContext): ProviderOperation {
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
              content: buildSyncContent(input.request, input.preparedImages)
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
      const initialPayload = parseJsonResponse(initialResult.bodyText);
      const taskId = initialPayload.output?.task_id?.trim();
      if (!taskId) {
        throw new Error("Qwen async response did not include a task_id.");
      }

      let currentResult = initialResult;
      for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
        const currentPayload = parseJsonResponse(currentResult.bodyText);
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

function buildSyncContent(
  request: GenerateRequest,
  preparedImages: PreparedImageInput[]
): Array<Record<string, unknown>> {
  const content: Array<Record<string, unknown>> = [{ text: request.prompt }];

  for (const image of preparedImages) {
    content.push({
      image: image.kind === "inline" ? toDataUri(image.mimeType, image.base64Data) : image.url
    });
  }

  return content;
}

function buildParameters(request: GenerateRequest): Record<string, unknown> {
  const parameters: Record<string, unknown> = {};

  if (request.normalizedSize) {
    parameters.size = `${request.normalizedSize.width}*${request.normalizedSize.height}`;
  } else if (request.size) {
    parameters.size = request.size;
  }

  if (typeof request.count === "number") {
    parameters.n = request.count;
  }

  if (request.negativePrompt) {
    parameters.negative_prompt = request.negativePrompt;
  }

  if (typeof request.seed === "number") {
    parameters.seed = request.seed;
  }

  if (request.extra) {
    Object.assign(parameters, request.extra);
  }

  return parameters;
}

function shouldUseAsyncPath(modelId: string, preparedImages: PreparedImageInput[]): boolean {
  if (preparedImages.length > 0) {
    return false;
  }

  return modelId.startsWith("qwen-image") || modelId.startsWith("qwen-image-plus");
}

function parseJsonResponse(bodyText: string): QwenResponse {
  try {
    return JSON.parse(bodyText) as QwenResponse;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse Qwen response JSON. ${message}`);
  }
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

function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return DEFAULT_BASE_URL;
  }
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

function toDataUri(mimeType: string, base64Data: string): string {
  return `data:${mimeType};base64,${base64Data}`;
}

export default qwenProvider;
