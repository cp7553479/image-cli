import { describe, expect, test, vi } from "vitest";

import { qwenProvider } from "../../src/providers/qwen/index.js";

describe("qwen provider", () => {
  test("builds sync multimodal generation requests from OpenAI-compatible options", async () => {
    const operation = await qwenProvider.buildGenerateOperation({
      request: {
        prompt: "draw a cat",
        model: {
          providerId: "qwen",
          providerAlias: "qwen",
          modelId: "qwen-vl-max"
        },
        size: "2048x2048",
        n: 2,
        quality: "high",
        background: "opaque",
        output_format: "webp",
        moderation: "low",
        response_format: "b64_json",
        stream: true,
        partial_images: 1,
        user: "agent-1",
        extra: {
          prompt_extend: false,
          watermark: true
        }
      },
      providerConfig: {
        enabled: true,
        apiBaseUrl: "https://dashscope.aliyuncs.com/api/v1/",
        timeoutMs: 30_000,
        retryPolicy: {
          maxAttempts: 3
        },
        apiKey: "secret-key",
        credentials: []
      },
      credential: {
        envName: "DASHSCOPE_API_KEY",
        value: "secret-key"
      }
    });

    expect(operation.request).toEqual({
      method: "POST",
      url: "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation",
      headers: {
        Authorization: "Bearer secret-key",
        "Content-Type": "application/json"
      },
      json: {
        model: "qwen-vl-max",
        input: {
          messages: [
            {
              role: "user",
              content: [
                { text: "draw a cat" }
              ]
            }
          ]
        },
        parameters: {
          prompt_extend: false,
          watermark: true,
          n: 2,
          quality: "high",
          background: "opaque",
          output_format: "webp",
          moderation: "low",
          response_format: "b64_json",
          stream: true,
          partial_images: 1,
          user: "agent-1",
          size: "2048*2048",
        }
      },
      timeoutMs: 30_000
    });
    expect(operation.followUp).toBeUndefined();
  });

  test("keeps qwen-image versioned models on the sync endpoint", async () => {
    const operation = await qwenProvider.buildGenerateOperation({
      request: {
        prompt: "draw a cat",
        model: {
          providerId: "qwen",
          providerAlias: "qwen",
          modelId: "qwen-image-2.0-pro"
        },
        size: "1328x1328"
      },
      providerConfig: {
        enabled: true,
        apiBaseUrl: "https://dashscope.aliyuncs.com/api/v1/",
        timeoutMs: 30_000,
        retryPolicy: {
          maxAttempts: 3
        },
        apiKey: "secret-key",
        credentials: []
      },
      credential: {
        envName: "DASHSCOPE_API_KEY",
        value: "secret-key"
      }
    });

    expect(operation.request.url).toBe(
      "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation"
    );
    expect(operation.followUp).toBeUndefined();
  });

  test("polls async qwen-image tasks until success and returns urls", async () => {
    const operation = await qwenProvider.buildGenerateOperation({
      request: {
        prompt: "a poster",
        model: {
          providerId: "qwen",
          providerAlias: "qwen-image",
          modelId: "qwen-image"
        }
      },
      providerConfig: {
        enabled: true,
        apiBaseUrl: "https://dashscope.aliyuncs.com/api/v1",
        timeoutMs: 30_000,
        retryPolicy: {
          maxAttempts: 3
        },
        apiKey: "secret-key",
        credentials: []
      },
      credential: {
        envName: "DASHSCOPE_API_KEY",
        value: "secret-key"
      }
    });

    expect(operation.request).toEqual({
      method: "POST",
      url: "https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis",
      headers: {
        Authorization: "Bearer secret-key",
        "Content-Type": "application/json",
        "X-DashScope-Async": "enable"
      },
      json: {
        model: "qwen-image",
        input: {
          prompt: "a poster"
        },
        parameters: {}
      },
      timeoutMs: 30_000
    });
    expect(operation.followUp).toBeTypeOf("function");

    const execute = vi
      .fn()
      .mockResolvedValueOnce(
        makeCurlResult({
          output: {
            task_id: "task-1",
            task_status: "RUNNING"
          }
        })
      )
      .mockResolvedValueOnce(
        makeCurlResult({
          output: {
            task_id: "task-1",
            task_status: "SUCCEEDED",
            results: [
              {
                url: "https://example.com/generated.png"
              }
            ]
          },
          usage: {
            image_count: 1
          }
        })
      );

    const finalResult = await operation.followUp!(
      makeCurlResult({
        output: {
          task_id: "task-1",
          task_status: "PENDING"
        }
      }),
      {
        execute,
        providerConfig: {
          enabled: true,
          apiBaseUrl: "https://dashscope.aliyuncs.com/api/v1",
          timeoutMs: 30_000,
          retryPolicy: {
            maxAttempts: 3
          },
          apiKey: "secret-key",
          credentials: []
        },
        credential: {
          envName: "DASHSCOPE_API_KEY",
          value: "secret-key"
        }
      }
    );

    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute.mock.calls[0]?.[0]).toEqual({
      method: "GET",
      url: "https://dashscope.aliyuncs.com/api/v1/tasks/task-1",
      headers: {
        Authorization: "Bearer secret-key"
      },
      timeoutMs: 30_000
    });
    expect(finalResult.bodyText).toContain("SUCCEEDED");

    const parsed = await qwenProvider.parseGenerateResponse(finalResult, {
      request: {
        prompt: "a poster",
        model: {
          providerId: "qwen",
          providerAlias: "qwen-image",
          modelId: "qwen-image"
        }
      },
      providerConfig: {
        enabled: true,
        apiBaseUrl: "https://dashscope.aliyuncs.com/api/v1",
        timeoutMs: 30_000,
        retryPolicy: {
          maxAttempts: 3
        },
        apiKey: "secret-key",
        credentials: []
      },
      credential: {
        envName: "DASHSCOPE_API_KEY",
        value: "secret-key"
      }
    });

    expect(parsed.images).toEqual([
      {
        url: "https://example.com/generated.png"
      }
    ]);
    expect(parsed.usage).toEqual({
      image_count: 1
    });
  });

  test("classifies qwen failures by status code", () => {
    expect(qwenProvider.classifyFailure(makeFailureContext(400))).toEqual({
      kind: "non-retryable-request",
      reason: "Qwen rejected the request with HTTP 400."
    });
    expect(qwenProvider.classifyFailure(makeFailureContext(401))).toEqual({
      kind: "retryable-credential",
      reason: "Qwen rejected credentials with HTTP 401."
    });
    expect(qwenProvider.classifyFailure(makeFailureContext(502))).toEqual({
      kind: "retryable-transport",
      reason: "Qwen returned HTTP 502."
    });
  });

  test("throws qwen error responses before extracting images", async () => {
    await expect(
      qwenProvider.parseGenerateResponse(
        {
          statusCode: 401,
          headers: {},
          bodyText: JSON.stringify({
            code: "InvalidApiKey",
            message: "Invalid API key"
          }),
          stderrText: "",
          exitCode: 0
        },
        makeParseContext()
      )
    ).rejects.toThrow(
      /Qwen request failed with HTTP 401: InvalidApiKey: Invalid API key/
    );
  });
});

function makeCurlResult(body: unknown) {
  return {
    statusCode: 200,
    headers: {},
    bodyText: JSON.stringify(body),
    stderrText: "",
    exitCode: 0
  };
}

function makeFailureContext(statusCode: number) {
  return {
    error: new Error("boom"),
    response: {
      statusCode,
      headers: {},
      bodyText: "{}",
      stderrText: "",
      exitCode: 0
    }
  };
}

function makeParseContext() {
  return {
    request: {
      prompt: "draw a cat",
      model: {
        providerId: "qwen",
        providerAlias: "qwen",
        modelId: "qwen-vl-max"
      }
    },
    providerConfig: {
      enabled: true,
      apiBaseUrl: "https://dashscope.aliyuncs.com/api/v1",
      timeoutMs: 30_000,
      retryPolicy: {
        maxAttempts: 3
      },
      apiKey: "secret-key",
      credentials: []
    },
    credential: {
      envName: "DASHSCOPE_API_KEY",
      value: "secret-key"
    }
  };
}
