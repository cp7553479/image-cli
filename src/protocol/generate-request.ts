import { existsSync } from "node:fs";
import { parseModelRef } from "./model-ref.js";
import type { GenerateRequest, ImageInput } from "./request.js";

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
  reference_image?: string[] | string;
  mask?: string;
  input_fidelity?: string;
};

type BuildGenerateRequestDefaults = {
  defaultModel?: string;
};

/**
 * Builds a generate request by passing flag values through verbatim.
 *
 * Value choices (sizes, enums, numeric ranges) are NOT validated here. The CLI
 * only parses the model reference, maps CLI option spelling to request field
 * spelling, coerces numeric fields, and resolves image inputs. Providers
 * decide whether a value is supported.
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
    size: options.size,
    n: toNumber(options.n),
    quality: options.quality,
    output_format: options.output_format,
    background: options.background,
    output_compression: toNumber(options.output_compression),
    moderation: options.moderation,
    response_format: options.response_format,
    stream: Boolean(options.stream),
    partial_images: toNumber(options.partial_images),
    style: options.style,
    user: options.user,
    extra: parseExtra(options.extra),
    outputDir: options.outputDir,
    json: Boolean(options.json),
    reference_images: parseReferenceImages(options.reference_image),
    mask: parseImageInput(options.mask, "--mask"),
    input_fidelity: options.input_fidelity
  };
}

/**
 * 把 CLI 传入的数值字符串/数字转成 number，不做范围校验。
 * 未提供时返回 undefined；无法解析时返回 NaN（交给 provider 判定）。
 */
function toNumber(value: string | number | undefined): number | undefined {
  if (value === undefined || value === "") {
    return undefined;
  }
  if (typeof value === "number") {
    return value;
  }
  return Number(value);
}

/**
 * 解析 --extra：必须是合法 JSON 且为对象，原样透传，不做字段占用校验。
 * （显式 flag 永远在 provider body 中后于 extra 合并，因此不会真的被覆盖。）
 */
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

  return parsed as Record<string, unknown>;
}

/**
 * 把单个图片输入值解析为 ImageInput：http(s) URL → {url}，否则视为本地路径 → {file}。
 */
function parseImageInput(value: string | undefined, flagName: string): ImageInput | undefined {
  if (value === undefined) {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${flagName} must not be empty.`);
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return { url: trimmed };
  }
  if (!existsSync(trimmed)) {
    throw new Error(`${flagName} file does not exist: ${trimmed}`);
  }
  return { file: trimmed };
}

function parseReferenceImages(
  value: string[] | string | undefined
): ImageInput[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  const items = Array.isArray(value) ? value : [value];
  const parsed: ImageInput[] = [];
  for (const item of items) {
    const input = parseImageInput(item, "--reference-image");
    if (input) {
      parsed.push(input);
    }
  }
  return parsed.length > 0 ? parsed : undefined;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
