import { describe, expect, test } from "vitest";

import {
  CANONICAL_PROVIDER_IDS,
  parseModelRef,
  resolveProviderAlias
} from "../../src/protocol/model-ref.js";

describe("model ref parsing", () => {
  test("keeps canonical provider ids intact", () => {
    expect(parseModelRef("openai/chatgpt-image-latest")).toEqual({
      providerId: "openai",
      providerAlias: "openai",
      modelId: "chatgpt-image-latest"
    });
  });

  test("resolves friendly provider aliases", () => {
    expect(parseModelRef("nano-banana/gemini-2.5-flash-image")).toEqual({
      providerId: "gemini",
      providerAlias: "nano-banana",
      modelId: "gemini-2.5-flash-image"
    });
  });

  test("exposes the canonical provider list", () => {
    expect(CANONICAL_PROVIDER_IDS).toEqual([
      "openai",
      "gemini",
      "seedream",
      "qwen",
      "minimax"
    ]);
  });

  test("rejects malformed model refs", () => {
    expect(() => parseModelRef("chatgpt-image-latest")).toThrow(
      /provider_id\/model_id/
    );
    expect(() => parseModelRef("unknown/model")).toThrow(/unknown provider/i);
    expect(() => parseModelRef("openai/")).toThrow(/missing model id/i);
  });

  test("resolves aliases without parsing a full ref", () => {
    expect(resolveProviderAlias("chatgpt-image")).toBe("openai");
    expect(resolveProviderAlias("minimax-image")).toBe("minimax");
  });
});
