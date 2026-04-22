import openaiProviderPlugin from "./openai/index.js";
import openrouterProviderPlugin from "./openrouter/index.js";
import geminiProvider from "./gemini/index.js";
import seedreamProviderPlugin from "./seedream/index.js";
import qwenProvider from "./qwen/index.js";
import minimaxProviderPlugin from "./minimax/index.js";
import { findPluginProvider, loadPluginManifests } from "../plugins/loader.js";

import type { ProviderPlugin } from "./types.js";

const PROVIDERS: Record<string, ProviderPlugin> = {
  openai: openaiProviderPlugin,
  openrouter: openrouterProviderPlugin,
  gemini: geminiProvider,
  seedream: seedreamProviderPlugin,
  qwen: qwenProvider,
  minimax: minimaxProviderPlugin
};

export function getProviderPlugin(providerId: string, options?: { homeDir?: string }): ProviderPlugin {
  const builtIn = PROVIDERS[providerId];
  if (builtIn) {
    return builtIn;
  }

  const plugin = findPluginProvider(providerId, options?.homeDir);
  if (plugin) {
    return plugin;
  }

  throw new Error(`Unknown provider "${providerId}".`);
}

export function listProviderPlugins(options?: { homeDir?: string }): ProviderPlugin[] {
  const pluginProviders = loadPluginManifests(options?.homeDir).map((manifest) =>
    findPluginProvider(manifest.providerId, options?.homeDir)
  ).filter((plugin): plugin is ProviderPlugin => Boolean(plugin));
  return [...Object.values(PROVIDERS), ...pluginProviders];
}
