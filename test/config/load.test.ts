import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, test } from "vitest";

import { getImageConfigPaths } from "../../src/config/paths.js";
import { loadResolvedConfig } from "../../src/config/load.js";

describe("config loading", () => {
  test("derives the ~/.image paths from a home directory", () => {
    expect(getImageConfigPaths("/tmp/fake-home")).toEqual({
      configDir: "/tmp/fake-home/.image",
      configFile: "/tmp/fake-home/.image/config.json",
      readmeFile: "/tmp/fake-home/.image/README.md",
      configExampleFile: "/tmp/fake-home/.image/config.example.jsonc"
    });
  });

  test("loads config json and resolves direct api keys", async () => {
    const homeDir = await makeTempHome("image-cli-config");
    const paths = getImageConfigPaths(homeDir);
    await mkdir(paths.configDir, { recursive: true });
    await writeFile(
      paths.configFile,
      JSON.stringify({
        version: 1,
        defaultProvider: "openai",
        providers: {
          openai: {
            enabled: true,
            apiBaseUrl: "https://api.openai.com/v1",
            defaultModel: "gpt-image-1.5",
            timeoutMs: 120000,
            retryPolicy: {
              maxAttempts: 2
            },
            api_key: ["direct-openai-key"]
          }
        }
      })
    );

    const config = await loadResolvedConfig({ homeDir, env: {} });

    expect(config.defaultProvider).toBe("openai");
    expect(config.providers.openai.credentials).toEqual([
      {
        envName: "API_KEY",
        value: "direct-openai-key"
      }
    ]);
  });

  test("accepts api_key arrays and preserves ordering for failover", async () => {
    const homeDir = await makeTempHome("image-cli-config-array");
    const paths = getImageConfigPaths(homeDir);
    await mkdir(paths.configDir, { recursive: true });
    await writeFile(
      paths.configFile,
      JSON.stringify({
        version: 1,
        defaultProvider: "openai",
        providers: {
          openai: {
            enabled: true,
            apiBaseUrl: "https://api.openai.com/v1",
            defaultModel: "gpt-image-1.5",
            timeoutMs: 120000,
            retryPolicy: {
              maxAttempts: 2
            },
            api_key: ["first-key", "second-key"]
          }
        }
      })
    );

    const config = await loadResolvedConfig({ homeDir, env: {} });
    expect(config.providers.openai.credentials).toEqual([
      {
        envName: "API_KEY_1",
        value: "first-key"
      },
      {
        envName: "API_KEY_2",
        value: "second-key"
      }
    ]);
  });

  test("accepts camelCase apiKey too", async () => {
    const homeDir = await makeTempHome("image-cli-config-camel");
    const paths = getImageConfigPaths(homeDir);
    await mkdir(paths.configDir, { recursive: true });
    await writeFile(
      paths.configFile,
      JSON.stringify({
        version: 1,
        defaultProvider: "gemini",
        providers: {
          gemini: {
            enabled: true,
            apiBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
            defaultModel: "gemini-3.1-flash-image-preview",
            timeoutMs: 120000,
            retryPolicy: {
              maxAttempts: 2
            },
            apiKey: "gemini-direct-key"
          }
        }
      })
    );

    const config = await loadResolvedConfig({ homeDir, env: {} });
    expect(config.providers.gemini.credentials).toEqual([
      {
        envName: "API_KEY",
        value: "gemini-direct-key"
      }
    ]);
  });

  test("rejects invalid config json", async () => {
    const homeDir = await makeTempHome("image-cli-config-invalid");
    const paths = getImageConfigPaths(homeDir);
    await mkdir(paths.configDir, { recursive: true });
    await writeFile(paths.configFile, "{invalid");

    await expect(
      loadResolvedConfig({
        homeDir,
        env: {}
      })
    ).rejects.toThrow(/config\.json/i);
  });
});

async function makeTempHome(prefix: string): Promise<string> {
  const baseDir = path.join(tmpdir(), prefix, `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(baseDir, { recursive: true });
  return baseDir;
}
