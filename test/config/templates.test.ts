import { describe, expect, test } from "vitest";

import { buildConfigTemplates } from "../../src/config/templates.js";

describe("config templates", () => {
  test("returns beginner-friendly template files", () => {
    const templates = buildConfigTemplates();

    expect(templates.configExample).toContain('"defaultProvider": "openai"');
    expect(templates.configExample).toContain("// Copy this file to config.json");
    expect(templates.envExample).toContain("IMAGE_OPENAI_API_KEY_1=");
    expect(templates.gitignore).toContain(".env");
  });
});
