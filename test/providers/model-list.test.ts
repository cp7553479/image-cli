import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, test } from "vitest";

import { getImageConfigPaths } from "../../src/config/paths.js";
import {
  formatAllProviderModelsText,
  formatConfiguredProvidersText,
  formatProviderModelsText,
  formatProviderSummaryText,
  getProviderSummary,
  listAllProviderModels,
  listConfiguredProviders,
  listProviderModels
} from "../../src/providers/model-list.js";
import type { CurlExecutionResult, CurlRequest } from "../../src/transport/curl.js";

describe("provider and model listing", () => {
  test("lists providers configured in ~/.image/config.json", async () => {
    const homeDir = await makeTempHome("image-cli-provider-list");
    await writeConfig(homeDir, {
      version: 1,
      defaultModel: "chatgpt-image/gpt-image-1.5",
      providers: {
        openai: makeProvider("https://api.openai.com/v1", ["first-key", "second-key"]),
        "mock-provider": makeProvider("https://mock.example/v1", "mock-key")
      }
    });
    const pluginDir = path.join(homeDir, ".image", "plugins", "mock-provider");
    await mkdir(pluginDir, { recursive: true });
    await writeFile(
      path.join(pluginDir, "plugin.json"),
      JSON.stringify({
        providerId: "mock-provider",
        entry: "./index.js",
        aliases: ["mock-image"],
        description: "Mock provider"
      })
    );

    const providers = await listConfiguredProviders({ homeDir });

    expect(providers).toEqual([
      {
        providerId: "openai",
        enabled: true,
        apiBaseUrl: "https://api.openai.com/v1",
        credentialCount: 2,
        aliases: ["chatgpt-image"],
        builtIn: true,
        plugin: false,
        defaultModel: "chatgpt-image/gpt-image-1.5"
      },
      {
        providerId: "mock-provider",
        enabled: true,
        apiBaseUrl: "https://mock.example/v1",
        credentialCount: 1,
        aliases: ["mock-image"],
        builtIn: false,
        plugin: true,
        defaultModel: undefined
      }
    ]);
    expect(formatConfiguredProvidersText(providers)).toBe([
      "openai aliases=chatgpt-image default=chatgpt-image/gpt-image-1.5",
      "mock-provider aliases=mock-image",
      ""
    ].join("\n"));
  });

  test("fetches OpenAI model ids from the configured API", async () => {
    const homeDir = await makeTempHome("image-cli-openai-models");
    await writeConfig(homeDir, {
      version: 1,
      defaultModel: "openai/gpt-image-1.5",
      providers: {
        openai: makeProvider("https://api.openai.com/v1", "openai-key")
      }
    });
    const requests: CurlRequest[] = [];

    const result = await listProviderModels("openai", {
      homeDir,
      execute: async (request) => {
        requests.push(request);
        return makeCurlResult({
          data: [
            { id: "gpt-image-2", name: "GPT Image 2" },
            { id: "gpt-image-1.5" }
          ]
        });
      }
    });

    expect(requests[0]).toMatchObject({
      method: "GET",
      url: "https://api.openai.com/v1/models",
      headers: {
        Authorization: "Bearer openai-key"
      }
    });
    expect(result).toMatchObject({
      providerId: "openai",
      source: "api",
      models: [
        { id: "gpt-image-2", name: "GPT Image 2" },
        { id: "gpt-image-1.5" }
      ]
    });
    expect(formatProviderModelsText(result)).toBe([
      "warning: API model lists may include models that are not valid for image generation. Known image model families (image, dall-e, imagen, banana, seedream) are listed first; confirm support with the provider before use.",
      "- openai/gpt-image-2",
      "- openai/gpt-image-1.5",
      ""
    ].join("\n"));
    expect(formatProviderModelsText(result)).not.toContain("source:");
    expect(formatProviderModelsText(result)).not.toContain("model_count:");
  });

  test("uses OpenRouter model API without requiring a configured API key", async () => {
    const homeDir = await makeTempHome("image-cli-openrouter-models");
    await writeConfig(homeDir, {
      version: 1,
      defaultModel: "openrouter/google/gemini-3.1-flash-image-preview",
      providers: {
        openrouter: makeProvider("https://openrouter.ai/api/v1", "")
      }
    });
    const requests: CurlRequest[] = [];

    const result = await listProviderModels("openrouter", {
      homeDir,
      execute: async (request) => {
        requests.push(request);
        return makeCurlResult({
          data: [
            { id: "google/gemini-3.1-flash-image-preview", name: "Gemini image" }
          ]
        });
      }
    });

    expect(requests[0]).toMatchObject({
      method: "GET",
      url: "https://openrouter.ai/api/v1/models"
    });
    expect(requests[0].headers).toBeUndefined();
    expect(result.source).toBe("api");
    expect(result.models[0]?.id).toBe("google/gemini-3.1-flash-image-preview");
  });

  test("parses Gemini model names from models.list responses", async () => {
    const homeDir = await makeTempHome("image-cli-gemini-models");
    await writeConfig(homeDir, {
      version: 1,
      defaultModel: "gemini/gemini-3.1-flash-image-preview",
      providers: {
        gemini: makeProvider("https://generativelanguage.googleapis.com/v1beta", "gemini-key")
      }
    });
    const requests: CurlRequest[] = [];

    const result = await listProviderModels("gemini", {
      homeDir,
      execute: async (request) => {
        requests.push(request);
        return makeCurlResult({
          models: [
            {
              name: "models/gemini-3.1-flash-image-preview",
              displayName: "Gemini image preview"
            }
          ],
          nextPageToken: requests.length === 1 ? "second-page" : undefined
        });
      }
    });

    expect(requests[0]).toMatchObject({
      method: "GET",
      url: "https://generativelanguage.googleapis.com/v1beta/models",
      headers: {
        "x-goog-api-key": "gemini-key"
      }
    });
    expect(requests[1]?.url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models?pageToken=second-page"
    );
    expect(result).toMatchObject({
      providerId: "gemini",
      source: "api",
      models: [
        {
          id: "gemini-3.1-flash-image-preview",
          name: "Gemini image preview"
        },
        {
          id: "gemini-3.1-flash-image-preview",
          name: "Gemini image preview"
        }
      ]
    });
  });

  test("falls back when provider model API fails", async () => {
    const homeDir = await makeTempHome("image-cli-model-api-failure");
    await writeConfig(homeDir, {
      version: 1,
      defaultModel: "openai/gpt-image-1.5",
      providers: {
        openai: makeProvider("https://api.openai.com/v1", "openai-key")
      }
    });

    const result = await listProviderModels("openai", {
      homeDir,
      execute: async () => ({
        statusCode: 500,
        headers: {},
        bodyText: "{}",
        stderrText: "",
        exitCode: 0
      })
    });

    expect(result.source).toBe("fallback");
    expect(result.models[0]?.id).toBe("gpt-image-2");
    expect(result.warnings[0]).toContain("Could not fetch models from provider API");
    expect(result.warnings[1]).toContain("Built-in model ids may be incomplete or outdated.");
  });

  test("falls back to built-in model ids with an English warning", async () => {
    const homeDir = await makeTempHome("image-cli-bailian-models");
    await writeConfig(homeDir, {
      version: 1,
      defaultModel: "bailian/qwen-image-2.0-pro",
      providers: {
        bailian: makeProvider("https://llm-test.cn-beijing.maas.aliyuncs.com/api/v1", "bailian-key")
      }
    });

    const result = await listProviderModels("bailian", { homeDir, limit: 2 });

    expect(result).toEqual({
      providerId: "bailian",
      source: "fallback",
      models: [
        { id: "qwen-image-2.0-pro", modelRef: "bailian/qwen-image-2.0-pro" },
        { id: "qwen-image-2.0-pro-2026-03-03", modelRef: "bailian/qwen-image-2.0-pro-2026-03-03" }
      ],
      total: 9,
      warnings: [
        "Built-in model ids may be incomplete or outdated. Confirm the actual model ids with the provider before use."
      ]
    });
    expect(formatProviderModelsText(result)).toContain("warning: Built-in model ids may be incomplete or outdated.");
  });

  test("rejects unconfigured provider ids", async () => {
    const homeDir = await makeTempHome("image-cli-unconfigured-models");
    await writeConfig(homeDir, {
      version: 1,
      defaultModel: "openai/gpt-image-1.5",
      providers: {
        openai: makeProvider("https://api.openai.com/v1", "openai-key")
      }
    });

    await expect(listProviderModels("missing", { homeDir })).rejects.toThrow(
      "Provider \"missing\" is not configured in ~/.image/config.json. Run 'image provider list' to see configured providers."
    );
  });

  test("resolves provider aliases like --model routing does", async () => {
    const homeDir = await makeTempHome("image-cli-alias-models");
    await writeConfig(homeDir, {
      version: 1,
      defaultModel: "openai/gpt-image-1.5",
      providers: {
        openai: makeProvider("https://api.openai.com/v1", "openai-key")
      }
    });
    const requests: CurlRequest[] = [];

    const result = await listProviderModels("chatgpt-image", {
      homeDir,
      execute: async (request) => {
        requests.push(request);
        return makeCurlResult({ data: [{ id: "gpt-image-2" }] });
      }
    });

    expect(requests[0]?.url).toBe("https://api.openai.com/v1/models");
    expect(result.providerId).toBe("openai");
    expect(result.models[0]).toEqual({
      id: "gpt-image-2",
      name: undefined,
      modelRef: "openai/gpt-image-2"
    });
  });

  test("warns when a configured plugin provider has no model catalog", async () => {
    const homeDir = await makeTempHome("image-cli-plugin-models");
    await writeConfig(homeDir, {
      version: 1,
      defaultModel: "mock-provider/mock-model",
      providers: {
        "mock-provider": makeProvider("https://mock.example/v1", "mock-key")
      }
    });

    const result = await listProviderModels("mock-provider", { homeDir });

    expect(result).toEqual({
      providerId: "mock-provider",
      source: "fallback",
      models: [],
      warnings: [
        "Built-in model ids may be incomplete or outdated. Confirm the actual model ids with the provider before use.",
        "No built-in model catalog is available for this provider. Confirm model ids with the provider before use."
      ]
    });
  });

  test("lists bundled oracle plugin model ids from the fallback catalog", async () => {
    const homeDir = await makeTempHome("image-cli-oracle-models");
    await writeConfig(homeDir, {
      version: 1,
      defaultModel: "oracle/gpt-5.6-sol",
      providers: {
        oracle: makeProvider("https://chatgpt.com", "browser-manual-login")
      }
    });

    const result = await listProviderModels("oracle", { homeDir });

    expect(result.source).toBe("fallback");
    expect(result.models.map((model) => model.id)).toContain("gpt-5.6-sol-medium");
    expect(result.models.map((model) => model.id)).toContain("gpt-5.5-pro");
    expect(formatProviderModelsText(result)).toContain("- oracle/gpt-5.6-sol");
  });

  test("prints a provider summary from catalog and config data", async () => {
    const homeDir = await makeTempHome("image-cli-provider-summary");
    await writeConfig(homeDir, {
      version: 1,
      defaultModel: "openai/gpt-image-1.5",
      providers: {
        openai: makeProvider("https://api.openai.com/v1", "openai-key")
      }
    });

    const summary = await getProviderSummary("chatgpt-image", { homeDir });
    expect(summary).toEqual({
      providerId: "openai",
      type: "built-in",
      description: "OpenAI Images API",
      aliases: ["chatgpt-image"],
      configured: true,
      enabled: true,
      credentialCount: 1,
      apiBaseUrl: "https://api.openai.com/v1",
      defaultModel: "openai/gpt-image-1.5"
    });
    const text = formatProviderSummaryText(summary);
    expect(text).toContain("provider=openai");
    expect(text).toContain("type=built-in");
    expect(text).toContain("aliases=chatgpt-image");
    expect(text).toContain("defaultModel=openai/gpt-image-1.5");
    expect(text).toContain("models=image provider openai model list");
  });

  test("summarizes plugin providers", async () => {
    const homeDir = await makeTempHome("image-cli-plugin-summary");
    const pluginDir = path.join(homeDir, ".image", "plugins", "mock-provider");
    await mkdir(pluginDir, { recursive: true });
    await writeFile(
      path.join(pluginDir, "plugin.json"),
      JSON.stringify({
        providerId: "mock-provider",
        entry: "./index.js",
        aliases: ["mock-image"],
        description: "Mock provider"
      })
    );
    await writeConfig(homeDir, {
      version: 1,
      providers: {
        "mock-provider": makeProvider("https://mock.example/v1", "mock-key")
      }
    });

    const summary = await getProviderSummary("mock-image", { homeDir });
    expect(summary.type).toBe("plugin");
    expect(summary.aliases).toEqual(["mock-image"]);
    expect(summary.credentialCount).toBe(1);
  });

  test("rejects provider summaries for unknown ids", async () => {
    const homeDir = await makeTempHome("image-cli-provider-summary-unknown");
    await writeConfig(homeDir, { version: 1, providers: {} });
    await expect(getProviderSummary("not-a-provider", { homeDir })).rejects.toThrow(
      "Unknown provider \"not-a-provider\". Run 'image config providers' to see known provider ids and aliases."
    );
  });

  test("reports truncation totals and orders known image families first", async () => {
    const homeDir = await makeTempHome("image-cli-model-truncation");
    await writeConfig(homeDir, {
      version: 1,
      defaultModel: "openai/gpt-image-1.5",
      providers: {
        openai: makeProvider("https://api.openai.com/v1", "openai-key")
      }
    });

    const result = await listProviderModels("openai", {
      homeDir,
      limit: 3,
      execute: async () => makeCurlResult({
        data: [
          { id: "gpt-3.5-turbo" },
          { id: "gpt-image-2" },
          { id: "gpt-4o" },
          { id: "dall-e-3" },
          { id: "tts-1" }
        ]
      })
    });

    expect(result.models.map((model) => model.id)).toEqual(["gpt-image-2", "dall-e-3", "gpt-3.5-turbo"]);
    expect(result.total).toBe(5);
    expect(formatProviderModelsText(result)).toContain("(showing 3 of 5 models)");
  });

  test("lists models for every configured provider grouped by provider", async () => {
    const homeDir = await makeTempHome("image-cli-all-provider-models");
    await writeConfig(homeDir, {
      version: 1,
      defaultModel: "openai/gpt-image-1.5",
      providers: {
        openai: makeProvider("https://api.openai.com/v1", "openai-key"),
        bailian: makeProvider("https://llm-test.cn-beijing.maas.aliyuncs.com/api/v1", "bailian-key")
      }
    });

    const results = await listAllProviderModels({
      homeDir,
      limit: 2,
      execute: async () => makeCurlResult({
        data: [{ id: "gpt-image-2" }]
      })
    });

    expect(results.map((result) => result.providerId)).toEqual(["openai", "bailian"]);
    expect(formatAllProviderModelsText(results)).toBe([
      "openai:",
      "warning: API model lists may include models that are not valid for image generation. Known image model families (image, dall-e, imagen, banana, seedream) are listed first; confirm support with the provider before use.",
      "- openai/gpt-image-2",
      "bailian:",
      "warning: Built-in model ids may be incomplete or outdated. Confirm the actual model ids with the provider before use.",
      "- bailian/qwen-image-2.0-pro",
      "- bailian/qwen-image-2.0-pro-2026-03-03",
      "(showing 2 of 9 models)",
      ""
    ].join("\n"));
  });

  test("prints a placeholder when no providers are configured", async () => {
    const homeDir = await makeTempHome("image-cli-all-provider-models-empty");
    await writeConfig(homeDir, {
      version: 1,
      providers: {}
    });

    const results = await listAllProviderModels({ homeDir });

    expect(results).toEqual([]);
    expect(formatAllProviderModelsText(results)).toBe(
      "No providers are configured in ~/.image/config.json.\n"
    );
  });
});

async function makeTempHome(prefix: string): Promise<string> {
  const baseDir = path.join(
    tmpdir(),
    prefix,
    `${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
  await mkdir(baseDir, { recursive: true });
  return baseDir;
}

async function writeConfig(homeDir: string, config: unknown): Promise<void> {
  const paths = getImageConfigPaths(homeDir);
  await mkdir(paths.configDir, { recursive: true });
  await writeFile(paths.configFile, JSON.stringify(config));
}

function makeProvider(apiBaseUrl: string, apiKey: string | string[]): {
  enabled: boolean;
  apiBaseUrl: string;
  timeoutMs: number;
  retryPolicy: { maxAttempts: number };
  api_key: string | string[];
} {
  return {
    enabled: true,
    apiBaseUrl,
    timeoutMs: 120000,
    retryPolicy: {
      maxAttempts: 2
    },
    api_key: apiKey
  };
}

function makeCurlResult(body: unknown): CurlExecutionResult {
  return {
    statusCode: 200,
    headers: {},
    bodyText: JSON.stringify(body),
    stderrText: "",
    exitCode: 0
  };
}
