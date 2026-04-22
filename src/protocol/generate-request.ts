import { assertNoReservedExtraKeys, parseExtraObject } from "./extra.js";
import { parseModelRef } from "./model-ref.js";
import type { GenerateRequest } from "./request.js";
import { normalizeSize, parseAspectRatio } from "./size.js";

type RawGenerateOptions = {
  model?: string;
  size?: string;
  aspect?: string;
  n?: string | number;
  image?: string[];
  quality?: string;
  format?: "png" | "jpeg" | "webp" | string;
  background?: "auto" | "opaque" | "transparent" | string;
  negativePrompt?: string;
  seed?: string | number;
  stream?: boolean;
  outputDir?: string;
  json?: boolean;
  extra?: string;
};

type BuildGenerateRequestDefaults = {
  defaultModel?: string;
};

export function buildGenerateRequest(
  prompt: string,
  options: RawGenerateOptions,
  defaults: BuildGenerateRequestDefaults = {}
): GenerateRequest {
  const modelRef = options.model?.trim() || defaults.defaultModel?.trim();
  if (!modelRef) {
    throw new Error("--model is required unless config.defaultModel is set.");
  }

  const aspectRatio = options.aspect
    ? parseAspectRatio(options.aspect)
    : undefined;
  const extra = parseExtraObject(options.extra);
  assertNoReservedExtraKeys(extra);

  return {
    prompt,
    model: parseModelRef(modelRef),
    size: options.size,
    normalizedSize: normalizeSize(options.size, aspectRatio),
    aspectRatio,
    count: parseOptionalPositiveInt(options.n, "--n"),
    images: options.image,
    quality: options.quality,
    outputFormat: parseOutputFormat(options.format),
    background: parseBackground(options.background),
    seed: parseOptionalInteger(options.seed, "--seed"),
    stream: Boolean(options.stream),
    outputDir: options.outputDir,
    json: Boolean(options.json),
    extra
  };
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

function parseOptionalInteger(
  value: string | number | undefined,
  flagName: string
): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new Error(`${flagName} must be an integer.`);
  }
  return parsed;
}

function parseOutputFormat(
  value: string | undefined
): GenerateRequest["outputFormat"] {
  if (!value) {
    return undefined;
  }
  if (value !== "png" && value !== "jpeg" && value !== "webp") {
    throw new Error(`Unsupported --format "${value}".`);
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
