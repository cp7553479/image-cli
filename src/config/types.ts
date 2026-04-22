export type RetryPolicy = {
  maxAttempts: number;
};

export type ProviderConfig = {
  enabled: boolean;
  apiBaseUrl: string;
  timeoutMs: number;
  retryPolicy: RetryPolicy;
  apiKey?: string | string[];
  api_key?: string | string[];
};

export type RuntimeConfigFile = {
  version: number;
  defaultModel: string;
  providers: Record<string, ProviderConfig>;
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
  defaultModel: string;
  providers: Record<string, ResolvedProviderConfig>;
};

export type ImageConfigPaths = {
  configDir: string;
  configFile: string;
  configExampleFile: string;
  readmeFile: string;
};
