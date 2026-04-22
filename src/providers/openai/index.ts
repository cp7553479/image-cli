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

const OPENAI_IMAGES_GENERATIONS_PATH = "/images/generations";
export const openaiProviderPlugin: ProviderPlugin = {
  providerId: "openai",
  aliases: ["chatgpt-image"],
  capabilities: {
    generate: true,
    edit: false,
    inputImages: false,
    asyncTasks: false,
    streaming: true,
    background: true,
    negativePrompt: false,
    multipleOutputs: true,
    transparentOutput: true
  },
  async buildGenerateOperation(input: ProviderGenerateContext): Promise<ProviderOperation> {
    if (input.preparedImages.length > 0) {
      throw new Error("OpenAI generate does not accept images in v1.");
    }

    const baseUrl = normalizeBaseUrl(input.providerConfig.apiBaseUrl);
    const requestBody = {
      ...(input.request.extra ?? {}),
      model: input.request.model.modelId,
      prompt: input.request.prompt,
      n: input.request.count ?? 1,
      size: resolveSize(input.request),
      quality: input.request.quality,
      background: input.request.background,
      output_format: input.request.outputFormat,
      output_compression: getProviderExtra(input.request.extra, "output_compression"),
      stream: input.request.stream,
      user: getProviderExtra(input.request.extra, "user"),
      moderation: getProviderExtra(input.request.extra, "moderation")
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
    const parsed = parseJsonBody(result.bodyText);
    const data = Array.isArray(parsed?.data) ? parsed.data : [];
    const outputFormat = resolveOutputFormat(input.request) ?? "png";
    const mimeType = mimeTypeForFormat(outputFormat);

    return {
      providerId: "openai",
      modelId: input.request.model.modelId,
      images: data.map((item: Record<string, unknown>) =>
        toProviderImageResult(item, outputFormat, mimeType)
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

function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim();
  return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
}

function resolveSize(request: ProviderGenerateContext["request"]): string | undefined {
  if (request.normalizedSize) {
    return `${request.normalizedSize.width}x${request.normalizedSize.height}`;
  }
  return request.size;
}

function resolveOutputFormat(
  request: ProviderGenerateContext["request"]
): "png" | "jpeg" | "webp" | undefined {
  const extraOutputFormat = getProviderExtra(request.extra, "output_format");
  if (request.outputFormat) {
    return request.outputFormat;
  }
  if (extraOutputFormat === "png" || extraOutputFormat === "jpeg" || extraOutputFormat === "webp") {
    return extraOutputFormat;
  }
  return undefined;
}

function getProviderExtra(
  extra: Record<string, unknown> | undefined,
  key: string
): unknown {
  return extra ? extra[key] : undefined;
}

function parseJsonBody(bodyText: string): Record<string, unknown> | undefined {
  if (!bodyText.trim()) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(bodyText) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Expected a JSON object.");
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    throw new Error(`Failed to parse OpenAI response JSON: ${toErrorMessage(error)}`);
  }
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
  outputFormat: "png" | "jpeg" | "webp",
  mimeType: string
): ProviderImageResult {
  const result: ProviderImageResult = {
    outputFormat,
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
