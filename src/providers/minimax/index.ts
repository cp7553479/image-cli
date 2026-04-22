import type {
  GenerateRequest,
  ProviderCapabilities
} from "../../protocol/request.js";
import type { CurlExecutionResult, CurlRequest } from "../../transport/curl.js";
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

const MINIMAX_API_BASE_URL = "https://api.minimax.io/v1";
const TEMPORARY_URL_WARNING =
  "MiniMax image URLs expire after 24 hours. Download them promptly.";
const DEFAULT_RESPONSE_FORMAT = "url";
const DEFAULT_PROMPT_OPTIMIZER = false;

const RETRYABLE_CREDENTIAL_CODES = new Set([401, 403, 429, 1004, 1008, 2049]);

const CAPABILITIES: ProviderCapabilities = {
  generate: true,
  edit: true,
  inputImages: true,
  asyncTasks: false,
  streaming: false,
  background: false,
  negativePrompt: false,
  multipleOutputs: true,
  transparentOutput: false
};

export const minimaxProviderPlugin: ProviderPlugin = {
  providerId: "minimax",
  aliases: ["minimax", "minimax-image"],
  capabilities: CAPABILITIES,
  async buildGenerateOperation(input: ProviderGenerateContext): Promise<ProviderOperation> {
    return {
      request: buildGenerateRequest(input)
    };
  },
  async parseGenerateResponse(
    result: CurlExecutionResult,
    input: ProviderGenerateContext
  ): Promise<GenerateResult> {
    const body = parseJsonBody(result.bodyText);
    const baseRespStatusCode = getNumber(
      body,
      ["base_resp", "status_code"],
      getNumber(body, ["status_code"])
    );
    const images = parseImages(body, input.request, input.preparedImages);
    const warnings = [...new Set(images.flatMap((image) => image.warnings ?? []))];

    if (baseRespStatusCode && baseRespStatusCode !== 0) {
      throw new Error(
        `MiniMax request failed with base_resp.status_code=${baseRespStatusCode}.`
      );
    }

    if (result.statusCode >= 400) {
      throw new Error(`MiniMax request failed with HTTP ${result.statusCode}.`);
    }

    return {
      providerId: "minimax",
      modelId: input.request.model.modelId,
      images,
      warnings,
      raw: body
    };
  },
  classifyFailure(context: ProviderErrorContext): FailureClassification {
    const response = context.response;
    if (!response) {
      return {
        kind: "unknown",
        reason: describeError(context.error)
      };
    }

    const body = parseJsonBody(response.bodyText, true);
    const baseRespStatusCode = getNumber(
      body,
      ["base_resp", "status_code"],
      getNumber(body, ["status_code"])
    );

    if (isRetryableCredentialStatus(response.statusCode, baseRespStatusCode)) {
      return {
        kind: "retryable-credential",
        reason: describeFailure(response.statusCode, baseRespStatusCode)
      };
    }

    if (response.statusCode === 400 || (baseRespStatusCode && baseRespStatusCode !== 0)) {
      return {
        kind: "non-retryable-request",
        reason: describeFailure(response.statusCode, baseRespStatusCode)
      };
    }

    if (response.statusCode >= 500) {
      return {
        kind: "retryable-transport",
        reason: describeFailure(response.statusCode, baseRespStatusCode)
      };
    }

    return {
      kind: "unknown",
      reason: describeFailure(response.statusCode, baseRespStatusCode)
    };
  }
};

export function buildGenerateRequest(input: ProviderGenerateContext): CurlRequest {
  const baseUrl = input.providerConfig.apiBaseUrl || MINIMAX_API_BASE_URL;
  const payload = buildRequestPayload(input.request, input.preparedImages);

  return {
    method: "POST",
    url: `${baseUrl.replace(/\/+$/, "")}/image_generation`,
    headers: {
      Authorization: `Bearer ${input.credential.value}`
    },
    json: payload,
    timeoutMs: input.providerConfig.timeoutMs
  };
}

export function buildRequestPayload(
  request: GenerateRequest,
  preparedImages: PreparedImageInput[]
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    model: request.model.modelId,
    prompt: request.prompt,
    response_format: resolveResponseFormat(request.extra),
    prompt_optimizer: resolvePromptOptimizer(request.extra)
  };

  const normalizedSize = request.normalizedSize;
  if (normalizedSize) {
    payload.aspect_ratio = normalizedSize.aspectRatio;
    payload.width = normalizedSize.width;
    payload.height = normalizedSize.height;
  } else if (request.aspectRatio) {
    payload.aspect_ratio = request.aspectRatio;
  }

  if (typeof request.seed === "number") {
    payload.seed = request.seed;
  }

  if (typeof request.count === "number") {
    payload.n = request.count;
  }

  const subjectReference = buildSubjectReference(preparedImages);
  if (subjectReference.length > 0) {
    payload.subject_reference = subjectReference;
  }

  const passthroughExtra = filterExtraFields(request.extra);
  return {
    ...passthroughExtra,
    ...payload
  };
}

