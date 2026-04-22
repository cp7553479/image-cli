import type { CredentialEntry, ResolvedProviderConfig } from "../config/types.js";
import type { GenerateRequest, ProviderCapabilities } from "../protocol/request.js";
import type { CanonicalProviderId } from "../protocol/types.js";
import type { CurlExecutionResult, CurlRequest } from "../transport/curl.js";

export type PreparedImageInput =
  | {
      source: string;
      kind: "url";
      url: string;
    }
  | {
      source: string;
      kind: "inline";
      mimeType: string;
      base64Data: string;
    };

export type ProviderGenerateContext = {
  request: GenerateRequest;
  providerConfig: ResolvedProviderConfig;
  credential: CredentialEntry;
  preparedImages: PreparedImageInput[];
};

export type ProviderImageResult = {
  outputFormat?: string;
  mimeType?: string;
  fileName?: string;
  dataBase64?: string;
  url?: string;
  expiresAt?: string;
  warnings?: string[];
};

export type GenerateResult = {
  providerId: CanonicalProviderId;
  modelId: string;
  images: ProviderImageResult[];
  warnings: string[];
  raw: unknown;
  usage?: Record<string, unknown>;
};

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

export type ProviderErrorContext = {
  error: unknown;
  response?: CurlExecutionResult;
};

export type ProviderPlugin = {
  providerId: CanonicalProviderId;
  aliases: string[];
  capabilities: ProviderCapabilities;
  buildGenerateOperation(input: ProviderGenerateContext): Promise<ProviderOperation>;
  parseGenerateResponse(
    result: CurlExecutionResult,
    input: ProviderGenerateContext
  ): Promise<GenerateResult>;
  classifyFailure(context: ProviderErrorContext): FailureClassification;
};
