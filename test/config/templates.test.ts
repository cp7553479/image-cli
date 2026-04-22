import { describe, expect, test } from "vitest";

import { buildConfigTemplates } from "../../src/config/templates.js";

describe("config templates", () => {
  test("returns beginner-friendly template files", () => {
    const templates = buildConfigTemplates();

    expect(templates.configExample).toContain('"defaultModel": "openai/gpt-image-1.5"');
    expect(templates.configExample).toContain("// Copy this file to config.json");
    expect(templates.configExample).toContain('"api_key": ["YOUR_OPENAI_API_KEY"]');
    expect(templates.readme).toContain("image config init");
    expect(templates.configExample).not.toContain("retryableHttpStatus");
  });
});
