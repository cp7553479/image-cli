import type { GenerateRequest } from "../../protocol/request.js";
import type { CurlExecutionResult } from "../../transport/curl.js";
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
  openRouterImageSizeFromOpenAIImageSize
} from "../openai-image-options.js";
import {
  assertSuccessfulResponse,
  parseJsonBody as parseProviderJsonBody
} from "../response.js";
import { resolveImageToDataUrl } from "../image-input.js";

const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";
const CHAT_COMPLETIONS_PATH = "/chat/completions";

type OpenRouterImagePayload = {
  image_url?: { url?: string };
  imageUrl?: { url?: string };
};

type OpenRouterResponse = {
  choices?: Array<{
    message?: {
      images?: OpenRouterImagePayload[];
    };
  }>;
};

/**
 * openrouterProviderPlugin 的导出入口。
 */
export const openrouterProviderPlugin: ProviderPlugin = {
  providerId: "openrouter",
  aliases: getBuiltInProviderAliases("openrouter"),
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
    return {
      request: {
        method: "POST",
        url: `${normalizeBaseUrl(input.providerConfig.apiBaseUrl)}${CHAT_COMPLETIONS_PATH}`,
        headers: {
          Authorization: `Bearer ${input.credential.value}`,
          "Content-Type": "application/json"
        },
        json: {
          ...(input.request.extra ?? {}),
          ...collectOpenAIImageRequestFields(input.request, {
            includeSize: false
          }),
          model: input.request.model.modelId,
          messages: [
            {
              role: "user",
              content: await buildMessageContent(input.request)
            }
          ],
          modalities: ["image", "text"],
          image_config: buildImageConfig(input.request)
        },
        timeoutMs: input.providerConfig.timeoutMs,
        stream: input.request.stream
      }
    };
  },
  async parseGenerateResponse(
    result: CurlExecutionResult,
    input: ProviderGenerateContext
  ): Promise<GenerateResult> {
    const payload = parseJsonResponse(result.bodyText, result.statusCode >= 400);
    assertSuccessfulResponse("OpenRouter", result, payload);

    const images = (payload.choices?.[0]?.message?.images ?? [])
      .map((image) => parseImageResult(image))
      .filter((image): image is ProviderImageResult => Boolean(image));

    return {
      providerId: "openrouter",
      modelId: input.request.model.modelId,
      images,
      warnings: [],
      raw: payload
    };
  },
  classifyFailure(context: ProviderErrorContext): FailureClassification {
    const statusCode = context.response?.statusCode ?? 0;

    if (statusCode === 400) {
      return {
        kind: "non-retryable-request",
        reason: "OpenRouter rejected the request with HTTP 400."
      };
    }

    if (statusCode === 401 || statusCode === 402 || statusCode === 403 || statusCode === 429) {
      return {
        kind: "retryable-credential",
        reason: `OpenRouter rejected credentials with HTTP ${statusCode}.`
      };
    }

    if (statusCode >= 500 && statusCode <= 599) {
      return {
        kind: "retryable-transport",
        reason: `OpenRouter returned HTTP ${statusCode}.`
      };
    }

    return {
      kind: "unknown",
      reason: context.error instanceof Error ? context.error.message : "Unknown OpenRouter failure."
    };
  }
};

function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return DEFAULT_BASE_URL;
  }
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

/**
 * 构造 chat completions 的 message content：
 * 有参考图时用多模态数组（text + image_url），无参考图时用纯字符串以保持兼容。
 */
async function buildMessageContent(
  request: GenerateRequest
): Promise<string | Array<Record<string, unknown>>> {
  const referenceImages = request.reference_images;
  if (!referenceImages || referenceImages.length === 0) {
    return request.prompt;
  }

  const dataUrls = await Promise.all(
    referenceImages.map((image) => resolveImageToDataUrl(image))
  );
  const content: Array<Record<string, unknown>> = [{ type: "text", text: request.prompt }];
  for (const dataUrl of dataUrls) {
    content.push({ type: "image_url", image_url: { url: dataUrl } });
  }
  return content;
}

function buildImageConfig(request: GenerateRequest): Record<string, unknown> | undefined {
  const imageConfig: Record<string, unknown> = {
    ...getRecord(request.extra?.image_config)
  };
  const aspectRatio = aspectRatioFromOpenAIImageSize(request.size);
  if (aspectRatio) {
    imageConfig.aspect_ratio = aspectRatio;
  }

  const imageSize = openRouterImageSizeFromOpenAIImageSize(request.size);
  if (imageSize) {
    imageConfig.image_size = imageSize;
  }

  return Object.keys(imageConfig).length > 0 ? imageConfig : undefined;
}

function getRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function parseJsonResponse(
  bodyText: string,
  tolerateInvalid = false
): OpenRouterResponse {
  return parseProviderJsonBody<OpenRouterResponse>("OpenRouter", bodyText, {
    allowEmpty: tolerateInvalid,
    tolerateInvalid
  });
}

function parseImageResult(image: OpenRouterImagePayload): ProviderImageResult | null {
  const url = image.image_url?.url ?? image.imageUrl?.url;
  if (!url) {
    return null;
  }

  if (url.startsWith("data:")) {
    const parsed = parseDataUrl(url);
    return {
      mimeType: parsed.mimeType,
      output_format: inferOutputFormat(parsed.mimeType),
      dataBase64: parsed.base64Data
    };
  }

  return {
    url,
    warnings: ["OpenRouter returned an external image URL."]
  };
}

function parseDataUrl(value: string): {
  mimeType: string;
  base64Data: string;
} {
  const match = value.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error("Invalid data URL in OpenRouter image response.");
  }

  return {
    mimeType: match[1]!,
    base64Data: match[2]!
  };
}

function inferOutputFormat(mimeType: string): string {
  if (mimeType === "image/jpeg") {
    return "jpeg";
  }
  if (mimeType === "image/webp") {
    return "webp";
  }
  return "png";
}

export default openrouterProviderPlugin;
