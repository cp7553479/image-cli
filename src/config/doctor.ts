import { access } from "node:fs/promises";
import os from "node:os";
import { spawn } from "node:child_process";

import { getImageConfigPaths } from "./paths.js";
import { loadResolvedConfig } from "./load.js";

type DoctorOptions = {
  homeDir?: string;
  env?: Record<string, string | undefined>;
};

export async function runConfigDoctor(
  options: DoctorOptions = {}
): Promise<Record<string, unknown>> {
  const homeDir = options.homeDir ?? os.homedir();
  const paths = getImageConfigPaths(homeDir);
  const [configExists, envExists, curlAvailable] = await Promise.all([
    fileExists(paths.configFile),
    fileExists(paths.envFile),
    hasCurl()
  ]);

  let resolvedConfig: Record<string, unknown> | undefined;
  let configError: string | undefined;
  try {
    const config = await loadResolvedConfig({
      homeDir,
      env: options.env
    });
    resolvedConfig = {
      defaultProvider: config.defaultProvider,
      providers: Object.fromEntries(
        Object.entries(config.providers).map(([providerId, provider]) => [
          providerId,
          {
            enabled: provider.enabled,
            credentialCount: provider.credentials.length
          }
        ])
      )
    };
  } catch (error) {
    configError = error instanceof Error ? error.message : String(error);
  }

  return {
    paths,
    curlAvailable,
    configExists,
    envExists,
    resolvedConfig,
    configError
  };
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function hasCurl(): Promise<boolean> {
  return await new Promise((resolve) => {
    const child = spawn("curl", ["--version"], {
      stdio: "ignore"
    });
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
  });
}
