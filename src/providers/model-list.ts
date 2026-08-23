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
  /** `provider_id/model_id` reference usable directly as --model. */
  modelRef?: string;
};

export type ProviderModelListResult = {
  providerId: string;
  source: "api" | "fallback";
  models: ProviderModelEntry[];
  warnings: string[];
  /** Full model count before --limit truncation; present only when truncated. */
  total?: number;
};

/** One provider's identity and configuration summary for `image provider <id>`. */
export type ProviderSummary = {
  providerId: string;
  aliases: string[];
  type: "built-in" | "plugin";
  description?: string;
  configured: boolean;
  enabled?: boolean;
  credentialCount?: number;
  apiBaseUrl?: string;
  defaultModel?: string;
};

const FALLBACK_MODEL_WARNING =
  "Built-in model ids may be incomplete or outdated. Confirm the actual model ids with the provider before use.";

const API_MODEL_SCOPE_WARNING =
  "API model lists may include models that are not valid for image generation. Known image model families (image, dall-e, imagen, banana, seedream) are listed first; confirm support with the provider before use.";

// Shared id pattern for well-known image model families; used only to order
// API-sourced lists, never to filter or to claim per-model capability.
const IMAGE_MODEL_ID_PATTERN = /image|dall-e|imagen|banana|seedream/i;

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
  volcengine: [
    { id: "doubao-seedream-5.0-lite" },
    { id: "doubao-seedream-4-5-251128" },
    { id: "doubao-seedream-4.5" }
  ],
  bailian: [
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
  ],
  // Bundled plugin provider (plugins/oracle): ids the plugin maps onto the
  // oracle CLI's browser-mode model and thinking-time flags.
  oracle: [
    { id: "gpt-5.6-sol" },
    { id: "gpt-5.6-sol-medium" },
    { id: "gpt-5.6-sol-pro" },
    { id: "gpt-5.6-sol-extra-high" },
    { id: "gpt-5.5-pro" },
    { id: "gemini-3-pro" }
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
  // Help output advertises aliases (e.g. chatgpt-image, oracle-image), so the
  // listing surface must resolve them exactly like --model routing does.
  const canonicalProviderId = resolveListingProviderId(providerId, homeDir);
  const providerConfig = resolvedConfig.providers[canonicalProviderId];
  if (!providerConfig) {
    throw new Error(
      `Provider "${canonicalProviderId}" is not configured in ~/.image/config.json. Run 'image provider list' to see configured providers.`
    );
  }

  if (API_MODEL_PROVIDERS.has(canonicalProviderId) && canUseModelListApi(canonicalProviderId, providerConfig)) {
    const apiResult = await fetchProviderModels(canonicalProviderId, providerConfig, {
      execute: options.execute ?? executeCurlRequest
    }).catch((error: unknown) => ({
      error: toErrorMessage(error)
    }));

    if ("models" in apiResult) {
      const all = withModelRefs(canonicalProviderId, orderKnownImageModelsFirst(apiResult.models));
      const limited = limitModels(all, options.limit);
      return {
        providerId: canonicalProviderId,
        source: "api",
        models: limited.models,
        warnings: [API_MODEL_SCOPE_WARNING],
        ...limited.total !== undefined ? { total: limited.total } : {}
      };
    }

    return fallbackModelList(canonicalProviderId, [
      `Could not fetch models from provider API: ${apiResult.error}`,
      FALLBACK_MODEL_WARNING
    ], options.limit);
  }

  const warnings = API_MODEL_PROVIDERS.has(canonicalProviderId)
    ? ["No configured API key was found for API model listing.", FALLBACK_MODEL_WARNING]
    : [FALLBACK_MODEL_WARNING];
  return fallbackModelList(canonicalProviderId, warnings, options.limit);
}

/**
 * Resolves a provider id or alias (built-in catalog plus installed plugins)
 * for the listing surface; unknown-but-plausible ids pass through unchanged so
 * the caller reports them as unconfigured.
 */
function resolveListingProviderId(providerId: string, homeDir: string): string {
  const identities = [
    ...PROVIDER_CATALOG,
    ...loadPluginManifests(homeDir).map((manifest) => ({
      providerId: manifest.providerId,
      aliases: manifest.aliases ?? []
    }))
  ];
  try {
    return resolveProviderAlias(providerId, identities);
  } catch {
    return providerId;
  }
}

/** Attaches `modelRef` (`provider_id/model_id`) so JSON entries are --model ready. */
function withModelRefs(providerId: string, models: ProviderModelEntry[]): ProviderModelEntry[] {
  return models.map((model) => ({ ...model, modelRef: `${providerId}/${model.id}` }));
}

/** Stable-orders models matching known image families ahead of everything else. */
function orderKnownImageModelsFirst(models: ProviderModelEntry[]): ProviderModelEntry[] {
  const imageModels = models.filter((model) => IMAGE_MODEL_ID_PATTERN.test(model.id));
  const otherModels = models.filter((model) => !IMAGE_MODEL_ID_PATTERN.test(model.id));
  return [...imageModels, ...otherModels];
}

