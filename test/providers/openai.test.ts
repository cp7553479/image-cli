import { describe, expect, test, vi } from "vitest";

import { openaiProviderPlugin } from "../../src/providers/openai/index.js";
import type { ProviderGenerateContext } from "../../src/providers/types.js";

vi.mock("../../src/providers/image-input.js", () => ({
  resolveImageToFilePath: vi.fn(async (input: { url?: string; file?: string }) => ({
    path: input.file ?? `/tmp/fake-${input.url}`,
    mimeType: "image/png",
    cleanup: async () => {
      // 测试中不真正清理
    }
  }))
}));

describe("openai provider", () => {
  test("maps generate requests to the images generations endpoint", async () => {
    const context = makeContext({
      prompt: "a red fox",
      n: 2,
      size: "1536x1024",
      quality: "high",
      background: "transparent",
      output_format: "webp",
      output_compression: 70,
      moderation: "low",
      response_format: "b64_json",
      stream: true,
      partial_images: 2,
      style: "natural",
      user: "alice",
      extra: {
        vendor_flag: true
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
        vendor_flag: true,
        model: "gpt-image-1",
        prompt: "a red fox",
        n: 2,
        size: "1536x1024",
        quality: "high",
        background: "transparent",
        output_format: "webp",
        output_compression: 70,
        moderation: "low",
        response_format: "b64_json",
        stream: true,
        partial_images: 2,
        style: "natural",
        user: "alice"
      },
      timeoutMs: 120000,
      stream: true
    });
  });

  test("routes to images/edits endpoint with multipart form when reference images are provided", async () => {
    const context = makeContext({
      prompt: "add a hat to the cat",
      reference_images: [{ url: "https://example.com/cat.png" }],
      mask: { url: "https://example.com/mask.png" },
      input_fidelity: "high",
      size: "1024x1024",
      n: 1
    });

    const operation = await openaiProviderPlugin.buildGenerateOperation(context);

    expect(operation.request.method).toBe("POST");
    expect(operation.request.url).toBe("https://api.openai.com/v1/images/edits");
    expect(operation.request.headers).toEqual({ Authorization: "Bearer sk-test" });
    expect(operation.request.json).toBeUndefined();
    expect(operation.request.form).toEqual([
      { name: "image", filePath: "/tmp/fake-https://example.com/cat.png", contentType: "image/png" },
      { name: "mask", filePath: "/tmp/fake-https://example.com/mask.png", contentType: "image/png" },
      { name: "model", value: "gpt-image-1" },
      { name: "prompt", value: "add a hat to the cat" },
      { name: "size", value: "1024x1024" },
      { name: "n", value: "1" },
      { name: "input_fidelity", value: "high" }
    ]);
  });

  test("uses image[] field name when multiple reference images are provided", async () => {
    const context = makeContext({
      prompt: "fuse two styles",
      reference_images: [
        { url: "https://example.com/a.png" },
        { url: "https://example.com/b.png" }
      ]
    });

    const operation = await openaiProviderPlugin.buildGenerateOperation(context);

    const form = operation.request.form ?? [];
    const imageFields = form.filter((f) => f.name === "image[]");
    expect(imageFields).toHaveLength(2);
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
        output_format: "png",
        mimeType: "image/png"
      },
      {
        url: "https://example.com/temp.png",
        warnings: [expect.stringMatching(/temporary url/i)],
        output_format: "png",
        mimeType: "image/png"
      }
    ]);
  });

  test("parses streamed image events", async () => {
    const result = await openaiProviderPlugin.parseGenerateResponse(
      {
        statusCode: 200,
        headers: {},
        bodyText: [
          'event: image_generation.partial_image',
          'data: {"type":"image_generation.partial_image","b64_json":"cGFydGlhbA==","partial_image_index":0}',
          "",
          'event: image_generation.completed',
          'data: {"type":"image_generation.completed","b64_json":"ZmluYWw="}',
          "",
          'data: [DONE]'
        ].join("\n"),
        stderrText: "",
        exitCode: 0
      },
      makeContext({
        stream: true,
        output_format: "webp"
      })
    );

    expect(result.images).toEqual([
      {
        dataBase64: "ZmluYWw=",
        output_format: "webp",
        mimeType: "image/webp"
      }
    ]);
  });

  test("throws provider error responses instead of returning empty images", async () => {
    await expect(
      openaiProviderPlugin.parseGenerateResponse(
        {
          statusCode: 400,
          headers: {},
          bodyText: JSON.stringify({
            error: {
              code: "invalid_request_error",
              message: "Unknown parameter"
            }
          }),
          stderrText: "",
          exitCode: 0
        },
        makeContext()
      )
    ).rejects.toThrow(/OpenAI request failed with HTTP 400: invalid_request_error: Unknown parameter/);
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
    }
  };
}
