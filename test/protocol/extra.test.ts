import { describe, expect, test } from "vitest";

import {
  RESERVED_EXTRA_KEYS,
  assertNoReservedExtraKeys,
  parseExtraObject
} from "../../src/protocol/extra.js";

describe("--extra handling", () => {
  test("parses JSON objects", () => {
    expect(parseExtraObject('{"watermark":false,"prompt_optimizer":true}')).toEqual(
      {
        watermark: false,
        prompt_optimizer: true
      }
    );
  });

  test("rejects invalid JSON and non-object payloads", () => {
    expect(() => parseExtraObject("{invalid")).toThrow(/valid json object/i);
    expect(() => parseExtraObject('["not","an","object"]')).toThrow(
      /json object/i
    );
    expect(() => parseExtraObject("null")).toThrow(/json object/i);
  });

  test("rejects attempts to override normalized protocol keys", () => {
    expect(() => assertNoReservedExtraKeys({ prompt: "override" })).toThrow(
      /reserved/i
    );
    expect(() => assertNoReservedExtraKeys({ normalizedSize: {} })).toThrow(
      /reserved/i
    );
  });

  test("exports the reserved key list", () => {
    expect(RESERVED_EXTRA_KEYS).toContain("prompt");
    expect(RESERVED_EXTRA_KEYS).toContain("model");
    expect(RESERVED_EXTRA_KEYS).toContain("extra");
  });
});
