import openaiProviderPlugin from "./openai/index.js";
import openrouterProviderPlugin from "./openrouter/index.js";
import geminiProvider from "./gemini/index.js";
import seedreamProviderPlugin from "./seedream/index.js";
import qwenProvider from "./qwen/index.js";
import minimaxProviderPlugin from "./minimax/index.js";

import type { CanonicalProviderId } from "../protocol/types.js";
import type { ProviderPlugin } from "./types.js";

const PROVIDERS: Record<CanonicalProviderId, ProviderPlugin> = {
  openai: openaiProviderPlugin,
  openrouter: openrouterProviderPlugin,
  gemini: geminiProvider,
  seedream: seedreamProviderPlugin,
  qwen: qwenProvider,
  minimax: minimaxProviderPlugin
};

export function getProviderPlugin(providerId: CanonicalProviderId): ProviderPlugin {
  return PROVIDERS[providerId];
}

export function listProviderPlugins(): ProviderPlugin[] {
  return Object.values(PROVIDERS);
}
