import { describe, expect, test } from "vitest";

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

  test("rejects invalid numeric flags", () => {
    expect(() =>
      buildGenerateRequest("prompt", {
        model: "openai/chatgpt-image-latest",
        n: "0"
      })
    ).toThrow(/--n/i);
    expect(() =>
      buildGenerateRequest("prompt", {
        model: "openai/chatgpt-image-latest",
        output_compression: "101"
      })
    ).toThrow(/--output-compression/i);
    expect(() =>
      buildGenerateRequest("prompt", {
        model: "openai/chatgpt-image-latest",
        partial_images: "4"
      })
    ).toThrow(/--partial-images/i);
  });

  test("rejects unsupported enum flags", () => {
    expect(() =>
      buildGenerateRequest("prompt", {
        model: "openai/chatgpt-image-latest",
        size: "2k"
      })
    ).toThrow(/--size/i);
    expect(() =>
      buildGenerateRequest("prompt", {
        model: "openai/chatgpt-image-latest",
        output_format: "gif"
      })
    ).toThrow(/--output-format/i);
    expect(() =>
      buildGenerateRequest("prompt", {
        model: "openai/chatgpt-image-latest",
      response_format: "base64"
    })
  ).toThrow(/--response-format/i);
  });

  test("parses provider-specific extra JSON and rejects overrides", () => {
    const request = buildGenerateRequest("prompt", {
      model: "seedream/doubao-seedream-4.5",
      extra: '{"watermark":false,"optimize_prompt_options":{"mode":"standard"}}'
    });

    expect(request.extra).toEqual({
      watermark: false,
      optimize_prompt_options: {
        mode: "standard"
      }
    });

    expect(() =>
      buildGenerateRequest("prompt", {
        model: "openai/gpt-image-1.5",
        extra: '{"model":"other"}'
      })
    ).toThrow(/must not override/i);

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
});
