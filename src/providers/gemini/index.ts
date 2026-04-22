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
  ProviderOperation,
  ProviderPlugin
} from "../types.js";

const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const SYNTHID_WARNING = "Gemini-generated images are SynthID watermarked.";

type GeminiInlineDataPart = {
  inlineData?: GeminiInlineData;
  inline_data?: GeminiInlineData;
};

type GeminiInlineData = {
  mimeType?: string;
  mime_type?: string;
  data?: string;
};

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: GeminiInlineDataPart[];
    };
    usageMetadata?: Record<string, unknown>;
  }>;
};

export const geminiProvider: ProviderPlugin = {
  providerId: "gemini",
  aliases: ["gemini", "nano-banana"],
  capabilities: {
    generate: true,
    edit: true,
    inputImages: true,
    asyncTasks: true,
    streaming: false,
    background: false,
    negativePrompt: false,
    multipleOutputs: false,
    transparentOutput: false
  },
  async buildGenerateOperation(input: ProviderGenerateContext): Promise<ProviderOperation> {
    const request = buildGeminiGenerateRequest(input);
    return {
      request
    };
  },
  async parseGenerateResponse(
    result: CurlExecutionResult,
    input: ProviderGenerateContext
  ): Promise<GenerateResult> {
    const payload = parseJsonResponse(result.bodyText);
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
      usage: candidate?.usageMetadata
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

function buildGeminiGenerateRequest(input: ProviderGenerateContext): CurlRequest {
  const baseUrl = normalizeBaseUrl(input.providerConfig.apiBaseUrl);
  const modelId = encodeURIComponent(input.request.model.modelId);
  const parts = buildGeminiParts(input.request, input.preparedImages);

  return {
    method: "POST",
    url: `${baseUrl}/models/${modelId}:generateContent`,
    headers: {
      "x-goog-api-key": input.credential.value
    },
    json: {
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

function buildGeminiParts(
  request: GenerateRequest,
  preparedImages: PreparedImageInput[]
): Array<Record<string, unknown>> {
  const parts: Array<Record<string, unknown>> = [
    {
      text: request.prompt
    }
  ];

  for (const image of preparedImages) {
    if (image.kind === "url") {
      throw new Error(
        "Gemini provider does not accept prepared image urls in this implementation."
      );
    }

    parts.push({
      inlineData: {
        mimeType: image.mimeType,
        data: image.base64Data
      }
    });
  }

  return parts;
}

function buildGenerationConfig(request: GenerateRequest): Record<string, unknown> {
  const generationConfig: Record<string, unknown> = {
    responseModalities: ["IMAGE"]
  };

  if (request.aspectRatio) {
    generationConfig.imageConfig = {
      aspectRatio: request.aspectRatio
    };
  }

  return generationConfig;
}

function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim();
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed || DEFAULT_BASE_URL;
}

function parseJsonResponse(bodyText: string): GeminiResponse {
  try {
    return JSON.parse(bodyText) as GeminiResponse;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse Gemini response JSON. ${message}`);
  }
}

function extractInlineImage(part: GeminiInlineDataPart | undefined): {
  mimeType?: string;
  dataBase64?: string;
} | null {
  if (!part) {
    return null;
  }

  const inlineData = "inlineData" in part
    ? part.inlineData
    : "inline_data" in part
      ? part.inline_data
      : undefined;
  if (!inlineData?.data) {
    return null;
  }

  if ("mimeType" in inlineData) {
    return {
      mimeType: inlineData.mimeType,
      dataBase64: inlineData.data
    };
  }

  return {
    mimeType: inlineData.mime_type,
    dataBase64: inlineData.data
  };
}
