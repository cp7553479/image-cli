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
import { resolveImages } from "../image-input.js";

const DEFAULT_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";
const TEMPORARY_URL_WARNING = "Temporary URL; expires in 24 hours.";

/**
 * volcengineProviderPlugin 的导出入口。
 */
export const volcengineProviderPlugin: ProviderPlugin = {
  providerId: "volcengine",
  aliases: getBuiltInProviderAliases("volcengine"),
  capabilities: {
    generate: true,
    edit: true,
    asyncTasks: false,
    streaming: true,
    background: false,
    multipleOutputs: true,
    transparentOutput: false
  },
  async buildGenerateOperation(input: ProviderGenerateContext): Promise<ProviderOperation> {
    const requestBody = await buildRequestBody(input);

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
    assertSuccessfulResponse("Volcengine", result, payload);

    const items = extractResponseItems(payload);

    const images = items.map(mapImageResult).filter(isPresent);
    const warnings = unique(
      images.flatMap((image) => image.warnings ?? [])
    );

    return {
      providerId: "volcengine",
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
        reason: message || "Volcengine rejected the request body."
      };
    }

    if (statusCode === 401 || statusCode === 403 || statusCode === 429) {
      return {
        kind: "retryable-credential",
        reason: message || `Volcengine returned HTTP ${statusCode}.`
      };
    }

    if (typeof statusCode === "number" && statusCode >= 500) {
      return {
        kind: "retryable-transport",
        reason: message || `Volcengine returned HTTP ${statusCode}.`
      };
    }

    if (statusCode !== undefined && statusCode >= 400) {
      return {
        kind: "non-retryable-request",
        reason: message || `Volcengine returned HTTP ${statusCode}.`
      };
    }

    return {
      kind: "unknown",
      reason: message || "Volcengine failure classification was inconclusive."
    };
  }
};

async function buildRequestBody(input: ProviderGenerateContext): Promise<Record<string, unknown>> {
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

  const referenceImages = input.request.reference_images;
  if (referenceImages && referenceImages.length > 0) {
    body.image = await resolveVolcengineReferenceImages(referenceImages);
  }

  return body;
}

/**
 * 火山方舟 image 字段接受 URL 或 base64；本地文件/远程 URL 统一解析。
 * 多图融合传字符串数组，单图传字符串。
 */
async function resolveVolcengineReferenceImages(
  referenceImages: NonNullable<ProviderGenerateContext["request"]["reference_images"]>
): Promise<string | string[]> {
  const images = await resolveImages(referenceImages);
  const dataUrls = images.map((image) => `data:${image.mimeType};base64,${image.base64}`);
  return dataUrls.length > 1 ? dataUrls : dataUrls[0];
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
  // Volcengine always returns { data: [...] }; confirmed against the live API.
  if (payload && typeof payload === "object" && Array.isArray((payload as { data?: unknown }).data)) {
    return (payload as { data: unknown[] }).data;
  }
  return [];
}

function mapImageResult(item: unknown): ProviderImageResult | null {
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

  const base64Data = readString(record.b64_json);
  if (base64Data) {
    return {
      output_format: "b64_json",
      dataBase64: base64Data
    };
  }

  return null;
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

export default volcengineProviderPlugin;
