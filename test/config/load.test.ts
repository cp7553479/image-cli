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
      envFile: "/tmp/fake-home/.image/.env",
      envExampleFile: "/tmp/fake-home/.image/.env.example",
      gitignoreFile: "/tmp/fake-home/.image/.gitignore",
      configExampleFile: "/tmp/fake-home/.image/config.example.jsonc"
    });
  });

  test("loads config json and resolves api keys with process env precedence", async () => {
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
            defaultModel: "chatgpt-image-latest",
            timeoutMs: 120000,
            retryPolicy: {
              maxAttempts: 2,
              retryableHttpStatus: [401, 429, 500]
            },
            apiKeyEnvNames: [
              "IMAGE_OPENAI_API_KEY_1",
              "IMAGE_OPENAI_API_KEY_2"
            ]
          }
        }
      })
    );
    await writeFile(
      paths.envFile,
      ["IMAGE_OPENAI_API_KEY_1=from-dotenv", "IMAGE_OPENAI_API_KEY_2=second-dotenv"].join(
        "\n"
      )
    );

    const config = await loadResolvedConfig({
      homeDir,
      env: {
        IMAGE_OPENAI_API_KEY_1: "from-process-env"
      }
    });

    expect(config.defaultProvider).toBe("openai");
    expect(config.providers.openai.credentials).toEqual([
      {
        envName: "IMAGE_OPENAI_API_KEY_1",
        value: "from-process-env"
      },
      {
        envName: "IMAGE_OPENAI_API_KEY_2",
        value: "second-dotenv"
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
