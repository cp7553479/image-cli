import type {
  GenerateRequest,
  ProviderCapabilities
} from "../../protocol/request.js";
import type { CurlExecutionResult, CurlRequest } from "../../transport/curl.js";
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
  aspectRatioFromOpenAIImageSize,
  collectOpenAIImageRequestFields,
  parseOpenAIImageSize
} from "../openai-image-options.js";
import { assertSuccessfulResponse } from "../response.js";
import { resolveImageToDataUrl } from "../image-input.js";

const MINIMAX_API_BASE_URL = "https://api.minimax.io/v1";
const TEMPORARY_URL_WARNING =
  "MiniMax image URLs expire after 24 hours. Download them promptly.";
const DEFAULT_RESPONSE_FORMAT = "url";

const RETRYABLE_CREDENTIAL_CODES = new Set([401, 403, 429, 1004, 1008, 2049]);

const CAPABILITIES: ProviderCapabilities = {
  generate: true,
  edit: true,
  asyncTasks: false,
  streaming: false,
  background: false,
  multipleOutputs: true,
  transparentOutput: false
};

/**
 * minimaxProviderPlugin 的导出入口。
 */
export const minimaxProviderPlugin: ProviderPlugin = {
  providerId: "minimax",
  aliases: getBuiltInProviderAliases("minimax"),
  capabilities: CAPABILITIES,
  async buildGenerateOperation(input: ProviderGenerateContext): Promise<ProviderOperation> {
    return {
      request: await buildGenerateRequest(input)
    };
  },
  async parseGenerateResponse(
    result: CurlExecutionResult,
    input: ProviderGenerateContext
  ): Promise<GenerateResult> {
    const body = parseJsonBody(result.bodyText, result.statusCode >= 400);
    assertSuccessfulResponse("MiniMax", result, body);

    const baseRespStatusCode = getNumber(body, ["base_resp", "status_code"]);
    const images = parseImages(body, input.request);
    const warnings = [...new Set(images.flatMap((image) => image.warnings ?? []))];

    if (baseRespStatusCode && baseRespStatusCode !== 0) {
      throw new Error(
        `MiniMax request failed with base_resp.status_code=${baseRespStatusCode}.`
      );
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
    const baseRespStatusCode = getNumber(body, ["base_resp", "status_code"]);

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

/**
 * buildGenerateRequest 的导出入口。
 */
export async function buildGenerateRequest(
  input: ProviderGenerateContext
): Promise<CurlRequest> {
  const baseUrl = input.providerConfig.apiBaseUrl || MINIMAX_API_BASE_URL;
  const payload = await buildRequestPayload(input.request);

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

/**
 * buildRequestPayload 的导出入口。
 */
export async function buildRequestPayload(
  request: GenerateRequest
): Promise<Record<string, unknown>> {
  const payload: Record<string, unknown> = {
    ...(request.extra ?? {}),
    ...collectOpenAIImageRequestFields(request, {
      includeModelAndPrompt: true,
      includeSize: false
    }),
    response_format: resolveResponseFormat(request.response_format)
  };

  const dimensions = parseOpenAIImageSize(request.size);
  const aspectRatio = aspectRatioFromOpenAIImageSize(request.size);
  if (dimensions && aspectRatio) {
    payload.aspect_ratio = aspectRatio;
    payload.width = dimensions.width;
    payload.height = dimensions.height;
  }

  if (typeof request.n === "number") {
    payload.n = request.n;
  }

  if (request.reference_images && request.reference_images.length > 0) {
    payload.subject_reference = await buildSubjectReference(request.reference_images);
  }

  return payload;
}

/**
 * 参考图映射为 MiniMax 的 subject_reference（按图生图文档，type 固定 character，image_file 接受 URL 或 data URL）。
 */
async function buildSubjectReference(
  referenceImages: NonNullable<GenerateRequest["reference_images"]>
): Promise<Array<{ type: string; image_file: string }>> {
  const dataUrls = await Promise.all(
    referenceImages.map((image) => resolveImageToDataUrl(image))
  );
  return dataUrls.map((dataUrl) => ({ type: "character", image_file: dataUrl }));
}

/**
 * parseGenerateResultImages 的导出入口。
 */
export function parseGenerateResultImages(
  body: unknown,
  request: GenerateRequest
): ProviderImageResult[] {
  const data = getRecord(body, ["data"]);
  const urlOutputs = getStringArray(data, ["image_urls"]);
  if (urlOutputs.length > 0) {
    return urlOutputs.map((url) => ({
      output_format: "url",
      url,
      warnings: [TEMPORARY_URL_WARNING]
    }));
  }

  const base64Outputs = getStringArray(data, ["image_base64"]);
  if (base64Outputs.length > 0) {
    return base64Outputs.map((base64Data, index) => ({
      output_format: "base64",
      mimeType: inferMimeType(request.output_format),
      fileName: buildFileName(index, request.output_format),
      dataBase64: base64Data
    }));
  }

  return [];
}

/**
 * parseImages 的导出入口。
 */
export function parseImages(
  body: unknown,
  request: GenerateRequest
): ProviderImageResult[] {
  return parseGenerateResultImages(body, request);
}

function resolveResponseFormat(value?: GenerateRequest["response_format"]): string {
  if (value === "b64_json") {
    return "base64";
  }
  if (value === "url") {
    return value;
  }
  return DEFAULT_RESPONSE_FORMAT;
}

function inferMimeType(output_format?: GenerateRequest["output_format"]): string {
  switch (output_format) {
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "jpeg":
    default:
      return "image/jpeg";
  }
}

function buildFileName(index: number, output_format?: GenerateRequest["output_format"]): string {
  const extension =
    output_format === "png"
      ? "png"
      : output_format === "webp"
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
