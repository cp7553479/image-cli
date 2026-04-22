import { describe, expect, test, vi } from "vitest";

import { qwenProvider } from "../../src/providers/qwen/index.js";

describe("qwen provider", () => {
  test("builds sync multimodal generation requests with prepared images", async () => {
    const operation = await qwenProvider.buildGenerateOperation({
      request: {
        prompt: "draw a cat",
        model: {
          providerId: "qwen",
          providerAlias: "qwen-image",
          modelId: "qwen-image-plus"
        },
        size: "2k",
        normalizedSize: {
          source: "preset",
          preset: "2k",
          width: 2048,
          height: 2048,
          aspectRatio: "1:1",
          raw: "2k"
        },
        count: 2,
        negativePrompt: "blurry",
        seed: 7,
        extra: {
          prompt_extend: false,
          watermark: true
        }
      },
      providerConfig: {
        enabled: true,
        apiBaseUrl: "https://dashscope.aliyuncs.com/api/v1/",
        defaultModel: "qwen-image-plus",
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
      },
      preparedImages: [
        {
          source: "inline-1",
          kind: "inline",
          mimeType: "image/png",
          base64Data: "YmFzZTY0LWltYWdl"
        },
        {
          source: "url-1",
          kind: "url",
          url: "https://example.com/reference.png"
        }
      ]
    });

    expect(operation.request).toEqual({
      method: "POST",
      url: "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation",
      headers: {
        Authorization: "Bearer secret-key",
        "Content-Type": "application/json"
      },
      json: {
        model: "qwen-image-plus",
        input: {
          messages: [
            {
              role: "user",
              content: [
                { text: "draw a cat" },
                { image: "data:image/png;base64,YmFzZTY0LWltYWdl" },
                { image: "https://example.com/reference.png" }
              ]
            }
          ]
        },
        parameters: {
          size: "2048*2048",
          n: 2,
          negative_prompt: "blurry",
          seed: 7,
          prompt_extend: false,
          watermark: true
        }
      },
      timeoutMs: 30_000
    });
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
        },
        extra: {
          prompt_extend: true
        }
      },
      providerConfig: {
        enabled: true,
        apiBaseUrl: "https://dashscope.aliyuncs.com/api/v1",
        defaultModel: "qwen-image",
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
      },
      preparedImages: []
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
        parameters: {
          prompt_extend: true
        }
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
          defaultModel: "qwen-image",
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
        defaultModel: "qwen-image",
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
      },
      preparedImages: []
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
});

function makeCurlResult(payload: Record<string, unknown>) {
  return {
    statusCode: 200,
    headers: {},
    bodyText: JSON.stringify(payload),
    stderrText: "",
    exitCode: 0
  };
}

function makeStatusResult(statusCode: number) {
  return {
    statusCode,
    headers: {},
    bodyText: "",
    stderrText: "",
    exitCode: 0
  };
}

function makeFailureContext(statusCode: number) {
  return {
    error: new Error(`HTTP ${statusCode}`),
    response: makeStatusResult(statusCode)
  };
}
