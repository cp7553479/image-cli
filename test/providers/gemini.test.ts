import { describe, expect, test } from "vitest";

import { geminiProvider } from "../../src/providers/gemini/index.js";
import type { ProviderGenerateContext } from "../../src/providers/types.js";

function makeContext(
  overrides: Partial<ProviderGenerateContext> = {}
): ProviderGenerateContext {
  return {
    request: {
      prompt: "a paper cutout fox",
      model: {
        providerId: "gemini",
        providerAlias: "nano-banana",
        modelId: "gemini-3.1-flash-image-preview"
      },
      size: "1280x720"
    },
    providerConfig: {
      enabled: true,
      apiBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
      timeoutMs: 30_000,
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
    ...overrides
  };
}

describe("gemini provider", () => {
  test("builds a native generateContent request from OpenAI-compatible size", async () => {
    const operation = await geminiProvider.buildGenerateOperation(
      makeContext({
        request: {
          prompt: "a paper cutout fox",
          model: {
            providerId: "gemini",
            providerAlias: "nano-banana",
            modelId: "gemini-3.1-flash-image-preview"
          },
          size: "1280x720",
          n: 2,
          quality: "high",
          output_format: "webp",
          moderation: "low",
          stream: true,
          partial_images: 1,
          user: "agent-1",
          extra: {
            safetySettings: [
              {
                category: "HARM_CATEGORY_DANGEROUS_CONTENT",
                threshold: "BLOCK_NONE"
              }
            ],
            generationConfig: {
              candidateCount: 1
            }
          }
        }
      })
    );

    expect(operation.request.method).toBe("POST");
    expect(operation.request.url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent"
    );
    expect(operation.request.headers).toEqual({
      "x-goog-api-key": "test-key"
    });
    expect(operation.request.json).toEqual({
      safetySettings: [
        {
          category: "HARM_CATEGORY_DANGEROUS_CONTENT",
          threshold: "BLOCK_NONE"
        }
      ],
      contents: [
        {
          role: "user",
          parts: [
            {
              text: "a paper cutout fox"
            }
          ]
        }
      ],
      generationConfig: {
        candidateCount: 1,
        n: 2,
        quality: "high",
        output_format: "webp",
        moderation: "low",
        stream: true,
        partial_images: 1,
        user: "agent-1",
        responseModalities: ["Image"],
        responseFormat: {
          image: {
            aspectRatio: "16:9"
          }
        }
      }
    });
  });

  test("parses inline image responses and adds a SynthID warning", async () => {
    const result = await geminiProvider.parseGenerateResponse(
      {
        statusCode: 200,
        headers: {},
        stderrText: "",
        exitCode: 0,
        bodyText: JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    inline_data: {
                      mime_type: "image/png",
                      data: "YWJjMTIz"
                    }
                  }
                ]
              }
            }
          ],
          usageMetadata: {
            promptTokenCount: 7,
            candidatesTokenCount: 2,
            totalTokenCount: 9
          }
        })
      },
      makeContext()
    );

    expect(result.images).toEqual([
      {
        mimeType: "image/png",
        dataBase64: "YWJjMTIz"
      }
    ]);
    expect(result.warnings).toContain(
      "Gemini-generated images are SynthID watermarked."
    );
    expect(result.usage).toEqual({
      promptTokenCount: 7,
      candidatesTokenCount: 2,
      totalTokenCount: 9
    });
  });

  test("throws google error bodies before extracting images", async () => {
    await expect(
      geminiProvider.parseGenerateResponse(
        {
          statusCode: 400,
          headers: {},
          stderrText: "",
          exitCode: 0,
          bodyText: JSON.stringify({
            error: {
              code: 400,
              message: "Invalid image config",
              status: "INVALID_ARGUMENT"
            }
          })
        },
        makeContext()
      )
    ).rejects.toThrow(
      /Gemini request failed with HTTP 400: 400: Invalid image config/
    );
  });

  test("classifies status-based failures", () => {
    expect(
      geminiProvider.classifyFailure({
        error: new Error("bad request"),
        response: { statusCode: 400 } as never
      })
    ).toEqual({
      kind: "non-retryable-request",
      reason: "Gemini rejected the request with HTTP 400."
    });

    expect(
      geminiProvider.classifyFailure({
        error: new Error("unauthorized"),
        response: { statusCode: 401 } as never
      })
    ).toEqual({
      kind: "retryable-credential",
      reason: "Gemini rejected credentials with HTTP 401."
    });

    expect(
      geminiProvider.classifyFailure({
        error: new Error("server error"),
        response: { statusCode: 503 } as never
      })
    ).toEqual({
      kind: "retryable-transport",
      reason: "Gemini returned HTTP 503."
    });
  });
});
