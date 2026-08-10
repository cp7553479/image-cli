import os from "node:os";

import { loadResolvedConfig } from "../config/load.js";
import type { ResolvedProviderConfig } from "../config/types.js";
import { executeCurlRequest, type CurlExecutionResult, type CurlRequest } from "../transport/curl.js";
import { PROVIDER_CATALOG } from "./catalog.js";
import { resolveProviderAlias } from "./identity.js";
import { loadPluginManifests } from "../plugins/loader.js";

type ExecuteRequest = (request: CurlRequest) => Promise<CurlExecutionResult>;

type ProviderListOptions = {
  homeDir?: string;
};

type ModelListOptions = {
  homeDir?: string;
  execute?: ExecuteRequest;
  limit?: number;
};

export type ConfiguredProviderEntry = {
  providerId: string;
  enabled: boolean;
  apiBaseUrl: string;
  credentialCount: number;
  aliases: string[];
  builtIn: boolean;
  plugin: boolean;
  defaultModel?: string;
};

export type ProviderModelEntry = {
  id: string;
  name?: string;
};

export type ProviderModelListResult = {
  providerId: string;
  source: "api" | "fallback";
  models: ProviderModelEntry[];
  warnings: string[];
};

const FALLBACK_MODEL_WARNING =
  "Built-in model ids may be incomplete or outdated. Confirm the actual model ids with the provider before use.";

const API_MODEL_SCOPE_WARNING =
  "API model lists may include models that are not valid for image generation. Confirm image-generation support before use.";

// See docs/error-handling.md#model-listing for fallback warning requirements.
const NO_MODEL_CATALOG_WARNING =
  "No built-in model catalog is available for this provider. Confirm model ids with the provider before use.";

const FALLBACK_MODELS: Record<string, ProviderModelEntry[]> = {
  openai: [
    { id: "gpt-image-2" },
    { id: "gpt-image-1.5" },
    { id: "gpt-image-1" },
    { id: "dall-e-3" }
  ],
  openrouter: [
    { id: "google/gemini-3.1-flash-image-preview" }
  ],
  gemini: [
    { id: "gemini-3.1-flash-image" },
    { id: "gemini-3.1-flash-image-preview" }
  ],
  seedream: [
    { id: "doubao-seedream-5.0-lite" },
    { id: "doubao-seedream-4-5-251128" },
    { id: "doubao-seedream-4.5" }
  ],
  qwen: [
    { id: "qwen-image-2.0-pro" },
    { id: "qwen-image-2.0-pro-2026-03-03" },
    { id: "qwen-image-2.0" },
    { id: "qwen-image-2.0-2026-03-03" },
    { id: "qwen-image-max" },
    { id: "qwen-image-max-2025-12-30" },
    { id: "qwen-image-plus" },
    { id: "qwen-image-plus-2026-01-09" },
    { id: "qwen-image" }
  ],
  minimax: [
    { id: "image-01" }
  ]
};

const API_MODEL_PROVIDERS = new Set(["openai", "openrouter", "gemini"]);

/**
 * listConfiguredProviders 的导出入口。
 */
export async function listConfiguredProviders(
  options: ProviderListOptions = {}
): Promise<ConfiguredProviderEntry[]> {
  const homeDir = options.homeDir ?? os.homedir();
  const resolvedConfig = await loadResolvedConfig({ homeDir });
  const builtInById = new Map<string, (typeof PROVIDER_CATALOG)[number]>(
    PROVIDER_CATALOG.map((entry) => [entry.providerId, entry])
  );
  const pluginsById = new Map(
    loadPluginManifests(homeDir).map((manifest) => [manifest.providerId, manifest])
  );
  const defaultProviderId = readDefaultProviderId(resolvedConfig.defaultModel);

  return Object.entries(resolvedConfig.providers).map(([providerId, provider]) => {
    const builtIn = builtInById.get(providerId);
    const plugin = pluginsById.get(providerId);
    return {
      providerId,
      enabled: provider.enabled,
      apiBaseUrl: provider.apiBaseUrl,
      credentialCount: provider.credentials.length,
      aliases: builtIn ? [...builtIn.aliases] : plugin?.aliases ?? [],
      builtIn: Boolean(builtIn),
      plugin: Boolean(plugin),
      defaultModel: defaultProviderId === providerId ? resolvedConfig.defaultModel : undefined
    };
  });
}

