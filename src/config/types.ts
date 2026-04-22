import type { CanonicalProviderId } from "../protocol/types.js";

export type RetryPolicy = {
  maxAttempts: number;
  retryableHttpStatus: number[];
};

export type ProviderConfig = {
  enabled: boolean;
  apiBaseUrl: string;
  defaultModel: string;
  timeoutMs: number;
  retryPolicy: RetryPolicy;
  apiKeyEnvNames: string[];
};

export type RuntimeConfigFile = {
  version: number;
  defaultProvider: CanonicalProviderId;
  providers: Partial<Record<CanonicalProviderId, ProviderConfig>>;
};

export type CredentialEntry = {
  envName: string;
  value: string;
};

export type ResolvedProviderConfig = ProviderConfig & {
  credentials: CredentialEntry[];
};

export type ResolvedConfig = {
  version: number;
  defaultProvider: CanonicalProviderId;
  providers: Record<CanonicalProviderId, ResolvedProviderConfig>;
};

export type ImageConfigPaths = {
  configDir: string;
  configFile: string;
  envFile: string;
  envExampleFile: string;
  gitignoreFile: string;
  configExampleFile: string;
};
