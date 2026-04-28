import { describe, expect, test } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  buildConfigTemplates,
  getConfigTemplatePaths,
  resolveConfigTemplateRoot
} from "../../src/config/templates.js";

describe("config templates", () => {
  test("points to initialization template directories", () => {
    const paths = getConfigTemplatePaths();

    expect(paths.templateDir).toContain("templates/init");
    expect(paths.skillDir).toContain("templates/init/skills/image-cli");
    expect(existsSync(path.join(paths.templateDir, "config.json"))).toBe(true);
    expect(existsSync(path.join(paths.templateDir, "config.example.jsonc"))).toBe(true);
    expect(existsSync(path.join(paths.templateDir, "README.md"))).toBe(true);
    expect(existsSync(path.join(paths.templateDir, "skills", "image-cli", "SKILL.md"))).toBe(true);
    expect(existsSync(path.join(paths.templateDir, "image-config"))).toBe(false);
    expect(existsSync(path.join(paths.templateDir, "skill"))).toBe(false);
  });

  test("resolves template directory from compiled dist modules", () => {
    const distModuleUrl = pathToFileURL(
      path.join(process.cwd(), "dist", "src", "config", "templates.js")
    ).href;

    expect(resolveConfigTemplateRoot(distModuleUrl)).toBe(
      path.join(process.cwd(), "templates", "init")
    );
  });

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
});
