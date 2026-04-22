import { describe, expect, test } from "vitest";

import { openrouterProviderPlugin } from "../../src/providers/openrouter/index.js";
import type { ProviderGenerateContext } from "../../src/providers/types.js";

describe("openrouter provider", () => {
  test("builds chat completions image generation requests", async () => {
    const context = makeContext({
      prompt: "a crystal banana on a silver plate",
      aspectRatio: "16:9",
      size: "4k",
      normalizedSize: {
        source: "preset",
        preset: "4k",
        width: 4096,
        height: 2304,
        aspectRatio: "16:9",
        raw: "4k"
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
        model: "google/gemini-3.1-flash-image-preview",
        messages: [
          {
            role: "user",
            content: "a crystal banana on a silver plate"
          }
        ],
        modalities: ["image", "text"],
        image_config: {
          aspect_ratio: "16:9",
          image_size: "4K"
        }
      },
      timeoutMs: 30000
    });
  });

  test("maps prepared images into multimodal message content", async () => {
    const operation = await openrouterProviderPlugin.buildGenerateOperation(
      makeContext({
        preparedImages: [
          {
            source: "local.png",
            kind: "inline",
            mimeType: "image/png",
            base64Data: "YWJj"
          }
        ]
      })
    );

    expect(operation.request.json).toMatchObject({
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "a banana" },
            {
              type: "image_url",
              image_url: {
                url: "data:image/png;base64,YWJj"
              }
            }
          ]
        }
      ]
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
        outputFormat: "png",
        dataBase64: "Zm9v"
      }
    ]);
  });
});

function makeContext(
  overrides: Partial<ProviderGenerateContext["request"]> & {
    preparedImages?: ProviderGenerateContext["preparedImages"];
  } = {}
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
    },
    preparedImages: overrides.preparedImages ?? []
  };
}
