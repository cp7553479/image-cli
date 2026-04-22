import { describe, expect, test } from "vitest";

import { openaiProviderPlugin } from "../../src/providers/openai/index.js";
import type { ProviderGenerateContext } from "../../src/providers/types.js";

describe("openai provider", () => {
  test("maps generate requests to the images generations endpoint", async () => {
    const context = makeContext({
      prompt: "a red fox",
      count: 2,
      size: "2k",
      normalizedSize: {
        source: "preset",
        preset: "2k",
        width: 2048,
        height: 2048,
        aspectRatio: "1:1",
        raw: "2k"
      },
      quality: "high",
      background: "transparent",
      outputFormat: "webp",
      stream: true,
      extra: {
        user: "alice",
        moderation: "low",
        output_compression: 70
      }
    });

    const operation = await openaiProviderPlugin.buildGenerateOperation(context);

    expect(operation.request).toEqual({
      method: "POST",
      url: "https://api.openai.com/v1/images/generations",
      headers: {
        Authorization: "Bearer sk-test"
      },
      json: {
        model: "gpt-image-1",
        prompt: "a red fox",
        n: 2,
        size: "2048x2048",
        quality: "high",
        background: "transparent",
        output_format: "webp",
        output_compression: 70,
        stream: true,
        user: "alice",
        moderation: "low"
      },
      timeoutMs: 120000,
      stream: true
    });
  });

  test("rejects image inputs for generate", async () => {
    await expect(
      openaiProviderPlugin.buildGenerateOperation(
        makeContext({
          images: ["data:image/png;base64,abc"]
        })
      )
    ).rejects.toThrow(/does not accept images/i);
  });

  test("parses base64 and url image results", async () => {
    const result = await openaiProviderPlugin.parseGenerateResponse(
      {
        statusCode: 200,
        headers: {},
        bodyText: JSON.stringify({
          created: 123,
          data: [
            {
              b64_json: "Zm9v",
              revised_prompt: "a better fox"
            },
            {
              url: "https://example.com/temp.png",
              revised_prompt: "another fox"
            }
          ],
          usage: { total_tokens: 1 }
        }),
        stderrText: "",
        exitCode: 0
      },
      makeContext()
    );

    expect(result.providerId).toBe("openai");
    expect(result.modelId).toBe("gpt-image-1");
    expect(result.usage).toEqual({ total_tokens: 1 });
    expect(result.images).toEqual([
      {
        dataBase64: "Zm9v",
        outputFormat: "png",
        mimeType: "image/png"
      },
      {
        url: "https://example.com/temp.png",
        warnings: [expect.stringMatching(/temporary url/i)],
        outputFormat: "png",
        mimeType: "image/png"
      }
    ]);
  });

  test("classifies retryability from openai status codes", () => {
    expect(openaiProviderPlugin.classifyFailure({ error: new Error("boom"), response: { statusCode: 400 } as never })).toEqual({
      kind: "non-retryable-request",
      reason: expect.stringMatching(/400/)
    });
    expect(openaiProviderPlugin.classifyFailure({ error: new Error("boom"), response: { statusCode: 429 } as never })).toEqual({
      kind: "retryable-credential",
      reason: expect.stringMatching(/429/)
    });
    expect(openaiProviderPlugin.classifyFailure({ error: new Error("boom"), response: { statusCode: 503 } as never })).toEqual({
      kind: "retryable-transport",
      reason: expect.stringMatching(/503/)
    });
  });
});

function makeContext(
  overrides: Partial<ProviderGenerateContext["request"]> = {}
): ProviderGenerateContext {
  return {
    request: {
      prompt: "a fox",
      model: {
        providerId: "openai",
        providerAlias: "openai",
        modelId: "gpt-image-1"
      },
      ...overrides
    },
    providerConfig: {
      enabled: true,
      apiBaseUrl: "https://api.openai.com/v1",
      timeoutMs: 120000,
      retryPolicy: {
        maxAttempts: 2
      },
      apiKey: "sk-test",
      credentials: [
        {
          envName: "API_KEY",
          value: "sk-test"
        }
      ]
    },
    credential: {
      envName: "API_KEY",
      value: "sk-test"
    },
    preparedImages: overrides.images ? [{ source: "test", kind: "url", url: overrides.images[0] }] : []
  };
}
