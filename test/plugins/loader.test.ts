import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, test } from "vitest";

import { findPluginProvider, loadPluginManifests } from "../../src/plugins/loader.js";

describe("plugin loader", () => {
  test("loads plugin manifests from ~/.image/plugins", async () => {
    const homeDir = await makeTempHome("image-cli-plugin-manifest");
    const pluginDir = path.join(homeDir, ".image", "plugins", "mock-provider");
    await mkdir(pluginDir, { recursive: true });
    await writeFile(
      path.join(pluginDir, "plugin.json"),
      JSON.stringify({
        providerId: "mock-provider",
        entry: "./index.js",
        runtime: "node",
        description: "Mock plugin"
      })
    );
    await writeFile(path.join(pluginDir, "index.js"), "console.log('{}')\n");

    const manifests = loadPluginManifests(homeDir);
    expect(manifests).toHaveLength(1);
    expect(manifests[0]).toMatchObject({
      providerId: "mock-provider",
      runtime: "node",
      description: "Mock plugin"
    });
  });

  test("executes plugin build-generate and parse-generate actions", async () => {
    const homeDir = await makeTempHome("image-cli-plugin-run");
    const pluginDir = path.join(homeDir, ".image", "plugins", "mock-provider");
    await mkdir(pluginDir, { recursive: true });
    await writeFile(
      path.join(pluginDir, "plugin.json"),
      JSON.stringify({
        providerId: "mock-provider",
        entry: "./index.js",
        runtime: "node",
        aliases: ["mock-provider-image"]
      })
    );
    await writeFile(
      path.join(pluginDir, "index.js"),
      `const fs = require('fs');
let input = '';
process.stdin.on('data', chunk => input += chunk.toString());
process.stdin.on('end', () => {
  const payload = JSON.parse(input || '{}');
  const actionIndex = process.argv.indexOf('--action');
  const action = actionIndex >= 0 ? process.argv[actionIndex + 1] : '';
  if (action === 'build-generate') {
    process.stdout.write(JSON.stringify({
      request: {
        method: 'POST',
        url: 'https://plugin.example/generate',
        headers: { Authorization: 'Bearer plugin' },
        json: { prompt: payload.request.prompt }
      }
    }));
    return;
  }
  if (action === 'parse-generate') {
    process.stdout.write(JSON.stringify({
      providerId: 'mock-provider',
      modelId: payload.input.request.model.modelId,
      images: [{ url: 'https://plugin.example/image.png' }],
      warnings: [],
      raw: { ok: true }
    }));
    return;
  }
  process.exit(1);
});\n`
    );

    const plugin = findPluginProvider("mock-provider", homeDir);
    expect(plugin).toBeDefined();

    const operation = await plugin!.buildGenerateOperation({
      request: {
        prompt: "plugin prompt",
        model: {
          providerId: "mock-provider",
          providerAlias: "mock-provider",
          modelId: "mock-model"
        }
      },
      providerConfig: {
        enabled: true,
        apiBaseUrl: "https://plugin.example",
        timeoutMs: 30000,
        retryPolicy: { maxAttempts: 1 },
        api_key: ["plugin-key"],
        credentials: [{ envName: "API_KEY", value: "plugin-key" }]
      },
      credential: {
        envName: "API_KEY",
        value: "plugin-key"
      },
      preparedImages: []
    });

    expect(operation.request).toMatchObject({
      method: "POST",
      url: "https://plugin.example/generate"
    });

    const result = await plugin!.parseGenerateResponse(
      {
        statusCode: 200,
        headers: {},
        bodyText: "{}",
        stderrText: "",
        exitCode: 0
      },
      {
        request: {
          prompt: "plugin prompt",
          model: {
            providerId: "mock-provider",
            providerAlias: "mock-provider",
            modelId: "mock-model"
          }
        },
        providerConfig: {
          enabled: true,
          apiBaseUrl: "https://plugin.example",
          timeoutMs: 30000,
          retryPolicy: { maxAttempts: 1 },
          api_key: ["plugin-key"],
          credentials: [{ envName: "API_KEY", value: "plugin-key" }]
        },
        credential: {
          envName: "API_KEY",
          value: "plugin-key"
        },
        preparedImages: []
      }
    );

    expect(result.providerId).toBe("mock-provider");
    expect(result.images).toEqual([{ url: "https://plugin.example/image.png" }]);
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
