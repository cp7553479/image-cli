import { describe, expect, test } from "vitest";

import { seedreamProviderPlugin } from "../../src/providers/seedream/index.js";
import type { ProviderGenerateContext } from "../../src/providers/types.js";
import type { CurlExecutionResult } from "../../src/transport/curl.js";

describe("seedream provider", () => {
  test("builds grouped generation requests with reference images and provider extras", async () => {
    const input = makeContext({
      request: {
        count: 3,
        stream: true,
        extra: {
          watermark: false,
          response_format: "b64_json",
          optimize_prompt_options: {
            mode: "standard"
          }
        }
      },
      preparedImages: [
        {
          source: "source-1",
          kind: "url",
          url: "https://example.com/reference.png"
        },
        {
          source: "source-2",
          kind: "inline",
          mimeType: "image/jpeg",
          base64Data: "base64-inline"
        }
      ]
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
        size: "2K",
        response_format: "b64_json",
        stream: true,
        watermark: false,
        reference_images: [
          "https://example.com/reference.png",
          "data:image/jpeg;base64,base64-inline"
        ],
        sequential_image_generation: "auto",
        sequential_image_generation_options: {
          max_images: 3
        },
        optimize_prompt_options: {
          mode: "standard"
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
          outputFormat: "url",
          url: "https://ark-content-generati.example/image-1.png",
          warnings: ["Temporary URL; expires in 24 hours."]
        },
        {
          outputFormat: "b64_json",
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
});

type ContextOverrides = {
  request?: Partial<ProviderGenerateContext["request"]>;
  preparedImages?: ProviderGenerateContext["preparedImages"];
};

function makeContext(overrides: ContextOverrides = {}): ProviderGenerateContext {
  const requestOverrides = overrides.request ?? {};

  return {
    providerConfig: {
      enabled: true,
      apiBaseUrl: "https://ark.cn-beijing.volces.com/api/v3",
      defaultModel: "doubao-seedream-4.5",
      timeoutMs: 120000,
      retryPolicy: {
        maxAttempts: 3,
        retryableHttpStatus: [401, 403, 429, 500, 502, 503, 504]
      },
      apiKeyEnvNames: ["IMAGE_SEEDREAM_API_KEY_1"],
      credentials: [
        {
          envName: "IMAGE_SEEDREAM_API_KEY_1",
          value: "test-key"
        }
      ]
    },
    credential: {
      envName: "IMAGE_SEEDREAM_API_KEY_1",
      value: "test-key"
    },
    preparedImages: overrides.preparedImages ?? [],
    request: {
      prompt: "a calm product scene",
      model: {
        providerId: "seedream",
        providerAlias: "seedream",
        modelId: "doubao-seedream-4.5"
      },
      size: "2K",
      count: 1,
      stream: false,
      extra: {},
      ...requestOverrides
    },
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
