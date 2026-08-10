import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";

import { getImageConfigPaths } from "./paths.js";
import {
  listConfigInitTemplateFiles,
  listSkillInitTemplateFiles,
  type InitTemplateFile
} from "./init-templates.js";

type InitImageConfigDirectoryOptions = {
  homeDir?: string;
  force?: boolean;
};

type InitImageConfigDirectoryResult = {
  created: string[];
  skipped: string[];
};

/**
 * initImageConfigDirectory 的导出入口。
 */
export async function initImageConfigDirectory(
  options: InitImageConfigDirectoryOptions = {}
): Promise<InitImageConfigDirectoryResult> {
  const homeDir = options.homeDir ?? os.homedir();
  const paths = getImageConfigPaths(homeDir);

  const created: string[] = [];
  const skipped: string[] = [];
  const force = options.force ?? false;

  await copyTemplateFiles(listConfigInitTemplateFiles(), paths.configDir, force, created, skipped);
  for (const skillDir of paths.skillInstallDirs.slice(1)) {
    await copyTemplateFiles(listSkillInitTemplateFiles(), skillDir, force, created, skipped);
  }

  return {
    created,
    skipped
  };
}

async function copyTemplateFiles(
  files: InitTemplateFile[],
  targetDir: string,
  force: boolean,
  created: string[],
  skipped: string[]
): Promise<void> {
  const sortedFiles = [...files].sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  for (const file of sortedFiles) {
    await copyTemplateFile(file, targetDir, force, created, skipped);
  }
}

async function copyTemplateFile(
  file: InitTemplateFile,
  targetDir: string,
  force: boolean,
  created: string[],
  skipped: string[]
): Promise<void> {
  const targetPath = path.join(targetDir, file.relativePath);
  await mkdir(path.dirname(targetPath), { recursive: true });
  try {
    await writeFile(targetPath, file.contents, {
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