/**
 * listProviderModels 的导出入口。
 */
export async function listProviderModels(
  providerId: string,
  options: ModelListOptions = {}
): Promise<ProviderModelListResult> {
  const homeDir = options.homeDir ?? os.homedir();
  const resolvedConfig = await loadResolvedConfig({ homeDir });
  const providerConfig = resolvedConfig.providers[providerId];
  if (!providerConfig) {
    throw new Error(`Provider "${providerId}" is not configured in ~/.image/config.json.`);
  }

  if (API_MODEL_PROVIDERS.has(providerId) && canUseModelListApi(providerId, providerConfig)) {
    const apiResult = await fetchProviderModels(providerId, providerConfig, {
      execute: options.execute ?? executeCurlRequest
    }).catch((error: unknown) => ({
      error: toErrorMessage(error)
    }));

    if ("models" in apiResult) {
      return {
        providerId,
        source: "api",
        models: applyLimit(apiResult.models, options.limit),
        warnings: [API_MODEL_SCOPE_WARNING]
      };
    }

    return fallbackModelList(providerId, [
      `Could not fetch models from provider API: ${apiResult.error}`,
      FALLBACK_MODEL_WARNING
    ], options.limit);
  }

  const warnings = API_MODEL_PROVIDERS.has(providerId)
    ? ["No configured API key was found for API model listing.", FALLBACK_MODEL_WARNING]
    : [FALLBACK_MODEL_WARNING];
  return fallbackModelList(providerId, warnings, options.limit);
}

/**
 * formatConfiguredProvidersText 的导出入口。
 */
export function formatConfiguredProvidersText(entries: ConfiguredProviderEntry[]): string {
  if (entries.length === 0) {
    return "No providers are configured in ~/.image/config.json.\n";
  }

  return entries.map((entry) => [
    entry.providerId,
    entry.enabled ? undefined : "disabled",
    entry.aliases.length > 0 ? `aliases=${entry.aliases.join(",")}` : undefined,
    entry.defaultModel ? `default=${entry.defaultModel}` : undefined
  ].filter(Boolean).join(" ")).join("\n") + "\n";
}

/**
 * formatProviderModelsText 的导出入口。
 */
export function formatProviderModelsText(result: ProviderModelListResult): string {
  return [
    ...result.warnings.map((warning) => `warning: ${warning}`),
    ...result.models.map((model) => model.id)
  ].join("\n") + "\n";
}

async function fetchProviderModels(
  providerId: string,
  providerConfig: ResolvedProviderConfig,
  options: { execute: ExecuteRequest }
): Promise<{ models: ProviderModelEntry[] }> {
  if (providerId === "openai") {
    return await fetchOpenAiModels(providerConfig, options.execute);
  }
  if (providerId === "openrouter") {
    return await fetchOpenRouterModels(providerConfig, options.execute);
  }
  if (providerId === "gemini") {
    return await fetchGeminiModels(providerConfig, options.execute);
  }
  throw new Error(`Provider "${providerId}" does not support API model listing.`);
}

async function fetchOpenAiModels(
  providerConfig: ResolvedProviderConfig,
  execute: ExecuteRequest
): Promise<{ models: ProviderModelEntry[] }> {
  const result = await execute({
    method: "GET",
    url: joinUrl(providerConfig.apiBaseUrl, "models"),
    headers: {
      Authorization: `Bearer ${providerConfig.credentials[0]?.value ?? ""}`
    },
    timeoutMs: providerConfig.timeoutMs
  });
  assertSuccessfulResponse("OpenAI", result);
  const body = parseJsonRecord(result.bodyText);
  return {
    models: parseDataModels(body)
  };
}

