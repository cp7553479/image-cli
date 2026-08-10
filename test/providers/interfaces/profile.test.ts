import { describe, expect, test } from "vitest";

import type {
  GenerateRequest,
  ProviderCapabilities
} from "../../../src/protocol/request.js";
import {
  applyProviderAuthToUrl,
  buildProviderAuthHeaders,
  defineProviderProfile,
  isBuiltInInterfaceAdapterId,
  toInterfaceAdapterGenerateContext
} from "../../../src/providers/interfaces/profile.js";
import type {
  ProviderGenerateContext,
  ProviderProfile
} from "../../../src/providers/types.js";

const FULL_CAPABILITIES: ProviderCapabilities = {
  generate: true,
  edit: true,
  asyncTasks: true,
  streaming: true,
  background: true,
  multipleOutputs: true,
  transparentOutput: true
};

describe("provider interface profiles", () => {
  test("normalizes provider profile identity without mutating source objects", () => {
    const source: ProviderProfile = {
      providerId: " openrouter ",
      aliases: ["openrouter-image"],
      baseUrl: " https://openrouter.ai/api/v1/ ",
      auth: {
        type: "bearer"
      },
      capabilities: { ...FULL_CAPABILITIES },
      interfaceAdapter: "openai-compatible-chat"
    };

    const profile = defineProviderProfile(source);
    source.aliases.push("mutated");
    source.capabilities.generate = false;

    expect(profile).toEqual({
      providerId: "openrouter",
      aliases: ["openrouter-image"],
      baseUrl: "https://openrouter.ai/api/v1",
      auth: {
        type: "bearer"
      },
      capabilities: {
        ...FULL_CAPABILITIES
      },
      interfaceAdapter: "openai-compatible-chat"
    });
    expect(isBuiltInInterfaceAdapterId(profile.interfaceAdapter)).toBe(true);
  });

  test("builds provider auth headers and query credentials", () => {
    const credential = {
      envName: "TEST_API_KEY",
      value: "sk-test"
    };

    expect(buildProviderAuthHeaders({ type: "bearer" }, credential)).toEqual({
      Authorization: "Bearer sk-test"
    });
    expect(
      buildProviderAuthHeaders(
        {
          type: "api-key-header",
          headerName: "x-goog-api-key"
        },
        credential
      )
    ).toEqual({
      "x-goog-api-key": "sk-test"
    });
    expect(
      applyProviderAuthToUrl(
        "https://example.com/v1/models:generateContent?alt=json",
        {
          type: "api-key-query",
          queryName: "key"
        },
        credential
      )
    ).toBe("https://example.com/v1/models:generateContent?alt=json&key=sk-test");
    expect(() => buildProviderAuthHeaders({ type: "bearer" })).toThrow(
      /requires a credential/
    );
  });

  test("maps provider context to adapter context and rejects provider mismatches", () => {
    const request = makeRequest();
    const context = makeProviderContext(request);
    const profile = defineProviderProfile({
      providerId: "gemini",
      aliases: ["nano-banana"],
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
      auth: {
        type: "api-key-header",
        headerName: "x-goog-api-key"
      },
      capabilities: { ...FULL_CAPABILITIES },
      interfaceAdapter: "gemini-generate-content"
    });

    expect(toInterfaceAdapterGenerateContext(context, profile)).toEqual({
      request,
      profile,
      credential: {
        envName: "GEMINI_API_KEY",
        value: "test-key"
      },
      timeoutMs: 30000
    });

    expect(() =>
      toInterfaceAdapterGenerateContext(
        makeProviderContext(
          makeRequest({
            providerId: "openai"
          })
        ),
        profile
      )
    ).toThrow(/does not match profile/);
  });
});

function makeRequest(
  overrides: Partial<GenerateRequest["model"]> = {}
): GenerateRequest {
  return {
    prompt: "a fox",
    model: {
      providerId: "gemini",
      providerAlias: "nano-banana",
      modelId: "gemini-image",
      ...overrides
    }
  };
}

function makeProviderContext(request: GenerateRequest): ProviderGenerateContext {
  return {
    request,
    providerConfig: {
      enabled: true,
      apiBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
      timeoutMs: 30000,
      retryPolicy: {
        maxAttempts: 2
      },
      apiKey: "test-key",
      credentials: [
        {
          envName: "GEMINI_API_KEY",
          value: "test-key"
        }
      ]
    },
    credential: {
      envName: "GEMINI_API_KEY",
      value: "test-key"
    }
  };
}