export function buildSubjectReference(preparedImages: PreparedImageInput[]): Array<{
  type: "character";
  image_file: string;
}> {
  return preparedImages.map((image) => ({
    type: "character",
    image_file:
      image.kind === "url"
        ? image.url
        : `data:${image.mimeType};base64,${image.base64Data}`
  }));
}

export function parseGenerateResultImages(
  body: unknown,
  request: GenerateRequest
): ProviderImageResult[] {
  const data = getRecord(body, ["data"]);
  const urlOutputs = getStringArray(data, ["image_urls"]);
  if (urlOutputs.length > 0) {
    return urlOutputs.map((url) => ({
      outputFormat: "url",
      url,
      warnings: [TEMPORARY_URL_WARNING]
    }));
  }

  const base64Outputs = getStringArray(data, ["image_base64"]);
  if (base64Outputs.length > 0) {
    return base64Outputs.map((base64Data, index) => ({
      outputFormat: "base64",
      mimeType: inferMimeType(request.outputFormat),
      fileName: buildFileName(index, request.outputFormat),
      dataBase64: base64Data
    }));
  }

  return [];
}

export function parseImages(
  body: unknown,
  request: GenerateRequest,
  preparedImages: PreparedImageInput[]
): ProviderImageResult[] {
  void preparedImages;
  return parseGenerateResultImages(body, request);
}

function resolveResponseFormat(extra?: Record<string, unknown>): string {
  const value = extra?.response_format;
  if (value === "url" || value === "base64") {
    return value;
  }
  return DEFAULT_RESPONSE_FORMAT;
}

function resolvePromptOptimizer(extra?: Record<string, unknown>): boolean {
  const value = extra?.prompt_optimizer;
  if (typeof value === "boolean") {
    return value;
  }
  return DEFAULT_PROMPT_OPTIMIZER;
}

function filterExtraFields(extra?: Record<string, unknown>): Record<string, unknown> {
  if (!extra) {
    return {};
  }

  const blockedKeys = new Set([
    "model",
    "prompt",
    "aspect_ratio",
    "width",
    "height",
    "response_format",
    "prompt_optimizer",
    "seed",
    "n",
    "subject_reference"
  ]);

  return Object.fromEntries(
    Object.entries(extra).filter(([key]) => !blockedKeys.has(key))
  );
}

function inferMimeType(outputFormat?: "png" | "jpeg" | "webp"): string {
  switch (outputFormat) {
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "jpeg":
    default:
      return "image/jpeg";
  }
}

function buildFileName(index: number, outputFormat?: "png" | "jpeg" | "webp"): string {
  const extension =
    outputFormat === "png"
      ? "png"
      : outputFormat === "webp"
        ? "webp"
        : "jpeg";
  return `minimax-${index + 1}.${extension}`;
}

function parseJsonBody(bodyText: string, tolerateErrors = false): unknown {
  if (!bodyText.trim()) {
    if (tolerateErrors) {
      return {};
    }
    throw new Error("MiniMax response body was empty.");
  }

  try {
    return JSON.parse(bodyText) as unknown;
  } catch (error) {
    if (tolerateErrors) {
      return {};
    }
    throw new Error(`MiniMax response was not valid JSON: ${describeError(error)}`);
  }
}

function getRecord(body: unknown, path: string[]): Record<string, unknown> {
  let current: unknown = body;
  for (const key of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return {};
    }
    current = (current as Record<string, unknown>)[key];
  }
  if (!current || typeof current !== "object" || Array.isArray(current)) {
    return {};
  }
  return current as Record<string, unknown>;
}

function getStringArray(body: Record<string, unknown>, path: string[]): string[] {
  let current: unknown = body;
  for (const key of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return [];
    }
    current = (current as Record<string, unknown>)[key];
  }
  if (!Array.isArray(current)) {
    return [];
  }
  return current.filter((value): value is string => typeof value === "string");
}

function getNumber(body: unknown, path: string[], fallback?: number): number | undefined {
  let current: unknown = body;
  for (const key of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return fallback;
    }
    current = (current as Record<string, unknown>)[key];
  }
  if (typeof current === "number" && Number.isFinite(current)) {
    return current;
  }
  if (typeof current === "string") {
    const parsed = Number(current);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

function isRetryableCredentialStatus(
  statusCode: number,
  baseRespStatusCode?: number
): boolean {
  if (RETRYABLE_CREDENTIAL_CODES.has(statusCode)) {
    return true;
  }
  return baseRespStatusCode !== undefined && RETRYABLE_CREDENTIAL_CODES.has(baseRespStatusCode);
}

function describeFailure(statusCode: number, baseRespStatusCode?: number): string {
  if (baseRespStatusCode !== undefined) {
    return `MiniMax HTTP ${statusCode}, base_resp.status_code=${baseRespStatusCode}`;
  }
  return `MiniMax HTTP ${statusCode}`;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default minimaxProviderPlugin;
