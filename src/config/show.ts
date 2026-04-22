import os from "node:os";

import { loadResolvedConfig } from "./load.js";

type ShowConfigOptions = {
  homeDir?: string;
  env?: Record<string, string | undefined>;
};

export async function getSanitizedResolvedConfig(
  options: ShowConfigOptions = {}
): Promise<Record<string, unknown>> {
  const resolvedConfig = await loadResolvedConfig({
    homeDir: options.homeDir ?? os.homedir(),
    env: options.env
  });

  return {
    version: resolvedConfig.version,
    defaultModel: resolvedConfig.defaultModel,
    providers: Object.fromEntries(
      Object.entries(resolvedConfig.providers).map(([providerId, provider]) => [
        providerId,
        {
          enabled: provider.enabled,
          apiBaseUrl: provider.apiBaseUrl,
          timeoutMs: provider.timeoutMs,
          retryPolicy: provider.retryPolicy,
          apiKey: {
            present: Boolean(provider.api_key ?? provider.apiKey)
          },
          credentials: provider.credentials.map((credential) => ({
            envName: credential.envName,
            present: Boolean(credential.value)
          }))
        }
      ])
    )
  };
}
