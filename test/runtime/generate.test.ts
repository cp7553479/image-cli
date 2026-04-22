import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, test } from "vitest";

import type { ResolvedProviderConfig } from "../../src/config/types.js";
import { executeGenerateWithFailover } from "../../src/runtime/generate.js";
import { writeGenerateArtifacts } from "../../src/runtime/output.js";
import type { ProviderPlugin } from "../../src/providers/types.js";

describe("runtime generate", () => {
  test("rotates to the next credential on retryable credential failures", async () => {
    let attempts = 0;
    const plugin: ProviderPlugin = {
      providerId: "openai",
      aliases: [],
      capabilities: {
        generate: true,
        edit: false,
        inputImages: false,
        asyncTasks: false,
        streaming: false,
        background: false,
        negativePrompt: false,
        multipleOutputs: false,
        transparentOutput: false
      },
      async buildGenerateOperation() {
        return {
          request: {
            method: "POST",
            url: "https://example.com/generate"
          }
        };
      },
      async parseGenerateResponse(result) {
        if (result.statusCode === 401) {
          throw new Error("unauthorized");
        }
        return {
          providerId: "openai",
          modelId: "chatgpt-image-latest",
          images: [{ dataBase64: "aGVsbG8=", outputFormat: "png", mimeType: "image/png" }],
          warnings: [],
          raw: { ok: true }
        };
      },
      classifyFailure(context) {
        if (context.response?.statusCode === 401) {
          return {
            kind: "retryable-credential",
            reason: "bad key"
          };
        }
        return {
          kind: "unknown",
          reason: "unknown"
        };
      }
    };

    const result = await executeGenerateWithFailover({
      plugin,
      providerConfig: makeProviderConfig([
        { envName: "KEY_1", value: "first-key" },
        { envName: "KEY_2", value: "second-key" }
      ]),
      request: {
        prompt: "test",
        model: {
          providerId: "openai",
          providerAlias: "openai",
          modelId: "chatgpt-image-latest"
        }
      },
      preparedImages: [],
      execute: async () => {
        attempts += 1;
        if (attempts === 1) {
          return {
            statusCode: 401,
            headers: {},
            bodyText: JSON.stringify({ error: "unauthorized" }),
            stderrText: "",
            exitCode: 0
          };
        }
        return {
          statusCode: 200,
          headers: {},
          bodyText: JSON.stringify({ ok: true }),
          stderrText: "",
          exitCode: 0
        };
      }
    });

    expect(attempts).toBe(2);
    expect(result.images).toHaveLength(1);
  });

  test("writes base64 and url-backed images plus manifest output", async () => {
    const outputDir = path.join(tmpdir(), `image-cli-output-${Date.now()}`);
    await mkdir(outputDir, { recursive: true });

    const manifest = await writeGenerateArtifacts({
      outputDir,
      result: {
        providerId: "minimax",
        modelId: "image-01",
        images: [
          {
            outputFormat: "png",
            mimeType: "image/png",
            dataBase64: "aGVsbG8="
          },
          {
            outputFormat: "url",
            url: "https://example.com/generated.png",
            warnings: ["temporary url"]
          }
        ],
        warnings: ["temporary url"],
        raw: {
          ok: true
        }
      },
      downloadFile: async ({ destinationPath }) => {
        await writeFile(destinationPath, Buffer.from("downloaded"));
      }
    });

    expect(manifest.files).toHaveLength(2);
    expect(manifest.warnings).toContain("temporary url");

    const base64File = await readFile(manifest.files[0]!, "utf8");
    const downloadedFile = await readFile(manifest.files[1]!, "utf8");
    expect(base64File).toBe("hello");
    expect(downloadedFile).toBe("downloaded");
  });
});

function makeProviderConfig(
  credentials: ResolvedProviderConfig["credentials"]
): ResolvedProviderConfig {
  return {
    enabled: true,
    apiBaseUrl: "https://example.com",
    timeoutMs: 30_000,
    retryPolicy: {
      maxAttempts: 2
    },
    api_key: credentials[0]?.value ?? "",
    credentials
  };
}
