import { readFile } from "node:fs/promises";
import path from "node:path";

import type { PreparedImageInput } from "../providers/types.js";

const URL_PATTERN = /^https?:\/\//i;

const MIME_TYPE_BY_EXTENSION: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".heic": "image/heic",
  ".heif": "image/heif"
};

export async function prepareImageInputs(
  inputs: string[]
): Promise<PreparedImageInput[]> {
  const prepared: PreparedImageInput[] = [];

  for (const input of inputs) {
    if (URL_PATTERN.test(input)) {
      prepared.push({
        source: input,
        kind: "url",
        url: input
      });
      continue;
    }

    const filePath = path.resolve(input);
    const fileBytes = await readFile(filePath);
    prepared.push({
      source: filePath,
      kind: "inline",
      mimeType: inferMimeType(filePath),
      base64Data: fileBytes.toString("base64")
    });
  }

  return prepared;
}

function inferMimeType(filePath: string): string {
  return MIME_TYPE_BY_EXTENSION[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
}
