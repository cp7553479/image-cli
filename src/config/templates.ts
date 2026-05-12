import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type ConfigTemplatePaths = {
  templateDir: string;
  skillDir: string;
};

export type ConfigTemplates = {
  config: string;
  configExample: string;
  readme: string;
  skill: string;
  skillReadme: string;
};

/**
 * getConfigTemplatePaths 的导出入口。
 */
export function getConfigTemplatePaths(): ConfigTemplatePaths {
  const templateRoot = resolveConfigTemplateRoot(import.meta.url);
  return {
    templateDir: templateRoot,
    skillDir: path.join(templateRoot, "skills", "image-cli")
  };
}

/**
 * resolveConfigTemplateRoot 的导出入口。
 */
export function resolveConfigTemplateRoot(moduleUrl: string): string {
  const candidates = [
    fileURLToPath(new URL("../../templates/init", moduleUrl)),
    fileURLToPath(new URL("../../../templates/init", moduleUrl))
  ];
  return path.resolve(candidates.find((candidate) => existsSync(candidate)) ?? candidates[0]);
}

/**
 * buildConfigTemplates 的导出入口。
 */
export function buildConfigTemplates(): ConfigTemplates {
  const paths = getConfigTemplatePaths();
  return {
    config: readUtf8(path.join(paths.templateDir, "config.json")),
    configExample: readUtf8(path.join(paths.templateDir, "config.example.jsonc")),
    readme: readUtf8(path.join(paths.templateDir, "README.md")),
    skill: readUtf8(path.join(paths.skillDir, "SKILL.md")),
    skillReadme: readUtf8(path.join(paths.skillDir, "README.md"))
  };
}

function readUtf8(filePath: string): string {
  return readFileSync(filePath, "utf8");
}
