import { parseModelRef } from "./model-ref.js";
import type { GenerateRequest } from "./request.js";

type RawGenerateOptions = {
  model?: string;
  size?: string;
  n?: string | number;
  quality?: string;
  background?: string;
  output_format?: string;
  output_compression?: string | number;
  moderation?: string;
  response_format?: string;
  stream?: boolean;
  partial_images?: string | number;
  style?: string;
  user?: string;
  extra?: string;
  outputDir?: string;
  json?: boolean;
};

type BuildGenerateRequestDefaults = {
  defaultModel?: string;
};

const RESERVED_EXTRA_KEYS = new Set([
  "prompt",
  "model",
  "size",
  "n",
  "quality",
  "background",
  "output_format",
  "output_compression",
  "moderation",
  "response_format",
  "stream",
  "partial_images",
  "style",
  "user",
  "outputDir",
  "json"
]);

/**
 * Builds a validated OpenAI-compatible image generation request.
 */
export function buildGenerateRequest(
  prompt: string,
  options: RawGenerateOptions,
  defaults: BuildGenerateRequestDefaults = {}
): GenerateRequest {
  const modelRef = options.model?.trim() || defaults.defaultModel?.trim();
  if (!modelRef) {
    throw new Error("--model is required unless config.defaultModel is set.");
  }

  return {
    prompt,
    model: parseModelRef(modelRef),
    size: parseSize(options.size),
    n: parseOptionalPositiveInt(options.n, "--n"),
    quality: options.quality,
    output_format: parseOutputFormat(options.output_format),
    background: parseBackground(options.background),
    output_compression: parseOptionalBoundedInt(
      options.output_compression,
      "--output-compression",
      0,
      100
    ),
    moderation: parseModeration(options.moderation),
    response_format: parseResponseFormat(options.response_format),
    stream: Boolean(options.stream),
    partial_images: parseOptionalBoundedInt(options.partial_images, "--partial-images", 0, 3),
    style: parseStyle(options.style),
    user: parseOptionalNonBlank(options.user, "--user"),
    extra: parseExtra(options.extra),
    outputDir: options.outputDir,
    json: Boolean(options.json)
  };
}

function parseSize(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  if (value === "auto") {
    return value;
  }

  const match = value.match(/^(\d+)x(\d+)$/);
  if (!match) {
    throw new Error('--size must be "auto" or explicit dimensions like "1024x1024".');
  }

  const width = Number(match[1]);
  const height = Number(match[2]);
  if (width <= 0 || height <= 0) {
    throw new Error("--size dimensions must be positive integers.");
  }
  return value;
}

function parseOptionalPositiveInt(
  value: string | number | undefined,
  flagName: string
): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flagName} must be a positive integer.`);
  }
  return parsed;
}

function parseOptionalBoundedInt(
  value: string | number | undefined,
  flagName: string,
  min: number,
  max: number
): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${flagName} must be an integer between ${min} and ${max}.`);
  }
  return parsed;
}

function parseOutputFormat(
  value: string | undefined
): GenerateRequest["output_format"] {
  if (!value) {
    return undefined;
  }
  if (value !== "png" && value !== "jpeg" && value !== "webp") {
    throw new Error(`Unsupported --output-format "${value}".`);
  }
  return value;
}

function parseBackground(
  value: string | undefined
): GenerateRequest["background"] {
  if (!value) {
    return undefined;
  }
  if (value !== "auto" && value !== "opaque" && value !== "transparent") {
    throw new Error(`Unsupported --background "${value}".`);
  }
  return value;
}

function parseModeration(value: string | undefined): GenerateRequest["moderation"] {
  if (!value) {
    return undefined;
  }
  if (value !== "auto" && value !== "low") {
    throw new Error(`Unsupported --moderation "${value}".`);
  }
  return value;
}

function parseResponseFormat(
  value: string | undefined
): GenerateRequest["response_format"] {
  if (!value) {
    return undefined;
  }
  if (value !== "url" && value !== "b64_json") {
    throw new Error(`Unsupported --response-format "${value}".`);
  }
  return value;
}

function parseStyle(value: string | undefined): GenerateRequest["style"] {
  if (!value) {
    return undefined;
  }
  if (value !== "vivid" && value !== "natural") {
    throw new Error(`Unsupported --style "${value}".`);
  }
  return value;
}

function parseOptionalNonBlank(
  value: string | undefined,
  flagName: string
): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${flagName} must not be empty.`);
  }
  return trimmed;
}

function parseExtra(value: string | undefined): Record<string, unknown> | undefined {
  if (value === undefined) {
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch (error) {
    throw new Error(`--extra must be a valid JSON object: ${toErrorMessage(error)}`);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("--extra must be a JSON object.");
  }

  const extra = parsed as Record<string, unknown>;
  for (const key of Object.keys(extra)) {
    if (RESERVED_EXTRA_KEYS.has(key)) {
      throw new Error(
        `--extra must not override OpenAI-compatible field "${key}".`
      );
    }
  }

  return extra;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
