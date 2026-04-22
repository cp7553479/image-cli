import type {
  ProviderErrorContext,
  ProviderGenerateContext,
  ProviderImageResult,
  ProviderOperation,
  ProviderPlugin
} from "../types.js";
import type { CurlExecutionResult } from "../../transport/curl.js";

const DEFAULT_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";
const TEMPORARY_URL_WARNING = "Temporary URL; expires in 24 hours.";

export const seedreamProviderPlugin: ProviderPlugin = {
  providerId: "seedream",
  aliases: ["seedream", "doubao-seedream", "doubao-seedream-4.0", "doubao-seedream-4.5"],
  capabilities: {
    generate: true,
    edit: false,
    inputImages: true,
    asyncTasks: false,
    streaming: true,
    background: false,
    negativePrompt: false,
    multipleOutputs: true,
    transparentOutput: false
  },
  async buildGenerateOperation(input: ProviderGenerateContext): Promise<ProviderOperation> {
    const extra = normalizeExtra(input.request.extra);
    const requestBody = buildRequestBody(input, extra);

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
    const payload = parsePayload(result.bodyText);
    const items = extractResponseItems(payload);

    if (result.statusCode < 200 || result.statusCode >= 300) {
      throw new Error(buildFailureMessage(result, payload));
    }

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

function buildRequestBody(
  input: ProviderGenerateContext,
  extra: Record<string, unknown>
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: input.request.model.modelId,
    prompt: input.request.prompt
  };

  if (input.request.size) {
    body.size = input.request.size;
  }

  const responseFormat = readString(extra.response_format) ?? "url";
  body.response_format = responseFormat;

  const stream = readBoolean(extra.stream) ?? input.request.stream ?? false;
  body.stream = stream;

  const watermark = readBoolean(extra.watermark);
  body.watermark = watermark ?? true;

  const referenceImages = prepareReferenceImages(input.preparedImages);
  if (referenceImages.length > 0) {
    body.reference_images = referenceImages;
  }

  const sequentialMode = readString(extra.sequential_image_generation);
  const sequentialOptions = readObject(extra.sequential_image_generation_options);
  if (input.request.count && input.request.count > 1) {
    body.sequential_image_generation = "auto";
    body.sequential_image_generation_options = {
      ...(sequentialOptions ?? {}),
      max_images: input.request.count
    };
  } else if (sequentialMode || sequentialOptions) {
    if (sequentialMode) {
      body.sequential_image_generation = sequentialMode;
    }
    if (sequentialOptions) {
      body.sequential_image_generation_options = sequentialOptions;
    }
  }

  const optimizePromptOptions = readObject(extra.optimize_prompt_options);
  if (optimizePromptOptions) {
    body.optimize_prompt_options = optimizePromptOptions;
  }

  return body;
}

function prepareReferenceImages(
  preparedImages: ProviderGenerateContext["preparedImages"]
): string[] {
  return preparedImages.map((image) => {
    if (image.kind === "url") {
      return image.url;
    }

    return `data:${image.mimeType};base64,${image.base64Data}`;
  });
}

function parsePayload(bodyText: string): unknown {
  const trimmed = bodyText.trim();
  if (!trimmed) {
    return {};
  }

  if (!trimmed.startsWith("data:")) {
    return JSON.parse(trimmed) as unknown;
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
  return JSON.parse(lastDataLine) as unknown;
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
        outputFormat: "b64_json",
        mimeType: parsed.mimeType,
        dataBase64: parsed.base64Data
      };
    }

    return {
      outputFormat: "url",
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
      outputFormat: "url",
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
      outputFormat: "b64_json",
      mimeType: readString(record.mime_type) ?? readString(record.mimeType),
      dataBase64: base64Data
    };
  }

  const dataUrl = readString(record.data_url) ?? readString(record.dataUrl);
  if (dataUrl) {
    const parsed = parseDataUrl(dataUrl);
    return {
      outputFormat: "b64_json",
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

function buildFailureMessage(result: CurlExecutionResult, payload: unknown): string {
  const responseMessage = extractResponseMessage(payload);
  if (responseMessage) {
    return `Seedream request failed with HTTP ${result.statusCode}: ${responseMessage}`;
  }

  return `Seedream request failed with HTTP ${result.statusCode}.`;
}

function extractResponseMessage(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }

  const record = payload as Record<string, unknown>;
  return (
    readString(record.message) ??
    readString(record.error) ??
    readString(record.detail) ??
    readString(record.msg)
  );
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return typeof error === "string" ? error : "";
}

function normalizeExtra(extra: Record<string, unknown> | undefined): Record<string, unknown> {
  return extra ?? {};
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function readObject(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, unknown>;
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
