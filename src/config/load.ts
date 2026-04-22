import { readFile } from "node:fs/promises";
import os from "node:os";

import { getImageConfigPaths } from "./paths.js";
import type {
  ProviderConfig,
  ResolvedConfig,
  ResolvedProviderConfig,
  RuntimeConfigFile
} from "./types.js";

type LoadResolvedConfigOptions = {
  homeDir?: string;
  env?: Record<string, string | undefined>;
};

export async function loadResolvedConfig(
  options: LoadResolvedConfigOptions = {}
): Promise<ResolvedConfig> {
  const homeDir = options.homeDir ?? os.homedir();
  const paths = getImageConfigPaths(homeDir);
  const configContents = await readFile(paths.configFile, "utf8").catch((error) => {
    const message = toErrorMessage(error);
    if (message.includes("ENOENT")) {
      throw new Error(
        `Missing ~/.image/config.json. Run "image config init" first.`
      );
    }
    throw new Error(`Failed to read config.json: ${message}`);
  });

  let configFile: RuntimeConfigFile;
  try {
    configFile = JSON.parse(configContents) as RuntimeConfigFile;
  } catch (error) {
    throw new Error(`Failed to parse config.json: ${toErrorMessage(error)}`);
  }

  const providers = Object.fromEntries(
    Object.entries(configFile.providers ?? {}).map(([providerId, providerConfig]) => [
      providerId,
      resolveProviderConfig(providerConfig)
    ])
  );

  return {
    version: configFile.version,
    defaultModel: configFile.defaultModel,
    providers
  };
}

function resolveProviderConfig(
  providerConfig: ProviderConfig
): ResolvedProviderConfig {
  const apiKeys = normalizeApiKeys(providerConfig.api_key ?? providerConfig.apiKey);
  const credentials = apiKeys.map((value, index) => ({
    envName: apiKeys.length === 1 ? "API_KEY" : `API_KEY_${index + 1}`,
    value
  }));

  return {
    ...providerConfig,
    credentials
  };
}

function normalizeApiKeys(value: string | string[] | undefined): string[] {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }

  if (Array.isArray(value)) {
    return value
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  return [];
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
