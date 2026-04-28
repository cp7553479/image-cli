import path from "node:path";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";

import { getImageConfigPaths } from "./paths.js";
import { getConfigTemplatePaths } from "./templates.js";

type InitImageConfigDirectoryOptions = {
  homeDir?: string;
  force?: boolean;
};

type InitImageConfigDirectoryResult = {
  created: string[];
  skipped: string[];
};

export async function initImageConfigDirectory(
  options: InitImageConfigDirectoryOptions = {}
): Promise<InitImageConfigDirectoryResult> {
  const homeDir = options.homeDir ?? os.homedir();
  const paths = getImageConfigPaths(homeDir);
  const templatePaths = getConfigTemplatePaths();

  const created: string[] = [];
  const skipped: string[] = [];
  const force = options.force ?? false;

  await copyTemplateDirectory(templatePaths.templateDir, paths.configDir, force, created, skipped);
  for (const skillDir of paths.skillInstallDirs.slice(1)) {
    await copyTemplateDirectory(templatePaths.skillDir, skillDir, force, created, skipped);
  }

  return {
    created,
    skipped
  };
}

async function copyTemplateDirectory(
  sourceDir: string,
  targetDir: string,
  force: boolean,
  created: string[],
  skipped: string[]
): Promise<void> {
  await mkdir(targetDir, { recursive: true });
  const entries = await readdir(sourceDir, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of entries) {
    if (entry.name === ".DS_Store") {
      continue;
    }
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      await copyTemplateDirectory(sourcePath, targetPath, force, created, skipped);
      continue;
    }
    if (entry.isFile()) {
      await copyTemplateFile(sourcePath, targetPath, force, created, skipped);
    }
  }
}

async function copyTemplateFile(
  sourcePath: string,
  targetPath: string,
  force: boolean,
  created: string[],
  skipped: string[]
): Promise<void> {
  const contents = await readFile(sourcePath);
  try {
    await writeFile(targetPath, contents, {
      flag: force ? "w" : "wx"
    });
    created.push(targetPath);
  } catch (error) {
    if (isExistingFileError(error)) {
      skipped.push(targetPath);
      return;
    }
    throw error;
  }
}

function isExistingFileError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST";
}
