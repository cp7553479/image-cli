import type { CanonicalProviderId, ModelRef } from "./types.js";

export const CANONICAL_PROVIDER_IDS: CanonicalProviderId[] = [
  "openai",
  "openrouter",
  "gemini",
  "seedream",
  "qwen",
  "minimax"
];

const PROVIDER_ALIAS_MAP: Record<string, CanonicalProviderId> = {
  openai: "openai",
  "chatgpt-image": "openai",
  openrouter: "openrouter",
  "openrouter-image": "openrouter",
  gemini: "gemini",
  "nano-banana": "gemini",
  seedream: "seedream",
  qwen: "qwen",
  "qwen-image": "qwen",
  minimax: "minimax",
  "minimax-image": "minimax"
};

const CUSTOM_PROVIDER_PATTERN = /^[a-z0-9][a-z0-9_-]*$/i;

export function resolveProviderAlias(value: string): string {
  const normalized = value.trim().toLowerCase();
  const providerId = PROVIDER_ALIAS_MAP[normalized];
  if (providerId) {
    return providerId;
  }

  if (CUSTOM_PROVIDER_PATTERN.test(normalized)) {
    return normalized;
  }

  throw new Error(
    `Unknown provider "${value}". Expected one of: ${Object.keys(PROVIDER_ALIAS_MAP).join(", ")} or a custom provider id.`
  );
}

export function parseModelRef(value: string): ModelRef {
  const trimmed = value.trim();
  const slashIndex = trimmed.indexOf("/");
  if (slashIndex <= 0) {
    throw new Error(
      "Invalid model reference. Expected --model provider_id/model_id."
    );
  }

  const providerAlias = trimmed.slice(0, slashIndex).trim().toLowerCase();
  const modelId = trimmed.slice(slashIndex + 1).trim();
  if (!modelId) {
    throw new Error("Missing model id in --model provider_id/model_id.");
  }

  return {
    providerId: resolveProviderAlias(providerAlias),
    providerAlias,
    modelId
  };
}
