import type { CredentialEntry, ResolvedProviderConfig } from "../config/types.js";
import type { GenerateRequest, ProviderCapabilities } from "../protocol/request.js";
import type { CurlExecutionResult, CurlRequest } from "../transport/curl.js";

export type ProviderGenerateContext = {
  request: GenerateRequest;
  providerConfig: ResolvedProviderConfig;
  credential: CredentialEntry;
};

export type BuiltInInterfaceAdapterId =
  | "native-image"
  | "openai-compatible-chat"
  | "gemini-generate-content";

export type InterfaceAdapterId = BuiltInInterfaceAdapterId | (string & {});

export type ProviderAuthProfile =
  | {
      type: "bearer";
      headerName?: string;
      scheme?: string;
    }
  | {
      type: "api-key-header";
      headerName: string;
    }
  | {
      type: "api-key-query";
      queryName: string;
    }
  | {
      type: "none";
    };

export type ProviderProfile = {
  providerId: string;
  aliases: string[];
  baseUrl: string;
  auth: ProviderAuthProfile;
  capabilities: ProviderCapabilities;
  interfaceAdapter: InterfaceAdapterId;
};

export type InterfaceAdapterGenerateContext = {
  request: GenerateRequest;
  profile: ProviderProfile;
  credential?: CredentialEntry;
  timeoutMs?: number;
};

export type ProviderImageResult = {
  output_format?: string;
  mimeType?: string;
  fileName?: string;
  dataBase64?: string;
  url?: string;
  expiresAt?: string;
  warnings?: string[];
};

export type NormalizedUsage = {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  input_tokens_details?: {
    cached_tokens?: number;
  };
  output_tokens_details?: {
    reasoning_tokens?: number;
  };
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_tokens_details?: {
    cached_tokens?: number;
  };
  completion_tokens_details?: {
    reasoning_tokens?: number;
  };
};

export type ProviderUsage = NormalizedUsage | Record<string, unknown>;

export type GenerateResult = {
  providerId: string;
  modelId: string;
  images: ProviderImageResult[];
  warnings: string[];
  raw: unknown;
  usage?: ProviderUsage;
};

// See docs/error-handling.md#provider-failure-classification for runtime actions.
export type FailureClassification =
  | {
      kind: "retryable-credential";
      reason: string;
    }
  | {
      kind: "retryable-transport";
      reason: string;
    }
  | {
      kind: "non-retryable-request";
      reason: string;
    }
  | {
      kind: "unknown";
      reason: string;
    };

export type ProviderOperation = {
  request: CurlRequest;
  followUp?: (
    initialResult: CurlExecutionResult,
    tools: {
      execute: (request: CurlRequest) => Promise<CurlExecutionResult>;
      providerConfig: ResolvedProviderConfig;
      credential: CredentialEntry;
    }
  ) => Promise<CurlExecutionResult>;
};

export type InterfaceAdapter = {
  adapterId: InterfaceAdapterId;
  buildGenerateOperation(
    input: InterfaceAdapterGenerateContext
  ): Promise<ProviderOperation> | ProviderOperation;
  parseGenerateResponse(
    result: CurlExecutionResult,
    input: InterfaceAdapterGenerateContext
  ): Promise<GenerateResult> | GenerateResult;
};

export type ProviderErrorContext = {
  error: unknown;
  response?: CurlExecutionResult;
};

export type ProviderPlugin = {
  providerId: string;
  aliases: string[];
  capabilities: ProviderCapabilities;
  buildGenerateOperation(input: ProviderGenerateContext): Promise<ProviderOperation>;
  parseGenerateResponse(
    result: CurlExecutionResult,
    input: ProviderGenerateContext
  ): Promise<GenerateResult>;
  classifyFailure(context: ProviderErrorContext): FailureClassification;
};
