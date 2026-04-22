import { describe, expect, test } from "vitest";

import { buildGenerateRequest } from "../../src/protocol/generate-request.js";

describe("generate request building", () => {
  test("normalizes CLI-style options into a generate request", () => {
    const request = buildGenerateRequest("A poster of a cat", {
      model: "nano-banana/gemini-2.5-flash-image",
      size: "2k",
      aspect: "16:9",
      n: "2",
      image: ["./input.png", "https://example.com/ref.png"],
      quality: "high",
      format: "png",
      background: "transparent",
      negativePrompt: "blurry",
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
    expect(request.negativePrompt).toBe("blurry");
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
