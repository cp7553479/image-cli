import type {
  ProviderErrorContext,
  ProviderGenerateContext,
  ProviderImageResult,
  ProviderOperation,
  ProviderPlugin
} from "../types.js";
import type { CurlExecutionResult } from "../../transport/curl.js";
import { getBuiltInProviderAliases } from "../identity.js";
import { collectOpenAIImageRequestFields } from "../openai-image-options.js";
import { assertSuccessfulResponse } from "../response.js";

const DEFAULT_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";
const TEMPORARY_URL_WARNING = "Temporary URL; expires in 24 hours.";

/**
 * seedreamProviderPlugin 的导出入口。
 */
export const seedreamProviderPlugin: ProviderPlugin = {
  providerId: "seedream",
  aliases: getBuiltInProviderAliases("seedream"),
  capabilities: {
    generate: true,
    edit: false,
    asyncTasks: false,
    streaming: true,
    background: false,
    multipleOutputs: true,
    transparentOutput: false
  },
  async buildGenerateOperation(input: ProviderGenerateContext): Promise<ProviderOperation> {
    const requestBody = buildRequestBody(input);

    return {
      request: {
        method: "POST",
        url: joinUrl(input.providerConfig.apiBaseUrl || DEFAULT_BASE_URL, "images/generations"),
        headers: {
          Authorization: `Bearer ${input.credential.value}`
        },
        json: requestBody,
        timeoutMs: input.providerConfig.timeoutMs,
        stream: requestBody.stream === true
      }
    };
  },
  async parseGenerateResponse(
    result: CurlExecutionResult,
    input: ProviderGenerateContext
  ) {
    const payload = parsePayload(result.bodyText, result.statusCode >= 400);
    assertSuccessfulResponse("Seedream", result, payload);

    const items = extractResponseItems(payload);

    const images = items.map(mapImageResult).filter(isPresent);
    const warnings = unique(
      images.flatMap((image) => image.warnings ?? [])
    );

    return {
      providerId: "seedream",
      modelId: input.request.model.modelId,
      images,
      warnings,
      raw: payload,
      usage: extractUsage(payload)
    };
  },
  classifyFailure(context: ProviderErrorContext) {
    const statusCode = context.response?.statusCode;
    const message = extractErrorMessage(context.error);

    if (statusCode === 400) {
      return {
        kind: "non-retryable-request",
        reason: message || "Seedream rejected the request body."
      };
    }

    if (statusCode === 401 || statusCode === 403 || statusCode === 429) {
      return {
        kind: "retryable-credential",
        reason: message || `Seedream returned HTTP ${statusCode}.`
      };
    }

    if (typeof statusCode === "number" && statusCode >= 500) {
      return {
        kind: "retryable-transport",
        reason: message || `Seedream returned HTTP ${statusCode}.`
      };
    }

    if (statusCode !== undefined && statusCode >= 400) {
      return {
        kind: "non-retryable-request",
        reason: message || `Seedream returned HTTP ${statusCode}.`
      };
    }

    return {
      kind: "unknown",
      reason: message || "Seedream failure classification was inconclusive."
    };
  }
};

function buildRequestBody(input: ProviderGenerateContext): Record<string, unknown> {
  const body: Record<string, unknown> = {
    watermark: false,
    ...(input.request.extra ?? {}),
    ...collectOpenAIImageRequestFields(input.request, {
      includeModelAndPrompt: true
    })
  };

  body.response_format = input.request.response_format ?? "url";

  if (input.request.stream) {
    body.stream = true;
  }

  if (input.request.n && input.request.n > 1) {
    body.sequential_image_generation = "auto";
    body.sequential_image_generation_options = {
      max_images: input.request.n
    };
  }

  return body;
}

function parsePayload(bodyText: string, tolerateInvalid = false): unknown {
  const trimmed = bodyText.trim();
  if (!trimmed) {
    return {};
  }

  if (!trimmed.startsWith("data:")) {
    try {
      return JSON.parse(trimmed) as unknown;
    } catch (error) {
      if (tolerateInvalid) {
        return {};
      }
      throw error;
    }
  }

  const lines = trimmed.split(/\r?\n/);
  const dataLines = lines
    .map((line) => line.trim())
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).trim())
    .filter((line) => line && line !== "[DONE]");

  if (dataLines.length === 0) {
    return {};
  }

  const lastDataLine = dataLines.at(-1) ?? "{}";
  try {
    return JSON.parse(lastDataLine) as unknown;
  } catch (error) {
    if (tolerateInvalid) {
      return {};
    }
    throw error;
  }
}

function extractResponseItems(payload: unknown): unknown[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const candidate = payload as {
    data?: unknown;
    images?: unknown;
    image?: unknown;
  };

  if (Array.isArray(candidate.data)) {
    return candidate.data;
  }

  if (Array.isArray(candidate.images)) {
    return candidate.images;
  }

  if (Array.isArray(candidate.image)) {
    return candidate.image;
  }

  if (candidate.data && typeof candidate.data === "object") {
    return [candidate.data];
  }

  if (candidate.images && typeof candidate.images === "object") {
    return [candidate.images];
  }

  return [];
}

function mapImageResult(item: unknown): ProviderImageResult | null {
  if (typeof item === "string") {
    if (item.startsWith("data:")) {
      const parsed = parseDataUrl(item);
      return {
        output_format: "b64_json",
        mimeType: parsed.mimeType,
        dataBase64: parsed.base64Data
      };
    }

    return {
      output_format: "url",
      url: item,
      warnings: [TEMPORARY_URL_WARNING]
    };
  }

  if (!item || typeof item !== "object") {
    return null;
  }

  const record = item as Record<string, unknown>;
  const url = readString(record.url);
  if (url) {
    return {
      output_format: "url",
      url,
      warnings: [TEMPORARY_URL_WARNING]
    };
  }

  const base64Data =
    readString(record.b64_json) ??
    readString(record.base64_json) ??
    readString(record.b64Json);
  if (base64Data) {
    return {
      output_format: "b64_json",
      mimeType: readString(record.mime_type) ?? readString(record.mimeType),
      dataBase64: base64Data
    };
  }

  const dataUrl = readString(record.data_url) ?? readString(record.dataUrl);
  if (dataUrl) {
    const parsed = parseDataUrl(dataUrl);
    return {
      output_format: "b64_json",
      mimeType: parsed.mimeType,
      dataBase64: parsed.base64Data
    };
  }

  return null;
}

function parseDataUrl(value: string): { mimeType: string; base64Data: string } {
  const match = value.match(/^data:([^;,]+)?(?:;charset=[^;,]+)?;base64,(.+)$/);
  if (!match) {
    return {
      mimeType: "application/octet-stream",
      base64Data: value
    };
  }

  return {
    mimeType: match[1] || "application/octet-stream",
    base64Data: match[2]
  };
}

function extractUsage(payload: unknown): Record<string, unknown> | undefined {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }

  const usage = (payload as { usage?: unknown }).usage;
  if (!usage || typeof usage !== "object") {
    return undefined;
  }

  return usage as Record<string, unknown>;
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return typeof error === "string" ? error : "";
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function isPresent<T>(value: T | null): value is T {
  return value !== null;
}

function joinUrl(baseUrl: string, path: string): string {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(path, normalizedBase).toString();
}

export default seedreamProviderPlugin;
