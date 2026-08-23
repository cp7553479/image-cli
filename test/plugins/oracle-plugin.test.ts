import { chmod, cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

import { findPluginProvider } from "../../src/plugins/loader.js";
import type { ProviderGenerateContext } from "../../src/providers/types.js";
import type { GenerateRequest } from "../../src/protocol/request.js";
import { executeCurlRequest } from "../../src/transport/curl.js";
import { parseOracleModel, resolveGeminiAspect } from "../../plugins/oracle/index.mjs";

const PLUGIN_SOURCE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "plugins", "oracle");

const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

const FAKE_ORACLE = `#!/usr/bin/env node
import { writeFile } from "node:fs/promises";

const argsFile = process.env.FAKE_ORACLE_ARGS;
if (argsFile) {
  await writeFile(argsFile, JSON.stringify(process.argv.slice(2)));
}
const mode = process.env.FAKE_ORACLE_MODE ?? "ok";
if (mode === "fail") {
  process.stderr.write("fake oracle: simulated browser failure\\n");
  process.exit(2);
}
if (mode === "ok") {
  const index = process.argv.indexOf("--generate-image");
  if (index >= 0) {
    await writeFile(process.argv[index + 1], Buffer.from("${PNG_BASE64}", "base64"));
  }
}
process.stdout.write("fake oracle session done\\n");
`;

type OraclePluginHarness = {
  homeDir: string;
  argsFile: string;
  referenceFile: string;
  build: (request: Record<string, unknown>, mode?: string) => Promise<{ url: string }>;
};

function makeContext(request: Record<string, unknown>): ProviderGenerateContext {
  const providerConfig = {
    enabled: true,
    apiBaseUrl: "https://chatgpt.com",
    timeoutMs: 300000,
    retryPolicy: { maxAttempts: 1 },
    api_key: ["browser-manual-login"],
    credentials: [{ envName: "API_KEY", value: "browser-manual-login" }]
  };
  return {
    request: request as unknown as GenerateRequest,
    providerConfig,
    credential: providerConfig.credentials[0]
  };
}

async function makeHarness(prefix: string): Promise<OraclePluginHarness> {
  const homeDir = await makeTempDir(prefix);
  const pluginDir = path.join(homeDir, ".image", "plugins", "oracle");
  await mkdir(pluginDir, { recursive: true });
  await cp(PLUGIN_SOURCE_DIR, pluginDir, { recursive: true });

  const binDir = await makeTempDir(`${prefix}-bin`);
  const fakeOraclePath = path.join(binDir, "fake-oracle.mjs");
  await writeFile(fakeOraclePath, FAKE_ORACLE);
  await chmod(fakeOraclePath, 0o755);

  const argsFile = path.join(binDir, "oracle-args.json");
  const referenceFile = path.join(binDir, "reference.png");
  await writeFile(referenceFile, Buffer.from(PNG_BASE64, "base64"));

  process.env.ORACLE_BIN = fakeOraclePath;
  process.env.FAKE_ORACLE_ARGS = argsFile;

  return {
    homeDir,
    argsFile,
    referenceFile,
    build: async (request, mode = "ok") => {
      process.env.FAKE_ORACLE_MODE = mode;
      try {
        const plugin = findPluginProvider("oracle", homeDir);
        if (!plugin) {
          throw new Error("oracle plugin was not discovered.");
        }
        const operation = await plugin.buildGenerateOperation(makeContext(request));
        return { url: operation.request.url };
      } finally {
        delete process.env.FAKE_ORACLE_MODE;
      }
    }
  };
}

