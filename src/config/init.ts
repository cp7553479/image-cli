import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";

import { getImageConfigPaths } from "./paths.js";
import { buildConfigTemplates } from "./templates.js";

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
  const templates = buildConfigTemplates();

  await mkdir(paths.configDir, { recursive: true });

  const created: string[] = [];
  const skipped: string[] = [];

  await writeIfMissing(
    paths.configFile,
    stripCommentLines(templates.configExample),
    options.force ?? false,
    created,
    skipped
  );
  await writeIfMissing(
    paths.configExampleFile,
    templates.configExample,
    options.force ?? false,
    created,
    skipped
  );
  await writeAlways(paths.readmeFile, templates.readme, created);

  return {
    created,
    skipped
  };
}

async function writeIfMissing(
  filePath: string,
  contents: string,
  force: boolean,
  created: string[],
  skipped: string[]
): Promise<void> {
  try {
    await writeFile(filePath, contents, {
      flag: force ? "w" : "wx"
    });
    created.push(filePath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("EEXIST")) {
      skipped.push(filePath);
      return;
    }
    throw error;
  }
}

async function writeAlways(
  filePath: string,
  contents: string,
  created: string[]
): Promise<void> {
  await writeFile(filePath, contents, {
    flag: "w"
  });
  created.push(filePath);
}

function stripCommentLines(contents: string): string {
  return contents
    .split("\n")
    .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("#"))
    .join("\n")
    .trimStart();
}
