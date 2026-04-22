import { readFile } from "node:fs/promises";
import os from "node:os";

import { parse as parseDotEnv } from "dotenv";

import { CANONICAL_PROVIDER_IDS } from "../protocol/model-ref.js";
import type { CanonicalProviderId } from "../protocol/types.js";
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

  const dotenvValues = await readFile(paths.envFile, "utf8")
    .then((contents) => parseDotEnv(contents))
    .catch(() => ({}));
  const runtimeEnv = options.env ?? {};

  const providers = CANONICAL_PROVIDER_IDS.reduce<
    Record<CanonicalProviderId, ResolvedProviderConfig>
  >((accumulator, providerId) => {
    const providerConfig = configFile.providers[providerId];
    if (!providerConfig) {
      return accumulator;
    }

    accumulator[providerId] = resolveProviderConfig(
      providerConfig,
      runtimeEnv,
      dotenvValues
    );
    return accumulator;
  }, {} as Record<CanonicalProviderId, ResolvedProviderConfig>);

  return {
    version: configFile.version,
    defaultProvider: configFile.defaultProvider,
    providers
  };
}

function resolveProviderConfig(
  providerConfig: ProviderConfig,
  runtimeEnv: Record<string, string | undefined>,
  dotenvValues: Record<string, string>
): ResolvedProviderConfig {
  const credentials = providerConfig.apiKeyEnvNames.flatMap((envName) => {
    const value = runtimeEnv[envName] ?? dotenvValues[envName];
    if (!value) {
      return [];
    }

    return [
      {
        envName,
        value
      }
    ];
  });

  return {
    ...providerConfig,
    credentials
  };
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
