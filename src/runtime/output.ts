import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { downloadCurlFile } from "../transport/curl.js";
import type { GenerateResult, ProviderImageResult } from "../providers/types.js";

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
};

export async function writeGenerateArtifacts(
  options: WriteGenerateArtifactsOptions
): Promise<OutputManifest> {
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
  const manifest = {
    providerId: options.result.providerId,
    modelId: options.result.modelId,
    files,
    warnings: unique([
      ...options.result.warnings,
      ...options.result.images.flatMap((image) => image.warnings ?? [])
    ]),
    raw: options.result.raw
  };
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

  return {
    providerId: options.result.providerId,
    modelId: options.result.modelId,
    files,
    warnings: manifest.warnings,
    manifestPath
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
  if (image.outputFormat && image.outputFormat !== "url" && image.outputFormat !== "base64" && image.outputFormat !== "b64_json") {
    return image.outputFormat;
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
