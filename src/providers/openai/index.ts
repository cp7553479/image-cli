import type { CurlExecutionResult } from "../../transport/curl.js";
import type {
  FailureClassification,
  GenerateResult,
  ProviderErrorContext,
  ProviderGenerateContext,
  ProviderOperation,
  ProviderPlugin,
  ProviderImageResult
} from "../types.js";
import { getBuiltInProviderAliases } from "../identity.js";
import { collectOpenAIImageRequestFields } from "../openai-image-options.js";
import {
  assertSuccessfulResponse,
  parseJsonBody as parseProviderJsonBody,
  parseSseJsonData
} from "../response.js";

const OPENAI_IMAGES_GENERATIONS_PATH = "/images/generations";
/**
 * openaiProviderPlugin 的导出入口。
 */
export const openaiProviderPlugin: ProviderPlugin = {
  providerId: "openai",
  aliases: getBuiltInProviderAliases("openai"),
  capabilities: {
    generate: true,
    edit: false,
    asyncTasks: false,
    streaming: true,
    background: true,
    multipleOutputs: true,
    transparentOutput: true
  },
  async buildGenerateOperation(input: ProviderGenerateContext): Promise<ProviderOperation> {
    const baseUrl = normalizeBaseUrl(input.providerConfig.apiBaseUrl);
    const requestBody = {
      ...(input.request.extra ?? {}),
      ...collectOpenAIImageRequestFields(input.request, {
        includeModelAndPrompt: true
      })
    };

    return {
      request: {
        method: "POST",
        url: new URL("images/generations", baseUrl).toString(),
        headers: {
          Authorization: `Bearer ${input.credential.value}`
        },
        json: requestBody,
        timeoutMs: input.providerConfig.timeoutMs,
        stream: input.request.stream
      }
    };
  },
  async parseGenerateResponse(
    result: CurlExecutionResult,
    input: ProviderGenerateContext
  ): Promise<GenerateResult> {
    const parsed = parseOpenAIResponse(result, input.request.stream === true);
    assertSuccessfulResponse("OpenAI", result, parsed);

    const data = Array.isArray(parsed?.data) ? parsed.data : [];
    const output_format = input.request.output_format ?? "png";
    const mimeType = mimeTypeForFormat(output_format);

    return {
      providerId: "openai",
      modelId: input.request.model.modelId,
      images: data.map((item: Record<string, unknown>) =>
        toProviderImageResult(item, output_format, mimeType)
      ),
      warnings: collectWarnings(parsed),
      raw: parsed,
      usage: parsed?.usage as Record<string, unknown> | undefined
    };
  },
  classifyFailure(context: ProviderErrorContext): FailureClassification {
    const statusCode = context.response?.statusCode;
    if (statusCode === 400) {
      return {
        kind: "non-retryable-request",
        reason: `OpenAI request failed with HTTP ${statusCode}.`
      };
    }

    if (statusCode === 401 || statusCode === 403 || statusCode === 429) {
      return {
        kind: "retryable-credential",
        reason: `OpenAI credential or quota failure with HTTP ${statusCode}.`
      };
    }

    if (typeof statusCode === "number" && statusCode >= 500) {
      return {
        kind: "retryable-transport",
        reason: `OpenAI transport failure with HTTP ${statusCode}.`
      };
    }

    if (context.error instanceof Error && /curl failed|timed out/i.test(context.error.message)) {
      return {
        kind: "retryable-transport",
        reason: `OpenAI transport failure: ${context.error.message}`
      };
    }

    return {
      kind: "unknown",
      reason: toErrorMessage(context.error)
    };
  }
};

export default openaiProviderPlugin;

/** 规范化 OpenAI base URL，确保末尾包含斜杠。 */
function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim();
  return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
}

function parseOpenAIResponse(
  result: CurlExecutionResult,
  stream: boolean
): Record<string, unknown> {
  const bodyText = result.bodyText.trim();
  if (stream && bodyText.includes("data:")) {
    return parseOpenAIStreamResponse(bodyText);
  }

  return parseProviderJsonBody<Record<string, unknown>>("OpenAI", result.bodyText, {
    allowEmpty: result.statusCode >= 400,
    tolerateInvalid: result.statusCode >= 400
  });
}

function parseOpenAIStreamResponse(bodyText: string): Record<string, unknown> {
  const events = parseSseJsonData<Record<string, unknown>>("OpenAI", bodyText);
  const completed: Record<string, unknown>[] = [];
  const streamed: Record<string, unknown>[] = [];
  let usage: unknown;

  for (const event of events) {
    appendStreamImage(event, completed, streamed);

    if (Array.isArray(event.data)) {
      for (const item of event.data) {
        if (item && typeof item === "object" && !Array.isArray(item)) {
          appendStreamImage(item as Record<string, unknown>, completed, streamed);
        }
      }
    }

    if (event.usage) {
      usage = event.usage;
    }
  }

  return {
    data: completed.length > 0 ? completed : streamed,
    events,
    usage
  };
}

function appendStreamImage(
  event: Record<string, unknown>,
  completed: Record<string, unknown>[],
  streamed: Record<string, unknown>[]
): void {
  if (!isImageResult(event)) {
    return;
  }

  if (event.type === "image_generation.completed") {
    completed.push(event);
    return;
  }

  streamed.push(event);
}

function isImageResult(value: Record<string, unknown>): boolean {
  return typeof value.b64_json === "string" || typeof value.url === "string";
}

function collectWarnings(parsed: Record<string, unknown> | undefined): string[] {
  const warnings: string[] = [];
  if (!parsed) {
    return warnings;
  }

  const data = parsed.data;
  if (!Array.isArray(data)) {
    return warnings;
  }

  for (const item of data) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }

    const url = (item as Record<string, unknown>).url;
    if (typeof url === "string") {
      warnings.push("OpenAI returned a temporary URL; download it before it expires.");
    }

    const revisedPrompt = (item as Record<string, unknown>).revised_prompt;
    if (typeof revisedPrompt === "string" && revisedPrompt.trim()) {
      warnings.push(`OpenAI revised the prompt: ${revisedPrompt}`);
    }
  }

  return warnings;
}

function toProviderImageResult(
  item: Record<string, unknown>,
  output_format: "png" | "jpeg" | "webp",
  mimeType: string
): ProviderImageResult {
  const result: ProviderImageResult = {
    output_format,
    mimeType
  };

  if (typeof item.b64_json === "string") {
    result.dataBase64 = item.b64_json;
  }

  if (typeof item.url === "string") {
    result.url = item.url;
    result.warnings = ["OpenAI returned a temporary URL; download it before it expires."];
  }

  return result;
}

function mimeTypeForFormat(format: "png" | "jpeg" | "webp"): string {
  switch (format) {
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    default:
      return "image/png";
  }
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
