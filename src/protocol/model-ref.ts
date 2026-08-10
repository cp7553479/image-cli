import {
  listBuiltInProviderIds,
  resolveProviderAlias as resolveProviderIdentityAlias
} from "../providers/identity.js";
import type { ModelRef } from "./types.js";

/**
 * CANONICAL_PROVIDER_IDS 的导出入口。
 */
export const CANONICAL_PROVIDER_IDS = listBuiltInProviderIds();

/**
 * resolveProviderAlias 的导出入口。
 */
export function resolveProviderAlias(value: string): string {
  return resolveProviderIdentityAlias(value);
}

/**
 * parseModelRef 的导出入口。
 */
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
