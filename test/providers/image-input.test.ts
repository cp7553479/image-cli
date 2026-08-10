import { describe, expect, test, vi } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  isLocalFile,
  resolveImage,
  resolveImageToDataUrl,
  resolveImageToFilePath
} from "../../src/providers/image-input.js";

vi.mock("../../src/transport/curl.js", () => ({
  downloadCurlFile: vi.fn(async ({ url, destinationPath }: { url: string; destinationPath: string }) => {
    const buffer = Buffer.from(`fake-image-bytes-for-${url}`, "utf8");
    writeFileSync(destinationPath, buffer);
  })
}));

describe("image input helpers", () => {
  test("isLocalFile distinguishes file and url inputs", () => {
    expect(isLocalFile({ file: "/tmp/a.png" })).toBe(true);
    expect(isLocalFile({ url: "https://example.com/a.png" })).toBe(false);
  });

  test("resolveImage reads local file to base64", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "image-cli-helper-"));
    const filePath = join(tmpDir, "ref.png");
    writeFileSync(filePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    const resolved = await resolveImage({ file: filePath });
    expect(resolved.base64).toBe(readFileSync(filePath).toString("base64"));
    expect(resolved.mimeType).toBe("image/png");
  });

  test("resolveImageToDataUrl produces a data URL", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "image-cli-helper-"));
    const filePath = join(tmpDir, "ref.jpg");
    writeFileSync(filePath, Buffer.from([0xff, 0xd8, 0xff]));

    const dataUrl = await resolveImageToDataUrl({ file: filePath });
    expect(dataUrl).toMatch(/^data:image\/jpeg;base64,/);
  });

  test("resolveImageToFilePath returns local file path as-is with noop cleanup", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "image-cli-helper-"));
    const filePath = join(tmpDir, "ref.webp");
    writeFileSync(filePath, Buffer.from([0x52, 0x49, 0x46, 0x46]));

    const resolved = await resolveImageToFilePath({ file: filePath });
    expect(resolved.path).toBe(filePath);
    expect(resolved.mimeType).toBe("image/webp");
    await expect(resolved.cleanup()).resolves.toBeUndefined();
  });

  test("resolveImage downloads URL via curl", async () => {
    const resolved = await resolveImage({ url: "https://example.com/photo.png" });
    expect(resolved.base64).toBe(
      Buffer.from("fake-image-bytes-for-https://example.com/photo.png", "utf8").toString("base64")
    );
    expect(resolved.mimeType).toBe("image/png");
  });

  test("resolveImageToFilePath downloads URL and provides cleanup", async () => {
    const resolved = await resolveImageToFilePath({ url: "https://example.com/photo.png" });
    expect(resolved.mimeType).toBe("image/png");
    expect(resolved.path).toMatch(/reference\.png$/);
    await resolved.cleanup();
  });
});
