import { describe, expect, test } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildGenerateRequest } from "../../src/protocol/generate-request.js";

describe("generate request building", () => {
  test("maps OpenAI-compatible image options into a generate request", () => {
    const request = buildGenerateRequest("A poster of a cat", {
      model: "nano-banana/gemini-3.1-flash-image-preview",
      size: "1536x1024",
      n: "2",
      quality: "high",
      output_format: "png",
      background: "transparent",
      output_compression: "70",
      moderation: "low",
      response_format: "b64_json",
      stream: true,
      partial_images: "0",
      style: "natural",
      user: "agent-1",
      extra: '{"watermark":false}',
      outputDir: "./out",
      json: true
    });

    expect(request).toMatchObject({
      prompt: "A poster of a cat",
      size: "1536x1024",
      n: 2,
      quality: "high",
      output_format: "png",
      background: "transparent",
      output_compression: 70,
      moderation: "low",
      response_format: "b64_json",
      stream: true,
      partial_images: 0,
      style: "natural",
      user: "agent-1",
      extra: {
        watermark: false
      },
      outputDir: "./out",
      json: true
    });
    expect(request.model.providerId).toBe("gemini");
  });

  test("requires a model reference", () => {
    expect(() =>
      buildGenerateRequest("prompt", {
        model: ""
      })
    ).toThrow(/--model/i);
  });

  test("uses config.defaultModel when --model is omitted", () => {
    const request = buildGenerateRequest(
      "prompt",
      {},
      {
        defaultModel: "openrouter/google/gemini-3.1-flash-image-preview"
      }
    );

    expect(request.model).toEqual({
      providerId: "openrouter",
      providerAlias: "openrouter",
      modelId: "google/gemini-3.1-flash-image-preview"
    });
  });

  test("passes numeric flags through without range validation", () => {
    // No range checks: provider response decides validity.
    const request = buildGenerateRequest("prompt", {
      model: "openai/chatgpt-image-latest",
      n: "0",
      output_compression: "101",
      partial_images: "4"
    });

    expect(request).toMatchObject({
      n: 0,
      output_compression: 101,
      partial_images: 4
    });
  });

  test("passes enum-like flags through verbatim without validation", () => {
    // Values outside the common enums are forwarded as-is; provider decides.
    const request = buildGenerateRequest("prompt", {
      model: "openai/chatgpt-image-latest",
      size: "2K",
      output_format: "gif",
      response_format: "base64",
      background: "gradient",
      moderation: "strict",
      style: "painterly",
      input_fidelity: "ultra"
    });

    expect(request).toMatchObject({
      size: "2K",
      output_format: "gif",
      response_format: "base64",
      background: "gradient",
      moderation: "strict",
      style: "painterly",
      input_fidelity: "ultra"
    });
  });

  test("parses extra JSON and forwards it without field-occupation checks", () => {
    const request = buildGenerateRequest("prompt", {
        model: "volcengine/doubao-seedream-4.5",
      extra: '{"watermark":false,"optimize_prompt_options":{"mode":"standard"}}'
    });

    expect(request.extra).toEqual({
      watermark: false,
      optimize_prompt_options: {
        mode: "standard"
      }
    });

    // Keys that collide with standard fields are no longer rejected; explicit
    // flags still win because providers merge extra before standard fields.
    const colliding = buildGenerateRequest("prompt", {
      model: "openai/gpt-image-1.5",
      extra: '{"model":"other","size":"2K"}'
    });
    expect(colliding.extra).toEqual({ model: "other", size: "2K" });

    // Non-object payloads are still rejected (structural, not value validation).
    expect(() =>
      buildGenerateRequest("prompt", {
        model: "openai/gpt-image-1.5",
        extra: "[]"
      })
    ).toThrow(/JSON object/i);

    expect(() =>
      buildGenerateRequest("prompt", {
        model: "openai/gpt-image-1.5",
        extra: "{bad"
      })
    ).toThrow(/valid JSON object/i);
  });

  test("parses reference image URLs and local files", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "image-cli-test-"));
    const localPng = join(tmpDir, "ref.png");
    writeFileSync(localPng, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    const request = buildGenerateRequest("edit this", {
      model: "openai/gpt-image-1.5",
      reference_image: [
        "https://example.com/ref.png",
        localPng
      ]
    });

    expect(request.reference_images).toEqual([
      { url: "https://example.com/ref.png" },
      { file: localPng }
    ]);
  });

  test("parses a single reference image string into an array", () => {
    const request = buildGenerateRequest("edit this", {
      model: "openai/gpt-image-1.5",
      reference_image: "https://example.com/ref.png"
    });

    expect(request.reference_images).toEqual([{ url: "https://example.com/ref.png" }]);
  });

  test("parses mask as URL or local file", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "image-cli-test-"));
    const localMask = join(tmpDir, "mask.png");
    writeFileSync(localMask, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    const urlRequest = buildGenerateRequest("edit", {
      model: "openai/gpt-image-1.5",
      mask: "https://example.com/mask.png"
    });
    expect(urlRequest.mask).toEqual({ url: "https://example.com/mask.png" });

    const fileRequest = buildGenerateRequest("edit", {
      model: "openai/gpt-image-1.5",
      mask: localMask
    });
    expect(fileRequest.mask).toEqual({ file: localMask });
  });

  test("rejects mask files that do not exist", () => {
    expect(() =>
      buildGenerateRequest("edit", {
        model: "openai/gpt-image-1.5",
        mask: "/nonexistent/path/mask.png"
      })
    ).toThrow(/--mask/i);
  });

  test("passes input fidelity through without validation", () => {
    const request = buildGenerateRequest("edit", {
      model: "openai/gpt-image-1.5",
      input_fidelity: "high"
    });
    expect(request.input_fidelity).toBe("high");

    // Non-standard values are forwarded; provider decides support.
    const other = buildGenerateRequest("edit", {
      model: "openai/gpt-image-1.5",
      input_fidelity: "medium"
    });
    expect(other.input_fidelity).toBe("medium");
  });

  test("forwards reference_image, mask, and input_fidelity placed in extra", () => {
    // No field-occupation checks; extra is merged by providers as-is.
    const request = buildGenerateRequest("prompt", {
      model: "openai/gpt-image-1.5",
      extra: '{"reference_image":"https://example.com/a.png","mask":"https://example.com/a.png","input_fidelity":"high"}'
    });

    expect(request.extra).toEqual({
      reference_image: "https://example.com/a.png",
      mask: "https://example.com/a.png",
      input_fidelity: "high"
    });
  });
});
