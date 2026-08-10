import { describe, expect, test } from "vitest";

import {
  buildConfigTemplates,
  listConfigInitTemplateFiles,
  listSkillInitTemplateFiles
} from "../../src/config/init-templates.js";

describe("config templates", () => {
  test("returns beginner-friendly template files", () => {
    const templates = buildConfigTemplates();

    expect(templates.config).toContain('"defaultModel": "openai/gpt-image-1.5"');
    expect(templates.configExample).toContain('"defaultModel": "openai/gpt-image-1.5"');
    expect(templates.configExample).toContain("// Copy this file to config.json");
    expect(templates.configExample).toContain('"api_key": ["YOUR_OPENAI_API_KEY"]');
    expect(templates.readme).toContain("image config init");
    expect(templates.readme).toContain("~/.codex/skills");
    expect(templates.readme).toContain("~/antigravity/skills");
    expect(templates.readme).toContain("~/.claude/skills");
    expect(templates.readme).toContain("~/.agents/skills");
    expect(templates.skill).toContain("If this skill is missing or unavailable");
    expect(templates.skillReadme).toContain("image config init");
    expect(templates.configExample).not.toContain("retryableHttpStatus");
  });

  test("lists config and skill template files from source-owned templates", () => {
    expect(listConfigInitTemplateFiles().map((entry) => entry.relativePath).sort()).toEqual([
      "README.md",
      "config.example.jsonc",
      "config.json",
      "skills/image-cli/README.md",
      "skills/image-cli/SKILL.md"
    ]);
    expect(listSkillInitTemplateFiles().map((entry) => entry.relativePath).sort()).toEqual([
      "README.md",
      "SKILL.md"
    ]);
  });
});
