import { describe, expect, test, vi } from "vitest";

import { minimaxProviderPlugin } from "../../src/providers/minimax/index.js";
import type { GenerateRequest } from "../../src/protocol/request.js";
import type { ProviderGenerateContext } from "../../src/providers/types.js";

vi.mock("../../src/providers/image-input.js", () => ({
  resolveImageToDataUrl: vi.fn(async (input: { url?: string; file?: string }) =>
    `data:image/png;base64,minimax-${input.url ?? input.file}`
  )
}));

function makeContext(overrides: Partial<ProviderGenerateContext> = {}): ProviderGenerateContext {
  const request: GenerateRequest = {
    prompt: "A portrait of a fox in a blue jacket",
    model: {
      providerId: "minimax",
      providerAlias: "minimax",
      modelId: "image-01"
    },
    size: "2048x1152",
    n: 2,
    quality: "high",
    moderation: "low",
    response_format: "b64_json",
    output_format: "png",
    user: "agent-1",
    extra: {
      prompt_optimizer: true
    }
  };

  return {
    request,
    providerConfig: {
      enabled: true,
      apiBaseUrl: "https://api.minimax.io/v1",
      timeoutMs: 120_000,
      retryPolicy: {
        maxAttempts: 3
      },
      apiKey: "secret-key",
      credentials: [
        {
          envName: "API_KEY",
          value: "secret-key"
        }
      ]
    },
    credential: {
      envName: "API_KEY",
      value: "secret-key"
    },
    ...overrides
  };
}

describe("MiniMax provider", () => {
  test("builds the image_generation request payload", async () => {
    const operation = await minimaxProviderPlugin.buildGenerateOperation(makeContext());

    expect(operation.request).toMatchObject({
      method: "POST",
      url: "https://api.minimax.io/v1/image_generation",
      headers: {
        Authorization: "Bearer secret-key"
      },
      timeoutMs: 120_000
    });
    expect(operation.request.json).toEqual({
      model: "image-01",
      prompt: "A portrait of a fox in a blue jacket",
      prompt_optimizer: true,
      quality: "high",
      moderation: "low",
      output_format: "png",
      user: "agent-1",
      response_format: "base64",
      aspect_ratio: "16:9",
      width: 2048,
      height: 1152,
      n: 2
    });
  });

  test("parses url and base64 responses", async () => {
    const urlResult = await minimaxProviderPlugin.parseGenerateResponse(
      {
        statusCode: 200,
        headers: {},
        bodyText: JSON.stringify({
          id: "trace-id",
          data: {
            image_urls: ["https://cdn.example.com/a.jpg", "https://cdn.example.com/b.jpg"]
          },
          base_resp: {
            status_code: 0,
            status_msg: "success"
          }
        }),
        stderrText: "",
        exitCode: 0
      },
      makeContext()
    );

    expect(urlResult).toMatchObject({
      providerId: "minimax",
      modelId: "image-01",
      warnings: ["MiniMax image URLs expire after 24 hours. Download them promptly."]
    });
    expect(urlResult.images).toEqual([
      {
        output_format: "url",
        url: "https://cdn.example.com/a.jpg",
        warnings: ["MiniMax image URLs expire after 24 hours. Download them promptly."]
      },
      {
        output_format: "url",
        url: "https://cdn.example.com/b.jpg",
        warnings: ["MiniMax image URLs expire after 24 hours. Download them promptly."]
      }
    ]);

    const base64Result = await minimaxProviderPlugin.parseGenerateResponse(
      {
        statusCode: 200,
        headers: {},
        bodyText: JSON.stringify({
          data: {
            image_base64: ["YmFzZTY0LWF", "YmFzZTY0LWI="]
          },
          base_resp: {
            status_code: 0,
            status_msg: "success"
          }
        }),
        stderrText: "",
        exitCode: 0
      },
      makeContext()
    );

    expect(base64Result.images).toEqual([
      {
        output_format: "base64",
        mimeType: "image/png",
        fileName: "minimax-1.png",
        dataBase64: "YmFzZTY0LWF"
      },
      {
        output_format: "base64",
        mimeType: "image/png",
        fileName: "minimax-2.png",
        dataBase64: "YmFzZTY0LWI="
      }
    ]);
  });

  test("classifies retryable credential, transport, and request failures", () => {
    expect(
      minimaxProviderPlugin.classifyFailure({
        error: new Error("boom"),
        response: {
          statusCode: 401,
          headers: {},
          bodyText: JSON.stringify({
            base_resp: { status_code: 0, status_msg: "success" }
          }),
          stderrText: "",
          exitCode: 0
        }
      })
    ).toEqual({
      kind: "retryable-credential",
      reason: "MiniMax HTTP 401, base_resp.status_code=0"
    });

    expect(
      minimaxProviderPlugin.classifyFailure({
        error: new Error("boom"),
        response: {
          statusCode: 503,
          headers: {},
          bodyText: JSON.stringify({
            base_resp: { status_code: 0, status_msg: "success" }
          }),
          stderrText: "",
          exitCode: 0
        }
      })
    ).toEqual({
      kind: "retryable-transport",
      reason: "MiniMax HTTP 503, base_resp.status_code=0"
    });

    expect(
      minimaxProviderPlugin.classifyFailure({
        error: new Error("boom"),
        response: {
          statusCode: 400,
          headers: {},
          bodyText: JSON.stringify({
            base_resp: { status_code: 0, status_msg: "success" }
          }),
          stderrText: "",
          exitCode: 0
        }
      })
    ).toEqual({
      kind: "non-retryable-request",
      reason: "MiniMax HTTP 400, base_resp.status_code=0"
    });
  });

  test("throws minimax http error bodies before parsing images", async () => {
    await expect(
      minimaxProviderPlugin.parseGenerateResponse(
        {
          statusCode: 400,
          headers: {},
          bodyText: JSON.stringify({
            base_resp: {
              status_code: 1002,
              status_msg: "invalid parameter"
            }
          }),
          stderrText: "",
          exitCode: 0
        },
        makeContext()
      )
    ).rejects.toThrow(
      /MiniMax request failed with HTTP 400: 1002: invalid parameter/
    );
  });

  test("maps reference images to subject_reference entries", async () => {
    const operation = await minimaxProviderPlugin.buildGenerateOperation(
      makeContext({
        request: {
          prompt: "A portrait of a fox in a blue jacket",
          model: {
            providerId: "minimax",
            providerAlias: "minimax",
            modelId: "image-01"
          },
          reference_images: [{ url: "https://example.com/character.jpg" }]
        }
      })
    );

    const json = operation.request.json as Record<string, unknown>;
    expect(json.subject_reference).toEqual([
      { type: "character", image_file: "data:image/png;base64,minimax-https://example.com/character.jpg" }
    ]);
  });
});
