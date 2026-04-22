import { describe, expect, test } from "vitest";

import { buildGenerateRequest } from "../../src/protocol/generate-request.js";

describe("generate request building", () => {
  test("normalizes CLI-style options into a generate request", () => {
    const request = buildGenerateRequest("A poster of a cat", {
      model: "nano-banana/gemini-3.1-flash-image-preview",
      size: "2k",
      aspect: "16:9",
      n: "2",
      image: ["./input.png", "https://example.com/ref.png"],
      quality: "high",
      format: "png",
      background: "transparent",
      seed: "7",
      stream: true,
      outputDir: "./out",
      json: true,
      extra: '{"watermark":false}'
    });

    expect(request.prompt).toBe("A poster of a cat");
    expect(request.model.providerId).toBe("gemini");
    expect(request.normalizedSize).toMatchObject({
      width: 2848,
      height: 1600,
      aspectRatio: "16:9"
    });
    expect(request.count).toBe(2);
    expect(request.images).toEqual(["./input.png", "https://example.com/ref.png"]);
    expect(request.outputFormat).toBe("png");
    expect(request.background).toBe("transparent");
    expect(request.seed).toBe(7);
    expect(request.stream).toBe(true);
    expect(request.outputDir).toBe("./out");
    expect(request.json).toBe(true);
    expect(request.extra).toEqual({ watermark: false });
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
        seed: "abc"
      })
    ).toThrow(/--seed/i);
  });

  test("rejects reserved extra key overrides", () => {
    expect(() =>
      buildGenerateRequest("prompt", {
        model: "openai/chatgpt-image-latest",
        extra: '{"prompt":"override"}'
      })
    ).toThrow(/reserved/i);
  });
});
