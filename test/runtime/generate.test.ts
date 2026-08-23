import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, test } from "vitest";

import type { ResolvedProviderConfig } from "../../src/config/types.js";
import { decorateGenerateFailure, executeGenerateWithFailover } from "../../src/runtime/generate.js";
import { writeGenerateArtifacts } from "../../src/runtime/output.js";
import type { ProviderPlugin } from "../../src/providers/types.js";

describe("runtime generate", () => {
  test("appends a next-step hint to provider HTTP failures", () => {
    const decorated = decorateGenerateFailure(
      new Error("OpenAI request failed with HTTP 400: billing_hard_limit_reached: Billing hard limit has been reached.")
    ) as Error;
    expect(decorated.message).toContain("HTTP 400");
    expect(decorated.message).toContain("Next: run 'image config doctor'");
    expect(decorated.message).toContain("'image provider list'");

    const untouched = decorateGenerateFailure(new Error("missing command")) as Error;
    expect(untouched.message).toBe("missing command");
  });

  test("rotates to the next credential on retryable credential failures", async () => {
    let attempts = 0;
    const plugin: ProviderPlugin = {
      providerId: "openai",
      aliases: [],
      capabilities: {
        generate: true,
        edit: false,
        asyncTasks: false,
        streaming: false,
        background: false,
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
          images: [{ dataBase64: "aGVsbG8=", output_format: "png", mimeType: "image/png" }],
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
            output_format: "png",
            mimeType: "image/png",
            dataBase64: "aGVsbG8="
          },
          {
            output_format: "url",
            url: "https://example.com/generated.png",
            warnings: ["temporary url"]
          }
        ],
        warnings: ["temporary url"],
        raw: {
          ok: true
        },
        usage: {
          prompt_tokens: 12,
          completion_tokens: 3,
          prompt_tokens_details: {
            cached_tokens: 5
          },
          completion_tokens_details: {
            reasoning_tokens: 2
          }
        }
      },
      downloadFile: async ({ destinationPath }) => {
        await writeFile(destinationPath, Buffer.from("downloaded"));
      }
    });

    expect(manifest.files).toHaveLength(2);
    expect(manifest.warnings).toContain("temporary url");
    expect(manifest.usage).toEqual({
      input_tokens: 12,
      output_tokens: 3,
      total_tokens: 15,
      input_tokens_details: {
        cached_tokens: 5
      },
      output_tokens_details: {
        reasoning_tokens: 2
      },
      prompt_tokens: 12,
      completion_tokens: 3,
      prompt_tokens_details: {
        cached_tokens: 5
      },
      completion_tokens_details: {
        reasoning_tokens: 2
      }
    });

    const base64File = await readFile(manifest.files[0]!, "utf8");
    const downloadedFile = await readFile(manifest.files[1]!, "utf8");
    const manifestFile = JSON.parse(await readFile(manifest.manifestPath, "utf8")) as {
      usage: unknown;
    };
    expect(base64File).toBe("hello");
    expect(downloadedFile).toBe("downloaded");
    expect(manifestFile.usage).toEqual(manifest.usage);
  });

  test("normalizes responses usage naming for manifest output", async () => {
    const outputDir = path.join(tmpdir(), `image-cli-output-${Date.now()}-responses`);
    await mkdir(outputDir, { recursive: true });

    const manifest = await writeGenerateArtifacts({
      outputDir,
      result: {
        providerId: "openai",
        modelId: "gpt-image-1",
        images: [],
        warnings: [],
        raw: {},
        usage: {
          input_tokens: 20,
          output_tokens: 8,
          total_tokens: 28,
          input_tokens_details: {
            cached_tokens: 7
          },
          output_tokens_details: {
            reasoning_tokens: 1
          }
        }
      }
    });

    expect(manifest.usage).toEqual({
      input_tokens: 20,
      output_tokens: 8,
      total_tokens: 28,
      input_tokens_details: {
        cached_tokens: 7
      },
      output_tokens_details: {
        reasoning_tokens: 1
      },
      prompt_tokens: 20,
      completion_tokens: 8,
      prompt_tokens_details: {
        cached_tokens: 7
      },
      completion_tokens_details: {
        reasoning_tokens: 1
      }
    });
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
