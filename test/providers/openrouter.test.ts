import { describe, expect, test } from "vitest";

import { openrouterProviderPlugin } from "../../src/providers/openrouter/index.js";
import type { ProviderGenerateContext } from "../../src/providers/types.js";

describe("openrouter provider", () => {
  test("builds chat completions image generation requests", async () => {
    const context = makeContext({
      prompt: "a crystal banana on a silver plate",
      size: "3840x2160",
      quality: "high",
      output_format: "webp",
      moderation: "low",
      stream: true,
      partial_images: 1,
      user: "agent-1",
      extra: {
        provider: {
          order: ["google"]
        },
        image_config: {
          seed: 123
        }
      }
    });

    const operation = await openrouterProviderPlugin.buildGenerateOperation(context);

    expect(operation.request).toEqual({
      method: "POST",
      url: "https://openrouter.ai/api/v1/chat/completions",
      headers: {
        Authorization: "Bearer openrouter-key",
        "Content-Type": "application/json"
      },
      json: {
        provider: {
          order: ["google"]
        },
        quality: "high",
        output_format: "webp",
        moderation: "low",
        stream: true,
        partial_images: 1,
        user: "agent-1",
        model: "google/gemini-3.1-flash-image-preview",
        messages: [
          {
            role: "user",
            content: "a crystal banana on a silver plate"
          }
        ],
        modalities: ["image", "text"],
        image_config: {
          seed: 123,
          aspect_ratio: "16:9",
          image_size: "4K"
        }
      },
      timeoutMs: 30000,
      stream: true
    });
  });

  test("parses base64 data urls from assistant images", async () => {
    const result = await openrouterProviderPlugin.parseGenerateResponse(
      {
        statusCode: 200,
        headers: {},
        bodyText: JSON.stringify({
          choices: [
            {
              message: {
                images: [
                  {
                    image_url: {
                      url: "data:image/png;base64,Zm9v"
                    }
                  }
                ]
              }
            }
          ]
        }),
        stderrText: "",
        exitCode: 0
      },
      makeContext()
    );

    expect(result.images).toEqual([
      {
        mimeType: "image/png",
        output_format: "png",
        dataBase64: "Zm9v"
      }
    ]);
  });

  test("throws openrouter error responses instead of returning empty images", async () => {
    await expect(
      openrouterProviderPlugin.parseGenerateResponse(
        {
          statusCode: 402,
          headers: {},
          bodyText: JSON.stringify({
            error: {
              code: "insufficient_credits",
              message: "Insufficient credits"
            }
          }),
          stderrText: "",
          exitCode: 0
        },
        makeContext()
      )
    ).rejects.toThrow(
      /OpenRouter request failed with HTTP 402: insufficient_credits: Insufficient credits/
    );
  });
});

function makeContext(
  overrides: Partial<ProviderGenerateContext["request"]> = {}
): ProviderGenerateContext {
  return {
    request: {
      prompt: "a banana",
      model: {
        providerId: "openrouter",
        providerAlias: "openrouter",
        modelId: "google/gemini-3.1-flash-image-preview"
      },
      ...overrides
    },
    providerConfig: {
      enabled: true,
      apiBaseUrl: "https://openrouter.ai/api/v1",
      timeoutMs: 30000,
      retryPolicy: {
        maxAttempts: 2
      },
      apiKey: "openrouter-key",
      credentials: [
        {
          envName: "API_KEY",
          value: "openrouter-key"
        }
      ]
    },
    credential: {
      envName: "API_KEY",
      value: "openrouter-key"
    }
  };
}