async function fetchOpenRouterModels(
  providerConfig: ResolvedProviderConfig,
  execute: ExecuteRequest
): Promise<{ models: ProviderModelEntry[] }> {
  const credential = providerConfig.credentials[0]?.value;
  const result = await execute({
    method: "GET",
    url: joinUrl(providerConfig.apiBaseUrl, "models"),
    headers: credential ? { Authorization: `Bearer ${credential}` } : undefined,
    timeoutMs: providerConfig.timeoutMs
  });
  assertSuccessfulResponse("OpenRouter", result);
  const body = parseJsonRecord(result.bodyText);
  return {
    models: parseDataModels(body)
  };
}

async function fetchGeminiModels(
  providerConfig: ResolvedProviderConfig,
  execute: ExecuteRequest
): Promise<{ models: ProviderModelEntry[] }> {
  const models: ProviderModelEntry[] = [];
  let pageToken: string | undefined;
  for (let pageIndex = 0; pageIndex < 100; pageIndex += 1) {
    const url = new URL(joinUrl(providerConfig.apiBaseUrl, "models"));
    if (pageToken) {
      url.searchParams.set("pageToken", pageToken);
    }
    const result = await execute({
      method: "GET",
      url: url.toString(),
      headers: {
        "x-goog-api-key": providerConfig.credentials[0]?.value ?? ""
      },
      timeoutMs: providerConfig.timeoutMs
    });
    assertSuccessfulResponse("Gemini", result);
    const body = parseJsonRecord(result.bodyText);
    models.push(...parseGeminiModels(body));
    pageToken = readString(body.nextPageToken);
    if (!pageToken) {
      return { models };
    }
  }
  throw new Error("Gemini model list pagination did not terminate.");
}

function parseGeminiModels(body: Record<string, unknown>): ProviderModelEntry[] {
  const rawModels = Array.isArray(body.models) ? body.models : [];
  return rawModels.flatMap((entry) => {
    if (!isRecord(entry)) {
      return [];
    }
    const rawName = readString(entry.name);
    if (!rawName) {
      return [];
    }
    return [{
      id: rawName.replace(/^models\//, ""),
      name: readString(entry.displayName)
    }];
  });
}

function fallbackModelList(
  providerId: string,
  warnings: string[],
  limit: number | undefined
): ProviderModelListResult {
  const models = FALLBACK_MODELS[providerId] ?? [];
  const finalWarnings = models.length > 0
    ? warnings
    : [...warnings, NO_MODEL_CATALOG_WARNING];
  return {
    providerId,
    source: "fallback",
    models: applyLimit(models, limit),
    warnings: finalWarnings
  };
}

function canUseModelListApi(
  providerId: string,
  providerConfig: ResolvedProviderConfig
): boolean {
  if (providerId === "openrouter") {
    return true;
  }
  return providerConfig.credentials.length > 0;
}

function applyLimit(models: ProviderModelEntry[], limit: number | undefined): ProviderModelEntry[] {
  if (limit === undefined || limit <= 0) {
    return models;
  }
  return models.slice(0, limit);
}

function readDefaultProviderId(defaultModel: string): string | undefined {
  const slashIndex = defaultModel.indexOf("/");
  if (slashIndex <= 0) {
    return undefined;
  }

  try {
    return resolveProviderAlias(defaultModel.slice(0, slashIndex));
  } catch {
    return defaultModel.slice(0, slashIndex);
  }
}

function parseDataModels(body: Record<string, unknown>): ProviderModelEntry[] {
  const data = Array.isArray(body.data) ? body.data : [];
  return data.flatMap((entry) => {
    if (!isRecord(entry)) {
      return [];
    }
    const id = readString(entry.id);
    if (!id) {
      return [];
    }
    return [{
      id,
      name: readString(entry.name)
    }];
  });
}

function assertSuccessfulResponse(providerName: string, result: CurlExecutionResult): void {
  if (result.statusCode < 200 || result.statusCode >= 300) {
    throw new Error(`${providerName} model list returned HTTP ${result.statusCode}.`);
  }
}

function parseJsonRecord(bodyText: string): Record<string, unknown> {
  const parsed = JSON.parse(bodyText) as unknown;
  if (!isRecord(parsed)) {
    throw new Error("Model list response was not a JSON object.");
  }
  return parsed;
}

function joinUrl(baseUrl: string, path: string): string {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(path, normalizedBase).toString();
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
