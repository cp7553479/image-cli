import { describe, expect, test } from "vitest";

import { normalizeSize } from "../../src/protocol/size.js";
import { minimaxProviderPlugin } from "../../src/providers/minimax/index.js";
import type { GenerateRequest } from "../../src/protocol/request.js";
import type { ProviderGenerateContext } from "../../src/providers/types.js";

function makeContext(overrides: Partial<ProviderGenerateContext> = {}): ProviderGenerateContext {
  const request: GenerateRequest = {
    prompt: "A portrait of a fox in a blue jacket",
    model: {
      providerId: "minimax",
      providerAlias: "minimax",
      modelId: "image-01"
    },
    normalizedSize: normalizeSize("2k", "16:9"),
    count: 2,
    seed: 42,
    extra: {
      watermark: false,
      response_format: "base64",
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
    preparedImages: [
      {
        source: "https://example.com/reference.jpg",
        kind: "url",
        url: "https://example.com/reference.jpg"
      },
      {
        source: "inline-1",
        kind: "inline",
        mimeType: "image/png",
        base64Data: "aGVsbG8="
      }
    ],
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
      watermark: false,
      model: "image-01",
      prompt: "A portrait of a fox in a blue jacket",
      response_format: "base64",
      prompt_optimizer: true,
      aspect_ratio: "16:9",
      width: 2848,
      height: 1600,
      seed: 42,
      n: 2,
      subject_reference: [
        {
          type: "character",
          image_file: "https://example.com/reference.jpg"
        },
        {
          type: "character",
          image_file: "data:image/png;base64,aGVsbG8="
        }
      ]
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
        outputFormat: "url",
        url: "https://cdn.example.com/a.jpg",
        warnings: ["MiniMax image URLs expire after 24 hours. Download them promptly."]
      },
      {
        outputFormat: "url",
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
      {
        ...makeContext(),
        request: {
          ...makeContext().request,
          outputFormat: "png"
        }
      }
    );

    expect(base64Result.images).toEqual([
      {
        outputFormat: "base64",
        mimeType: "image/png",
        fileName: "minimax-1.png",
        dataBase64: "YmFzZTY0LWF"
      },
      {
        outputFormat: "base64",
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

    expect(
      minimaxProviderPlugin.classifyFailure({
        error: new Error("boom"),
        response: {
          statusCode: 200,
          headers: {},
          bodyText: JSON.stringify({
            base_resp: { status_code: 1004, status_msg: "not authorized" }
          }),
          stderrText: "",
          exitCode: 0
        }
      })
    ).toEqual({
      kind: "retryable-credential",
      reason: "MiniMax HTTP 200, base_resp.status_code=1004"
    });

    expect(
      minimaxProviderPlugin.classifyFailure({
        error: new Error("boom"),
        response: {
          statusCode: 200,
          headers: {},
          bodyText: JSON.stringify({
            base_resp: { status_code: 1026, status_msg: "input new_sensitive" }
          }),
          stderrText: "",
          exitCode: 0
        }
      })
    ).toEqual({
      kind: "non-retryable-request",
      reason: "MiniMax HTTP 200, base_resp.status_code=1026"
    });
  });
});