/** Applies --limit and records the pre-truncation total for display. */
function limitModels(
  models: ProviderModelEntry[],
  limit: number | undefined
): { models: ProviderModelEntry[]; total?: number } {
  const limited = applyLimit(models, limit);
  if (limit !== undefined && limit > 0 && limited.length < models.length) {
    return { models: limited, total: models.length };
  }
  return { models: limited };
}

/**
 * getProviderSummary 的导出入口：聚合 catalog、插件 manifest 与 config 的单 provider 摘要。
 */
export async function getProviderSummary(
  providerId: string,
  options: ProviderListOptions = {}
): Promise<ProviderSummary> {
  const homeDir = options.homeDir ?? os.homedir();
  const canonicalProviderId = resolveListingProviderId(providerId, homeDir);
  const builtIn = PROVIDER_CATALOG.find((entry) => entry.providerId === canonicalProviderId);
  const plugin = loadPluginManifests(homeDir).find((manifest) => manifest.providerId === canonicalProviderId);
  if (!builtIn && !plugin) {
    throw new Error(
      `Unknown provider "${providerId}". Run 'image config providers' to see known provider ids and aliases.`
    );
  }

  const resolvedConfig = await loadResolvedConfig({ homeDir });
  const providerConfig = resolvedConfig.providers[canonicalProviderId];
  return {
    providerId: canonicalProviderId,
    type: builtIn ? "built-in" : "plugin",
    description: builtIn?.description ?? plugin?.description,
    aliases: builtIn ? [...builtIn.aliases] : [...(plugin?.aliases ?? [])],
    configured: Boolean(providerConfig),
    enabled: providerConfig ? providerConfig.enabled !== false : undefined,
    credentialCount: providerConfig?.credentials.length,
    apiBaseUrl: providerConfig?.apiBaseUrl,
    defaultModel: isDefaultProvider(canonicalProviderId, resolvedConfig.defaultModel)
      ? resolvedConfig.defaultModel
      : undefined
  };
}

function isDefaultProvider(providerId: string, defaultModel: string | undefined): boolean {
  if (typeof defaultModel !== "string") {
    return false;
  }
  const slashIndex = defaultModel.indexOf("/");
  if (slashIndex <= 0) {
    return false;
  }
  try {
    return resolveProviderAlias(defaultModel.slice(0, slashIndex)) === providerId;
  } catch {
    return false;
  }
}

/**
 * formatProviderSummaryText 的导出入口：key=value 单行一项，供人类与 agent 阅读的 provider 摘要。
 */
export function formatProviderSummaryText(summary: ProviderSummary): string {
  return [
    `provider=${summary.providerId}`,
    `type=${summary.type}`,
    summary.description ? `description=${summary.description}` : undefined,
    summary.aliases.length > 0 ? `aliases=${summary.aliases.join(",")}` : undefined,
    `configured=${summary.configured}`,
    ...(summary.configured ? [
      `enabled=${summary.enabled !== false}`,
      `credentials=${summary.credentialCount ?? 0}`,
      summary.apiBaseUrl ? `baseUrl=${summary.apiBaseUrl}` : undefined
    ] : []),
    summary.defaultModel ? `defaultModel=${summary.defaultModel}` : undefined,
    `models=image provider ${summary.providerId} model list`
  ].filter(Boolean).join("\n") + "\n";
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
    ...result.models.map((model) => `- ${result.providerId}/${model.id}`),
    ...truncationLine(result)
  ].join("\n") + "\n";
}

function truncationLine(result: ProviderModelListResult): string[] {
  if (result.total === undefined) {
    return [];
  }
  return [`(showing ${result.models.length} of ${result.total} models)`];
}

/**
 * listAllProviderModels 的导出入口：按配置顺序聚合每个已配置 provider 的模型列表。
 */
export async function listAllProviderModels(
  options: ModelListOptions = {}
): Promise<ProviderModelListResult[]> {
  const providers = await listConfiguredProviders(options);
  const results: ProviderModelListResult[] = [];
  for (const provider of providers) {
    results.push(await listProviderModels(provider.providerId, options));
  }
  return results;
}

/**
 * formatAllProviderModelsText 的导出入口：每个 provider 一个分组头加 `- provider/model` 列表。
 */
export function formatAllProviderModelsText(results: ProviderModelListResult[]): string {
  if (results.length === 0) {
    return "No providers are configured in ~/.image/config.json.\n";
  }
  return results.map((result) => [
    `${result.providerId}:`,
    ...result.warnings.map((warning) => `warning: ${warning}`),
    ...result.models.map((model) => `- ${result.providerId}/${model.id}`),
    ...truncationLine(result)
  ].join("\n")).join("\n") + "\n";
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
  const limited = limitModels(models.map((model) => ({ ...model })), limit);
  return {
    providerId,
    source: "fallback",
    models: withModelRefs(providerId, limited.models),
    warnings: finalWarnings,
    ...limited.total !== undefined ? { total: limited.total } : {}
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

function readDefaultProviderId(defaultModel: string | undefined): string | undefined {
  if (!defaultModel) {
    return undefined;
  }
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
