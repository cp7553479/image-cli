import { describe, expect, test } from "vitest";

import { seedreamProviderPlugin } from "../../src/providers/seedream/index.js";
import type { ProviderGenerateContext } from "../../src/providers/types.js";
import type { CurlExecutionResult } from "../../src/transport/curl.js";

describe("seedream provider", () => {
  test("defaults to watermark disabled and allows explicit watermark", async () => {
    const defaultOperation = await seedreamProviderPlugin.buildGenerateOperation(makeContext());
    expect(defaultOperation.request.json).toMatchObject({
      watermark: false
    });

    const explicitOperation = await seedreamProviderPlugin.buildGenerateOperation(
      makeContext({
        request: {
          extra: {
            watermark: true
          }
        }
      })
    );
    expect(explicitOperation.request.json).toMatchObject({
      watermark: true
    });
  });

  test("builds OpenAI-compatible generation requests", async () => {
    const input = makeContext({
      request: {
        n: 3,
        stream: true,
        quality: "high",
        output_format: "webp",
        response_format: "b64_json",
        user: "agent-1",
        extra: {
          watermark: false,
          optimize_prompt_options: {
            mode: "standard"
          }
        }
      }
    });

    const operation = await seedreamProviderPlugin.buildGenerateOperation(input);

    expect(operation.request).toEqual({
      method: "POST",
      url: "https://ark.cn-beijing.volces.com/api/v3/images/generations",
      headers: {
        Authorization: "Bearer test-key"
      },
      timeoutMs: 120000,
      stream: true,
      json: {
        model: "doubao-seedream-4.5",
        prompt: "a calm product scene",
        n: 3,
        quality: "high",
        output_format: "webp",
        watermark: false,
        optimize_prompt_options: {
          mode: "standard"
        },
        size: "2048x2048",
        response_format: "b64_json",
        stream: true,
        user: "agent-1",
        sequential_image_generation: "auto",
        sequential_image_generation_options: {
          max_images: 3
        }
      }
    });
  });

  test("parses url and base64 responses and preserves temporary-url warnings", async () => {
    const result = await seedreamProviderPlugin.parseGenerateResponse(
      {
        statusCode: 200,
        headers: {},
        bodyText: JSON.stringify({
          data: [
            {
              url: "https://ark-content-generati.example/image-1.png"
            },
            {
              b64_json: "YmFzZTY0LWltYWdl"
            }
          ],
          usage: {
            total_tokens: 9
          }
        }),
        stderrText: "",
        exitCode: 0
      },
      makeContext()
    );

    expect(result).toEqual({
      providerId: "seedream",
      modelId: "doubao-seedream-4.5",
      images: [
        {
          output_format: "url",
          url: "https://ark-content-generati.example/image-1.png",
          warnings: ["Temporary URL; expires in 24 hours."]
        },
        {
          output_format: "b64_json",
          dataBase64: "YmFzZTY0LWltYWdl"
        }
      ],
      warnings: ["Temporary URL; expires in 24 hours."],
      raw: {
        data: [
          {
            url: "https://ark-content-generati.example/image-1.png"
          },
          {
            b64_json: "YmFzZTY0LWltYWdl"
          }
        ],
        usage: {
          total_tokens: 9
        }
      },
      usage: {
        total_tokens: 9
      }
    });
  });

  test("classifies request, credential, and transport failures", () => {
    expect(
      seedreamProviderPlugin.classifyFailure({
        error: new Error("bad request"),
        response: makeResponse(400)
      })
    ).toEqual({
      kind: "non-retryable-request",
      reason: "bad request"
    });

    expect(
      seedreamProviderPlugin.classifyFailure({
        error: new Error("rate limited"),
        response: makeResponse(429)
      })
    ).toEqual({
      kind: "retryable-credential",
      reason: "rate limited"
    });

    expect(
      seedreamProviderPlugin.classifyFailure({
        error: new Error("server error"),
        response: makeResponse(503)
      })
    ).toEqual({
      kind: "retryable-transport",
      reason: "server error"
    });
  });

  test("throws seedream error responses before extracting images", async () => {
    await expect(
      seedreamProviderPlugin.parseGenerateResponse(
        {
          statusCode: 429,
          headers: {},
          bodyText: JSON.stringify({
            error: {
              code: "rate_limit_exceeded",
              message: "Too many requests"
            }
          }),
          stderrText: "",
          exitCode: 0
        },
        makeContext()
      )
    ).rejects.toThrow(
      /Seedream request failed with HTTP 429: rate_limit_exceeded: Too many requests/
    );
  });
});

type ContextOverrides = {
  request?: Partial<ProviderGenerateContext["request"]>;
};

function makeContext(overrides: ContextOverrides = {}): ProviderGenerateContext {
  const requestOverrides = overrides.request ?? {};

  return {
    providerConfig: {
      enabled: true,
      apiBaseUrl: "https://ark.cn-beijing.volces.com/api/v3",
      timeoutMs: 120000,
      retryPolicy: {
        maxAttempts: 3
      },
      apiKey: "test-key",
      credentials: [
        {
          envName: "API_KEY",
          value: "test-key"
        }
      ]
    },
    credential: {
      envName: "API_KEY",
      value: "test-key"
    },
    request: {
      prompt: "a calm product scene",
      model: {
        providerId: "seedream",
        providerAlias: "seedream",
        modelId: "doubao-seedream-4.5"
      },
      size: "2048x2048",
      n: 1,
      stream: false,
      ...requestOverrides
    }
  };
}

function makeResponse(statusCode: number): CurlExecutionResult {
  return {
    statusCode,
    headers: {},
    bodyText: "",
    stderrText: "",
    exitCode: 0
  };
}