describe("oracle plugin", () => {
  test("runs oracle with browser flags, effort mapping, and reference image", async () => {
    const harness = await makeHarness("image-cli-oracle-e2e");
    const prompt = "A glass apple on a wooden table";

    const operation = await harness.build({
      prompt,
      model: { providerId: "oracle", providerAlias: "oracle", modelId: "GPT-5.6 Sol Medium" },
      n: 2,
      output_format: "png",
      reference_images: [{ file: harness.referenceFile }]
    });

    const args = JSON.parse(await readFile(harness.argsFile, "utf8")) as string[];
    expect(args).toContain("--engine");
    expect(args[args.indexOf("--engine") + 1]).toBe("browser");
    expect(args).toContain("--browser-manual-login");
    expect(args[args.indexOf("--model") + 1]).toBe("gpt-5.6-sol");
    expect(args[args.indexOf("--browser-thinking-time") + 1]).toBe("medium");
    expect(args[args.indexOf("--file") + 1]).toBe(path.resolve(harness.referenceFile));
    expect(args[args.indexOf("--generate-image") + 1]).toMatch(/image\.png$/);
    expect(args[args.indexOf("--prompt") + 1]).toBe(prompt);
    expect(args[args.indexOf("--timeout") + 1]).toBe("300s");
    expect(args).toContain("--no-notify");

    expect(operation.url.startsWith("file://")).toBe(true);
    const transport = await executeCurlRequest({
      method: "GET",
      url: operation.url,
      timeoutMs: 10000
    });
    expect(transport.bodyText.trim()).not.toBe("");

    const plugin = findPluginProvider("oracle", harness.homeDir)!;
    const result = await plugin.parseGenerateResponse(
      transport,
      makeContext({
        prompt,
        model: { providerId: "oracle", providerAlias: "oracle", modelId: "GPT-5.6 Sol Medium" },
        n: 2
      })
    );

    expect(result.providerId).toBe("oracle");
    expect(result.modelId).toBe("GPT-5.6 Sol Medium");
    expect(result.images[0].mimeType).toBe("image/png");
    expect(result.images[0].output_format).toBe("png");
    expect(Buffer.from(result.images[0].dataBase64 ?? "", "base64")).toEqual(
      Buffer.from(PNG_BASE64, "base64")
    );
    expect(result.warnings.join(" ")).toContain("ignoring n=2");
  });

  test("plain gpt-5.6-sol does not add a thinking-time override", async () => {
    const harness = await makeHarness("image-cli-oracle-sol");
    await harness.build({
      prompt: "plain sol",
      model: { providerId: "oracle", providerAlias: "oracle", modelId: "gpt-5.6-sol" }
    });

    const args = JSON.parse(await readFile(harness.argsFile, "utf8")) as string[];
    expect(args[args.indexOf("--model") + 1]).toBe("gpt-5.6-sol");
    expect(args).not.toContain("--browser-thinking-time");
  });

  test("unknown model ids pass through verbatim", async () => {
    const harness = await makeHarness("image-cli-oracle-passthrough");
    await harness.build({
      prompt: "custom model",
      model: { providerId: "oracle", providerAlias: "oracle", modelId: "gpt-9-custom" }
    });

    const args = JSON.parse(await readFile(harness.argsFile, "utf8")) as string[];
    expect(args[args.indexOf("--model") + 1]).toBe("gpt-9-custom");
    expect(args).not.toContain("--browser-thinking-time");
  });

  test("URL reference images are downloaded before oracle runs", async () => {
    const harness = await makeHarness("image-cli-oracle-url-ref");
    await harness.build({
      prompt: "url reference",
      model: { providerId: "oracle", providerAlias: "oracle", modelId: "gpt-5.6-sol" },
      reference_images: [{ url: `file://${harness.referenceFile}` }]
    });

    const args = JSON.parse(await readFile(harness.argsFile, "utf8")) as string[];
    const downloaded = args[args.indexOf("--file") + 1];
    expect(downloaded).toMatch(/reference-1\.png$/);
    expect((await readFile(downloaded)).toString("base64")).toBe(PNG_BASE64);
  });

  test("propagates oracle failure output", async () => {
    const harness = await makeHarness("image-cli-oracle-failure");
    await expect(
      harness.build(
        { prompt: "fail", model: { providerId: "oracle", providerAlias: "oracle", modelId: "gpt-5.6-sol" } },
        "fail"
      )
    ).rejects.toThrow(/simulated browser failure/);
  });

  test("fails when oracle finishes without an image artifact", async () => {
    const harness = await makeHarness("image-cli-oracle-no-image");
    await expect(
      harness.build(
        { prompt: "text only", model: { providerId: "oracle", providerAlias: "oracle", modelId: "gpt-5.6-sol" } },
        "no-image"
      )
    ).rejects.toThrow(/without producing a downloadable image artifact/);
  });
});

describe("parseOracleModel", () => {
  test("maps GPT-5.6 Sol display spellings", () => {
    expect(parseOracleModel("GPT-5.6 Sol")).toEqual({ oracleModel: "gpt-5.6-sol", thinkingTime: undefined });
    expect(parseOracleModel("gpt-5.6")).toEqual({ oracleModel: "gpt-5.6-sol", thinkingTime: undefined });
  });

  test("maps effort suffixes to thinking-time levels", () => {
    expect(parseOracleModel("GPT-5.6 Sol Medium")).toEqual({ oracleModel: "gpt-5.6-sol", thinkingTime: "medium" });
    expect(parseOracleModel("GPT-5.6 Sol Pro")).toEqual({ oracleModel: "gpt-5.6-sol", thinkingTime: "pro" });
    expect(parseOracleModel("gpt-5.6-sol-extra-high")).toEqual({
      oracleModel: "gpt-5.6-sol",
      thinkingTime: "extra-high"
    });
  });

  test("passes other ids through unchanged", () => {
    expect(parseOracleModel("gpt-5.5-pro")).toEqual({ oracleModel: "gpt-5.5-pro", thinkingTime: undefined });
    expect(parseOracleModel("gemini-3-pro")).toEqual({ oracleModel: "gemini-3-pro", thinkingTime: undefined });
  });

  test("rejects empty model ids", () => {
    expect(() => parseOracleModel("  ")).toThrow(/non-empty/);
  });
});

describe("resolveGeminiAspect", () => {
  test("derives supported ratios for gemini models", () => {
    expect(resolveGeminiAspect("gemini-3-pro", "16:9")).toBe("16:9");
    expect(resolveGeminiAspect("gemini-3-pro", "1920x1080")).toBe("16:9");
    expect(resolveGeminiAspect("gemini-3-pro", "1024x1024")).toBe("1:1");
  });

  test("returns undefined for unsupported sizes or non-gemini models", () => {
    expect(resolveGeminiAspect("gemini-3-pro", "auto")).toBeUndefined();
    expect(resolveGeminiAspect("gemini-3-pro", "1000x777")).toBeUndefined();
    expect(resolveGeminiAspect("gpt-5.6-sol", "1024x1024")).toBeUndefined();
  });
});

async function makeTempDir(prefix: string): Promise<string> {
  return await mkdtemp(path.join(tmpdir(), `${prefix}-`));
}
