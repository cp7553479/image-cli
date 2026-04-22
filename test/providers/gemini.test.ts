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
      aspectRatio: "16:9"
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
    preparedImages: [
      {
        source: "local.png",
        kind: "inline",
        mimeType: "image/png",
        base64Data: "YWJjMTIz"
      }
    ],
    ...overrides
  };
}

describe("gemini provider", () => {
  test("builds a native generateContent request with inline image parts", async () => {
    const operation = await geminiProvider.buildGenerateOperation(makeContext());

    expect(operation.request.method).toBe("POST");
    expect(operation.request.url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent"
    );
    expect(operation.request.headers).toEqual({
      "x-goog-api-key": "test-key"
    });
    expect(operation.request.json).toEqual({
      contents: [
        {
          role: "user",
          parts: [
            {
              text: "a paper cutout fox"
            },
            {
              inlineData: {
                mimeType: "image/png",
                data: "YWJjMTIz"
              }
            }
          ]
        }
      ],
      generationConfig: {
        responseModalities: ["IMAGE"],
        imageConfig: {
          aspectRatio: "16:9"
        }
      }
    });
  });

  test("rejects prepared image urls", async () => {
    await expect(
      geminiProvider.buildGenerateOperation(
        makeContext({
          preparedImages: [
            {
              source: "remote.png",
              kind: "url",
              url: "https://example.com/remote.png"
            }
          ]
        })
      )
    ).rejects.toThrow(/prepared image urls/i);
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
          ]
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
