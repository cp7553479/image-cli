import { describe, expect, test } from "vitest";

import {
  normalizeSize,
  parseAspectRatio,
  SIZE_PRESETS
} from "../../src/protocol/size.js";

describe("size normalization", () => {
  test("normalizes 2k presets with explicit aspect ratios", () => {
    expect(normalizeSize("2k", "16:9")).toMatchObject({
      preset: "2k",
      width: 2848,
      height: 1600,
      aspectRatio: "16:9"
    });
  });

  test("defaults presets to 1:1 when aspect is omitted", () => {
    expect(normalizeSize("4k")).toMatchObject({
      preset: "4k",
      width: 4096,
      height: 4096,
      aspectRatio: "1:1"
    });
  });

  test("parses explicit dimensions", () => {
    expect(normalizeSize("1536x1024")).toMatchObject({
      source: "explicit",
      width: 1536,
      height: 1024,
      aspectRatio: "3:2"
    });
  });

  test("rejects explicit dimensions that conflict with an explicit aspect ratio", () => {
    expect(() => normalizeSize("1536x1024", "1:1")).toThrow(/conflicts/i);
  });

  test("rejects unknown presets and malformed dimensions", () => {
    expect(() => normalizeSize("6k")).toThrow(/unsupported size/i);
    expect(() => normalizeSize("abcx100")).toThrow(/invalid size/i);
  });

  test("parses supported aspect ratios", () => {
    expect(parseAspectRatio("21:9")).toBe("21:9");
    expect(() => parseAspectRatio("5:4")).toThrow(/unsupported aspect/i);
  });

  test("exports the preset lookup table", () => {
    expect(SIZE_PRESETS["2k"]["1:1"]).toEqual({ width: 2048, height: 2048 });
  });
});
