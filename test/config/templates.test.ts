import { describe, expect, test } from "vitest";
import { readFile } from "node:fs/promises";

import {
  buildConfigTemplates,
  listConfigInitTemplateFiles,
  listSkillInitTemplateFiles,
  VOLCENGINE_AGENT_PLAN_BASE_URL,
  VOLCENGINE_API_BASE_URL
} from "../../src/config/init-templates.js";

describe("config templates", () => {
  test("returns beginner-friendly template files", () => {
    const templates = buildConfigTemplates();

    expect(templates.config).toContain('"defaultModel": "openai/gpt-image-1.5"');
    expect(templates.configExample).toContain('"defaultModel": "openai/gpt-image-1.5"');
    expect(templates.configExample).toContain("// Copy this file to config.json");
    expect(templates.configExample).toContain('"api_key": ["YOUR_OPENAI_API_KEY"]');
    expect(templates.config).toContain('"volcengine"');
    expect(templates.config).toContain(VOLCENGINE_API_BASE_URL);
    expect(templates.config).not.toContain("__VOLCENGINE_BASE_URL__");
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

  test("bakes the chosen volcengine base url into config.json", () => {
    const templates = buildConfigTemplates({ volcengineBaseUrl: VOLCENGINE_AGENT_PLAN_BASE_URL });

    expect(templates.config).toContain(VOLCENGINE_AGENT_PLAN_BASE_URL);
    expect(templates.config).not.toContain("__VOLCENGINE_BASE_URL__");
    // config.json must not fall back to the api endpoint when agent plan is chosen.
    expect(templates.config).not.toContain(`"apiBaseUrl": "${VOLCENGINE_API_BASE_URL}"`);

    // The example always shows the standard api endpoint as the active value.
    const defaultTemplates = buildConfigTemplates();
    expect(defaultTemplates.config).toContain(`"apiBaseUrl": "${VOLCENGINE_API_BASE_URL}"`);
    expect(defaultTemplates.configExample).toContain(VOLCENGINE_API_BASE_URL);
  });

  test("skill documents current provider aliases and passthrough flags", () => {
    const templates = buildConfigTemplates();

    expect(templates.skill).toContain("`doubao-seedream` -> `volcengine`");
    expect(templates.skill).toContain("`dashscope` -> `bailian`");
    expect(templates.skill).not.toContain("-> `seedream`");
    expect(templates.skill).not.toContain("-> `qwen`");
    expect(templates.skill).not.toContain("`qwen-image`");

    expect(templates.skill).toContain("--size <value>");
    expect(templates.skill).toContain("passed through");
    expect(templates.skill).toContain("explicit flag always takes precedence");
    expect(templates.skill).not.toContain("auto|WIDTHxHEIGHT");
  });

  test("workspace skill copy matches the template", async () => {
    const workspaceSkill = await readFile(
      new URL("../../.agents/skills/image-cli/SKILL.md", import.meta.url),
      "utf8"
    );

    expect(workspaceSkill).toBe(buildConfigTemplates().skill);
  });
});
