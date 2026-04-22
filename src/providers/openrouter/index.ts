import type { GenerateRequest } from "../../protocol/request.js";
import type { CurlExecutionResult } from "../../transport/curl.js";
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

export const openrouterProviderPlugin: ProviderPlugin = {
  providerId: "openrouter",
  aliases: ["openrouter", "openrouter-image"],
  capabilities: {
    generate: true,
    edit: true,
    inputImages: true,
    asyncTasks: false,
    streaming: true,
    background: false,
    negativePrompt: false,
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
          model: input.request.model.modelId,
          messages: [
            {
              role: "user",
              content: buildContent(input.request, input.preparedImages)
            }
          ],
          modalities: ["image", "text"],
          image_config: buildImageConfig(input.request),
          ...(input.request.extra ?? {})
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
    const payload = parseJsonResponse(result.bodyText);
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

function buildContent(
  request: GenerateRequest,
  preparedImages: PreparedImageInput[]
): string | Array<Record<string, unknown>> {
  if (preparedImages.length === 0) {
    return request.prompt;
  }

  return [
    {
      type: "text",
      text: request.prompt
    },
    ...preparedImages.map((image) => ({
      type: "image_url",
      image_url: {
        url:
          image.kind === "url"
            ? image.url
            : `data:${image.mimeType};base64,${image.base64Data}`
      }
    }))
  ];
}

function buildImageConfig(request: GenerateRequest): Record<string, unknown> | undefined {
  const imageConfig: Record<string, unknown> = {};
  const aspectRatio = request.normalizedSize?.aspectRatio ?? request.aspectRatio;
  if (aspectRatio) {
    imageConfig.aspect_ratio = aspectRatio;
  }

  const imageSize = resolveImageSize(request);
  if (imageSize) {
    imageConfig.image_size = imageSize;
  }

  return Object.keys(imageConfig).length > 0 ? imageConfig : undefined;
}

function resolveImageSize(request: GenerateRequest): string | undefined {
  if (request.normalizedSize?.preset === "2k") {
    return "2K";
  }
  if (request.normalizedSize?.preset === "4k") {
    return "4K";
  }
  if (request.normalizedSize && request.normalizedSize.source === "explicit") {
    const maxDimension = Math.max(
      request.normalizedSize.width,
      request.normalizedSize.height
    );
    if (maxDimension <= 1024) {
      return "1K";
    }
    if (maxDimension <= 2048) {
      return "2K";
    }
    return "4K";
  }
  return undefined;
}

function parseJsonResponse(bodyText: string): OpenRouterResponse {
  return JSON.parse(bodyText) as OpenRouterResponse;
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
      outputFormat: inferOutputFormat(parsed.mimeType),
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
