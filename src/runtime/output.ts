import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { downloadCurlFile } from "../transport/curl.js";
import type {
  GenerateResult,
  NormalizedUsage,
  ProviderImageResult,
  ProviderUsage
} from "../providers/types.js";

type DownloadFile = (input: {
  url: string;
  destinationPath: string;
}) => Promise<void>;

type WriteGenerateArtifactsOptions = {
  outputDir: string;
  result: GenerateResult;
  downloadFile?: DownloadFile;
};

export type OutputManifest = {
  providerId: string;
  modelId: string;
  files: string[];
  warnings: string[];
  manifestPath: string;
  usage: NormalizedUsage | null;
};

/**
 * writeGenerateArtifacts 的导出入口。
 */
export async function writeGenerateArtifacts(
  options: WriteGenerateArtifactsOptions
): Promise<OutputManifest> {
  // See docs/error-handling.md#output-artifacts for manifest and warning rules.
  await mkdir(options.outputDir, { recursive: true });
  const files: string[] = [];
  const downloadFile = options.downloadFile ?? defaultDownloadFile;

  let index = 0;
  for (const image of options.result.images) {
    index += 1;
    const extension = detectExtension(image);
    const destinationPath = path.join(options.outputDir, `image-${index}.${extension}`);

    if (image.dataBase64) {
      await writeFile(destinationPath, Buffer.from(image.dataBase64, "base64"));
      files.push(destinationPath);
      continue;
    }

    if (image.url) {
      await downloadFile({
        url: image.url,
        destinationPath
      });
      files.push(destinationPath);
    }
  }

  const manifestPath = path.join(options.outputDir, "manifest.json");
  const usage = normalizeUsage(options.result.usage);
  const manifest = {
    providerId: options.result.providerId,
    modelId: options.result.modelId,
    files,
    warnings: unique([
      ...options.result.warnings,
      ...options.result.images.flatMap((image) => image.warnings ?? [])
    ]),
    usage,
    raw: options.result.raw
  };
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

  return {
    providerId: options.result.providerId,
    modelId: options.result.modelId,
    files,
    warnings: manifest.warnings,
    manifestPath,
    usage
  };
}

async function defaultDownloadFile(input: {
  url: string;
  destinationPath: string;
}): Promise<void> {
  await downloadCurlFile({
    url: input.url,
    destinationPath: input.destinationPath
  });
}

function detectExtension(image: ProviderImageResult): string {
  if (image.output_format && image.output_format !== "url" && image.output_format !== "base64" && image.output_format !== "b64_json") {
    return image.output_format;
  }

  if (image.mimeType) {
    if (image.mimeType === "image/jpeg") {
      return "jpeg";
    }
    if (image.mimeType === "image/webp") {
      return "webp";
    }
    if (image.mimeType === "image/png") {
      return "png";
    }
  }

  if (image.url) {
    try {
      const urlPath = new URL(image.url).pathname;
      const rawExtension = path.extname(urlPath).replace(/^\./, "");
      if (rawExtension) {
        return rawExtension;
      }
    } catch {
      return "bin";
    }
  }

  return "bin";
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function normalizeUsage(usage: ProviderUsage | undefined): NormalizedUsage | null {
  if (!isRecord(usage)) {
    return null;
  }

  const inputTokens = firstTokenNumber(usage.input_tokens, usage.prompt_tokens);
  const outputTokens = firstTokenNumber(usage.output_tokens, usage.completion_tokens);
  const totalTokens = firstTokenNumber(usage.total_tokens)
    ?? sumTokens(inputTokens, outputTokens);

  const inputDetails = firstRecord(usage.input_tokens_details, usage.prompt_tokens_details);
  const outputDetails = firstRecord(usage.output_tokens_details, usage.completion_tokens_details);
  const cachedTokens = inputDetails
    ? firstTokenNumber(inputDetails.cached_tokens)
    : undefined;
  const reasoningTokens = outputDetails
    ? firstTokenNumber(outputDetails.reasoning_tokens)
    : undefined;

  const normalized: NormalizedUsage = {};
  if (inputTokens !== undefined) {
    normalized.input_tokens = inputTokens;
    normalized.prompt_tokens = inputTokens;
  }
  if (outputTokens !== undefined) {
    normalized.output_tokens = outputTokens;
    normalized.completion_tokens = outputTokens;
  }
  if (totalTokens !== undefined) {
    normalized.total_tokens = totalTokens;
  }
  if (cachedTokens !== undefined) {
    normalized.input_tokens_details = {
      cached_tokens: cachedTokens
    };
    normalized.prompt_tokens_details = {
      cached_tokens: cachedTokens
    };
  }
  if (reasoningTokens !== undefined) {
    normalized.output_tokens_details = {
      reasoning_tokens: reasoningTokens
    };
    normalized.completion_tokens_details = {
      reasoning_tokens: reasoningTokens
    };
  }

  return Object.keys(normalized).length > 0 ? normalized : null;
}

function firstTokenNumber(...values: unknown[]): number | undefined {
  return values.find((value): value is number =>
    typeof value === "number"
      && Number.isSafeInteger(value)
      && value >= 0
  );
}

function sumTokens(
  inputTokens: number | undefined,
  outputTokens: number | undefined
): number | undefined {
  if (inputTokens === undefined || outputTokens === undefined) {
    return undefined;
  }
  return inputTokens + outputTokens;
}

function firstRecord(...values: unknown[]): Record<string, unknown> | undefined {
  return values.find(isRecord);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
