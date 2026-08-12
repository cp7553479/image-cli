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
  ProviderOperation,
  ProviderPlugin
} from "../types.js";
import { getBuiltInProviderAliases } from "../identity.js";
import {
  aspectRatioFromOpenAIImageSize,
  collectOpenAIImageRequestFields
} from "../openai-image-options.js";
import {
  assertSuccessfulResponse,
  parseJsonBody as parseProviderJsonBody
} from "../response.js";
import { resolveImage, resolveImages } from "../image-input.js";

/** Gemini API 默认基地址。 */
const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const SYNTHID_WARNING = "Gemini-generated images are SynthID watermarked.";

type GeminiInlineDataPart = {
  inlineData?: {
    mimeType?: string;
    data?: string;
  };
};

type GeminiResponse = {
  usageMetadata?: Record<string, unknown>;
  candidates?: Array<{
    content?: {
      parts?: GeminiInlineDataPart[];
    };
    usageMetadata?: Record<string, unknown>;
  }>;
};

/**
 * geminiProvider 的导出入口。
 */
export const geminiProvider: ProviderPlugin = {
  providerId: "gemini",
  aliases: getBuiltInProviderAliases("gemini"),
  capabilities: {
    generate: true,
    edit: true,
    asyncTasks: true,
    streaming: false,
    background: false,
    multipleOutputs: false,
    transparentOutput: false
  },
  async buildGenerateOperation(input: ProviderGenerateContext): Promise<ProviderOperation> {
    const request = await buildGeminiGenerateRequest(input);
    return {
      request
    };
  },
  async parseGenerateResponse(
    result: CurlExecutionResult,
    input: ProviderGenerateContext
  ): Promise<GenerateResult> {
    const payload = parseJsonResponse(result.bodyText, result.statusCode >= 400);
    assertSuccessfulResponse("Gemini", result, payload);

    const candidate = payload.candidates?.[0];
    const parts = candidate?.content?.parts ?? [];
    const images = parts
      .map((part) => extractInlineImage(part))
      .filter((part): part is NonNullable<ReturnType<typeof extractInlineImage>> => Boolean(part))
      .map((image) => ({
        mimeType: image.mimeType,
        dataBase64: image.dataBase64
      }));

    return {
      providerId: "gemini",
      modelId: input.request.model.modelId,
      images,
      warnings: [SYNTHID_WARNING],
      raw: payload,
      usage: payload.usageMetadata ?? candidate?.usageMetadata
    };
  },
  classifyFailure(context: ProviderErrorContext): FailureClassification {
    const statusCode = context.response?.statusCode ?? 0;

    if (statusCode === 400) {
      return {
        kind: "non-retryable-request",
        reason: "Gemini rejected the request with HTTP 400."
      };
    }

    if (statusCode === 401 || statusCode === 403 || statusCode === 429) {
      return {
        kind: "retryable-credential",
        reason: `Gemini rejected credentials with HTTP ${statusCode}.`
      };
    }

    if (statusCode >= 500 && statusCode <= 599) {
      return {
        kind: "retryable-transport",
        reason: `Gemini returned HTTP ${statusCode}.`
      };
    }

    return {
      kind: "unknown",
      reason: context.error instanceof Error ? context.error.message : "Unknown Gemini failure."
    };
  }
};

export default geminiProvider;

/** 将标准化请求映射为 Gemini generateContent 请求。 */
async function buildGeminiGenerateRequest(input: ProviderGenerateContext): Promise<CurlRequest> {
  const baseUrl = normalizeBaseUrl(input.providerConfig.apiBaseUrl);
  const modelId = encodeURIComponent(input.request.model.modelId);
  const parts = await buildGeminiParts(input.request);

  return {
    method: "POST",
    url: `${baseUrl}/models/${modelId}:generateContent`,
    headers: {
      "x-goog-api-key": input.credential.value
    },
    json: {
      ...(input.request.extra ?? {}),
      contents: [
        {
          role: "user",
          parts
        }
      ],
      generationConfig: buildGenerationConfig(input.request)
    },
    timeoutMs: input.providerConfig.timeoutMs
  };
}

async function buildGeminiParts(
  request: GenerateRequest
): Promise<Array<Record<string, unknown>>> {
  const parts: Array<Record<string, unknown>> = [{ text: request.prompt }];

  if (request.mask) {
    // Gemini 无原生蒙版概念，但允许参考图先于 mask 拼接。
    const resolved = await resolveImage(request.mask);
    parts.push({ inlineData: toInlineData(resolved) });
  }

  if (request.reference_images && request.reference_images.length > 0) {
    const images = await resolveImages(request.reference_images);
    for (const image of images) {
      parts.push({ inlineData: toInlineData(image) });
    }
  }

  return parts;
}

function toInlineData(image: { base64: string; mimeType: string }): {
  mimeType: string;
  data: string;
} {
  return { mimeType: image.mimeType, data: image.base64 };
}

function buildGenerationConfig(request: GenerateRequest): Record<string, unknown> {
  const generationConfig: Record<string, unknown> = {
    ...getRecord(request.extra?.generationConfig),
    ...collectOpenAIImageRequestFields(request, {
      includeSize: false
    }),
    responseModalities: ["Image"]
  };

  const aspectRatio = aspectRatioFromOpenAIImageSize(request.size);
  if (aspectRatio) {
    generationConfig.responseFormat = {
      image: {
        aspectRatio
      }
    };
  }

  return generationConfig;
}

function getRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim();
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed || DEFAULT_BASE_URL;
}

function parseJsonResponse(bodyText: string, tolerateInvalid = false): GeminiResponse {
  return parseProviderJsonBody<GeminiResponse>("Gemini", bodyText, {
    allowEmpty: tolerateInvalid,
    tolerateInvalid
  });
}

function extractInlineImage(part: GeminiInlineDataPart | undefined): {
  mimeType?: string;
  dataBase64?: string;
} | null {
  // Gemini REST returns camelCase inlineData/mimeType; confirmed against the live API.
  if (!part?.inlineData?.data) {
    return null;
  }

  return {
    mimeType: part.inlineData.mimeType,
    dataBase64: part.inlineData.data
  };
}
