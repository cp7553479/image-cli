import { readFile, mkdtemp, rm, mkdir } from "node:fs/promises";
import { extname, join } from "node:path";
import { downloadCurlFile } from "../transport/curl.js";
import { getImageTempDir } from "../config/paths.js";
import type { ImageInput } from "../protocol/request.js";

export type ResolvedImage = {
  /** base64 编码的图片字节（不含 data: 前缀）。 */
  base64: string;
  /** MIME 类型，如 image/png。 */
  mimeType: string;
};

export type ResolvedImageFile = {
  /** 可直接用于 multipart 上传的本地文件路径。 */
  path: string;
  /** MIME 类型，如 image/png。 */
  mimeType: string;
  /**
   * 当图片来自 URL 下载时，清理临时文件；本地文件则无操作。
   * 调用方在完成请求发送后必须调用。
   */
  cleanup: () => Promise<void>;
};

const MIME_BY_EXTENSION: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif"
};

const SUPPORTED_DOWNLOAD_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif"
]);

/**
 * 判断图片输入是否为本地文件。
 */
export function isLocalFile(input: ImageInput): input is { file: string } {
  return "file" in input;
}

/**
 * 把图片输入解析为 base64 + mimeType。
 * - 本地文件：直接读取。
 * - URL：下载后读取。
 */
export async function resolveImage(input: ImageInput): Promise<ResolvedImage> {
  if (isLocalFile(input)) {
    const buffer = await readFile(input.file);
    return {
      base64: buffer.toString("base64"),
      mimeType: inferMimeTypeFromPath(input.file)
    };
  }

  const downloaded = await downloadUrlToTemp(input.url);
  try {
    const buffer = await readFile(downloaded.path);
    return {
      base64: buffer.toString("base64"),
      mimeType: downloaded.mimeType
    };
  } finally {
    await rm(downloaded.dir, { recursive: true, force: true });
  }
}

/**
 * 把图片输入解析为 `data:<mime>;base64,<...>` 形式的 data URL。
 */
export async function resolveImageToDataUrl(input: ImageInput): Promise<string> {
  const { base64, mimeType } = await resolveImage(input);
  return `data:${mimeType};base64,${base64}`;
}

/**
 * 把图片输入解析为可直接用于 multipart 上传的本地文件路径。
 * - 本地文件：原样返回，cleanup 为空操作。
 * - URL：下载到临时文件，cleanup 删除临时目录。调用方在请求发送后必须调用 cleanup。
 */
export async function resolveImageToFilePath(
  input: ImageInput,
  suggestedExtension?: string
): Promise<ResolvedImageFile> {
  if (isLocalFile(input)) {
    return {
      path: input.file,
      mimeType: inferMimeTypeFromPath(input.file),
      cleanup: async () => {
        // 本地文件由用户拥有，不删除。
      }
    };
  }

  const downloaded = await downloadUrlToTemp(input.url, suggestedExtension);
  return {
    path: downloaded.path,
    mimeType: downloaded.mimeType,
    cleanup: async () => {
      await rm(downloaded.dir, { recursive: true, force: true });
    }
  };
}

/**
 * 把多个图片输入并行解析为 base64。
 */
export async function resolveImages(inputs: ImageInput[]): Promise<ResolvedImage[]> {
  return Promise.all(inputs.map((input) => resolveImage(input)));
}

function inferMimeTypeFromPath(filePath: string): string {
  return MIME_BY_EXTENSION[extname(filePath).toLowerCase()] ?? "image/png";
}

async function downloadUrlToTemp(
  url: string,
  suggestedExtension?: string
): Promise<{ path: string; dir: string; mimeType: string }> {
  const extension =
    suggestedExtension ??
    inferExtensionFromUrl(url) ??
    ".png";
  const mimeType = MIME_BY_EXTENSION[extension] ?? "image/png";

  const dir = await mkdtemp(join(await ensureImageTempDir(), "image-cli-ref-"));
  const destinationPath = join(dir, `reference${extension}`);
  try {
    await downloadCurlFile({ url, destinationPath });
    return { path: destinationPath, dir, mimeType };
  } catch (error) {
    await rm(dir, { recursive: true, force: true });
    throw error;
  }
}

async function ensureImageTempDir(): Promise<string> {
  const tempDir = getImageTempDir();
  await mkdir(tempDir, { recursive: true });
  return tempDir;
}

function inferExtensionFromUrl(url: string): string | undefined {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    const extension = extname(pathname);
    return SUPPORTED_DOWNLOAD_EXTENSIONS.has(extension) ? extension : undefined;
  } catch {
    return undefined;
  }
}
