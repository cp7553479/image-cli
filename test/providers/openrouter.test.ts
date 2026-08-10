import { describe, expect, test, vi } from "vitest";

import { openrouterProviderPlugin } from "../../src/providers/openrouter/index.js";
import type { ProviderGenerateContext } from "../../src/providers/types.js";

vi.mock("../../src/providers/image-input.js", () => ({
  resolveImageToDataUrl: vi.fn(async (input: { url?: string; file?: string }) =>
    `data:image/png;base64,openrouter-${input.url ?? input.file}`
  )
}));

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

  test("builds multimodal content array when reference images are provided", async () => {
    const context = makeContext({
      prompt: "restyle this image",
      reference_images: [{ url: "https://example.com/ref.png" }]
    });

    const operation = await openrouterProviderPlugin.buildGenerateOperation(context);

    const json = operation.request.json as { messages: Array<{ content: Array<Record<string, unknown>> }> };
    const content = json.messages[0].content;
    expect(Array.isArray(content)).toBe(true);
    expect(content[0]).toEqual({ type: "text", text: "restyle this image" });
    expect(content[1]).toEqual({
      type: "image_url",
      image_url: { url: "data:image/png;base64,openrouter-https://example.com/ref.png" }
    });
  });

  test("keeps plain string content when no reference images are provided", async () => {
    const context = makeContext({
      prompt: "plain text prompt"
    });

    const operation = await openrouterProviderPlugin.buildGenerateOperation(context);

    const json = operation.request.json as { messages: Array<{ content: unknown }> };
    expect(json.messages[0].content).toBe("plain text prompt");
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
