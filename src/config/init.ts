import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import * as readline from "node:readline/promises";

import { getImageConfigPaths } from "./paths.js";
import {
  BAILIAN_DEFAULT_BASE_URL,
  bailianBaseUrlFromWorkspaceId,
  listConfigInitTemplateFiles,
  listSkillInitTemplateFiles,
  VOLCENGINE_AGENT_PLAN_BASE_URL,
  VOLCENGINE_API_BASE_URL,
  type InitTemplateFile
} from "./init-templates.js";

type InitImageConfigDirectoryOptions = {
  homeDir?: string;
  force?: boolean;
  /**
   * Explicit Volcengine base URL to write into config.json.
   * Internal/test hook only; not a CLI flag. When omitted, the chosen
   * endpoint is resolved interactively at init time (or defaulted).
   */
  volcengineBaseUrl?: string;
  /**
   * Explicit Bailian base URL to write into config.json.
   * Internal/test hook only; not a CLI flag. When omitted, the workspaceId is
   * prompted interactively at init time (or a placeholder is written).
   */
  bailianBaseUrl?: string;
  /** Test seam for stdin TTY detection. Defaults to process.stdin.isTTY. */
  interactiveInput?: NodeJS.ReadableStream;
  /** Test seam for prompting. Defaults to the readline-based prompt. */
  promptVolcengineEndpoint?: () => Promise<string>;
  /** Test seam for the Bailian workspaceId prompt. */
  promptBailianWorkspaceId?: () => Promise<string>;
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

  const configFiles = listConfigInitTemplateFiles({
    volcengineBaseUrl: await resolveVolcengineBaseUrlOption({
      configFile: paths.configFile,
      force,
      volcengineBaseUrl: options.volcengineBaseUrl,
      interactiveInput: options.interactiveInput,
      promptVolcengineEndpoint: options.promptVolcengineEndpoint
    }),
    bailianBaseUrl: await resolveBailianBaseUrlOption({
      configFile: paths.configFile,
      force,
      bailianBaseUrl: options.bailianBaseUrl,
      interactiveInput: options.interactiveInput,
      promptBailianWorkspaceId: options.promptBailianWorkspaceId
    })
  });
  await copyTemplateFiles(configFiles, paths.configDir, force, created, skipped);
  for (const skillDir of paths.skillInstallDirs.slice(1)) {
    await copyTemplateFiles(listSkillInitTemplateFiles(), skillDir, force, created, skipped);
  }

  return {
    created,
    skipped
  };
}

/**
 * Resolves the Volcengine base URL to bake into config.json.
 *
 * - Explicit override wins (test/non-interactive callers).
 * - When config.json is about to be written and stdin is a TTY, prompt the user.
 * - Otherwise default to the standard Ark `api` endpoint.
 */
async function resolveVolcengineBaseUrlOption(input: {
  configFile: string;
  force: boolean;
  volcengineBaseUrl?: string;
  interactiveInput?: NodeJS.ReadableStream;
  promptVolcengineEndpoint?: () => Promise<string>;
}): Promise<string> {
  if (input.volcengineBaseUrl) {
    return input.volcengineBaseUrl;
  }

  const willWriteConfig = input.force || !existsSync(input.configFile);
  if (!willWriteConfig) {
    return VOLCENGINE_API_BASE_URL;
  }

  const stdin = input.interactiveInput ?? process.stdin;
  if (!isInteractive(stdin)) {
    return VOLCENGINE_API_BASE_URL;
  }

  const prompt = input.promptVolcengineEndpoint ?? defaultPromptVolcengineEndpoint;
  return await prompt();
}

function isInteractive(stream: NodeJS.ReadableStream | undefined): boolean {
  return Boolean(stream && (stream as { isTTY?: boolean }).isTTY);
}

/**
 * Prompts the user to choose a Volcengine endpoint when stdin is interactive.
 */
async function defaultPromptVolcengineEndpoint(): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(
      "Volcengine endpoint: 1=api (default), 2=agent plan [1-2]: "
    );
    return answer.trim() === "2" ? VOLCENGINE_AGENT_PLAN_BASE_URL : VOLCENGINE_API_BASE_URL;
  } finally {
    rl.close();
  }
}

/**
 * Resolves the Bailian base URL to bake into config.json.
 *
 * - Explicit override wins (test/non-interactive callers).
 * - When config.json is about to be written and stdin is a TTY, prompt for the
 *   workspaceId and build the workspace-specific MaaS base URL.
 * - Otherwise write a placeholder the user must fill in.
 */
async function resolveBailianBaseUrlOption(input: {
  configFile: string;
  force: boolean;
  bailianBaseUrl?: string;
  interactiveInput?: NodeJS.ReadableStream;
  promptBailianWorkspaceId?: () => Promise<string>;
}): Promise<string> {
  if (input.bailianBaseUrl) {
    return input.bailianBaseUrl;
  }

  const willWriteConfig = input.force || !existsSync(input.configFile);
  if (!willWriteConfig) {
    return BAILIAN_DEFAULT_BASE_URL;
  }

  const stdin = input.interactiveInput ?? process.stdin;
  if (!isInteractive(stdin)) {
    return BAILIAN_DEFAULT_BASE_URL;
  }

  const prompt = input.promptBailianWorkspaceId ?? defaultPromptBailianWorkspaceId;
  return await prompt();
}

/**
 * Prompts for the Bailian (DashScope) workspaceId and builds the base URL.
 */
async function defaultPromptBailianWorkspaceId(): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(
      "Bailian workspaceId (from https://bailian.console.aliyun.com, e.g. llm-xxxxxxxx): "
    );
    const workspaceId = answer.trim();
    return workspaceId
      ? bailianBaseUrlFromWorkspaceId(workspaceId)
      : BAILIAN_DEFAULT_BASE_URL;
  } finally {
    rl.close();
  }
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
