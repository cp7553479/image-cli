import type { GenerateRequest } from "../protocol/request.js";

export type OpenAIImageDimensions = {
  width: number;
  height: number;
};

export type OpenAIImageRequestFieldOptions = {
  includeModelAndPrompt?: boolean;
  includeSize?: boolean;
};

/**
 * Collects defined OpenAI-compatible image fields for provider request bodies.
 */
export function collectOpenAIImageRequestFields(
  request: GenerateRequest,
  options: OpenAIImageRequestFieldOptions = {}
): Record<string, unknown> {
  const fields: Record<string, unknown> = {};

  if (options.includeModelAndPrompt) {
    fields.model = request.model.modelId;
    fields.prompt = request.prompt;
  }

  if (options.includeSize !== false) {
    setDefined(fields, "size", request.size);
  }

  setDefined(fields, "n", request.n);
  setDefined(fields, "quality", request.quality);
  setDefined(fields, "background", request.background);
  setDefined(fields, "output_format", request.output_format);
  setDefined(fields, "output_compression", request.output_compression);
  setDefined(fields, "moderation", request.moderation);
  setDefined(fields, "response_format", request.response_format);
  if (request.stream) {
    fields.stream = true;
  }
  setDefined(fields, "partial_images", request.partial_images);
  setDefined(fields, "style", request.style);
  setDefined(fields, "user", request.user);

  return fields;
}

/**
 * Parses an OpenAI-compatible image size into numeric dimensions.
 */
export function parseOpenAIImageSize(size?: string): OpenAIImageDimensions | undefined {
  if (!size || size === "auto") {
    return undefined;
  }

  const match = size.match(/^(\d+)x(\d+)$/);
  if (!match) {
    return undefined;
  }

  return {
    width: Number(match[1]),
    height: Number(match[2])
  };
}

/**
 * Derives a reduced aspect ratio from an OpenAI-compatible image size.
 */
export function aspectRatioFromOpenAIImageSize(size?: string): string | undefined {
  const dimensions = parseOpenAIImageSize(size);
  if (!dimensions) {
    return undefined;
  }

  const divisor = greatestCommonDivisor(dimensions.width, dimensions.height);
  return `${dimensions.width / divisor}:${dimensions.height / divisor}`;
}

/**
 * Converts OpenAI-compatible image size notation to Bailian (DashScope) size notation.
 */
export function bailianSizeFromOpenAIImageSize(size?: string): string | undefined {
  if (!size || size === "auto") {
    return undefined;
  }
  return size.replace("x", "*");
}

/**
 * Converts OpenAI-compatible image dimensions to OpenRouter image size buckets.
 */
export function openRouterImageSizeFromOpenAIImageSize(size?: string): string | undefined {
  const dimensions = parseOpenAIImageSize(size);
  if (!dimensions) {
    return undefined;
  }

  const maxDimension = Math.max(dimensions.width, dimensions.height);
  if (maxDimension <= 1024) {
    return "1K";
  }
  if (maxDimension <= 2048) {
    return "2K";
  }
  return "4K";
}

function greatestCommonDivisor(left: number, right: number): number {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b !== 0) {
    const next = a % b;
    a = b;
    b = next;
  }
  return a || 1;
}

function setDefined(
  fields: Record<string, unknown>,
  key: string,
  value: unknown
): void {
  if (value !== undefined) {
    fields[key] = value;
  }
}
