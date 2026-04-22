import path from "node:path";

import { loadResolvedConfig } from "../config/load.js";
import type { ResolvedProviderConfig } from "../config/types.js";
import type { GenerateRequest } from "../protocol/request.js";
import type { CurlExecutionResult, CurlRequest } from "../transport/curl.js";
import { executeCurlRequest } from "../transport/curl.js";
import { getProviderPlugin } from "../providers/index.js";
import type {
  GenerateResult,
  PreparedImageInput,
  ProviderPlugin
} from "../providers/types.js";
import { prepareImageInputs } from "./images.js";
import { writeGenerateArtifacts, type OutputManifest } from "./output.js";

type ExecuteGenerateWithFailoverOptions = {
  plugin: ProviderPlugin;
  providerConfig: ResolvedProviderConfig;
  request: GenerateRequest;
  preparedImages: PreparedImageInput[];
  execute: (request: CurlRequest) => Promise<CurlExecutionResult>;
};

export async function executeGenerateWithFailover(
  options: ExecuteGenerateWithFailoverOptions
): Promise<GenerateResult> {
  let lastError: unknown;

  for (const credential of options.providerConfig.credentials) {
    let response: CurlExecutionResult | undefined;

    try {
      const operation = await options.plugin.buildGenerateOperation({
        request: options.request,
        providerConfig: options.providerConfig,
        credential,
        preparedImages: options.preparedImages
      });
      response = await options.execute(operation.request);

      if (operation.followUp) {
        response = await operation.followUp(response, {
          execute: options.execute,
          providerConfig: options.providerConfig,
          credential
        });
      }

      return await options.plugin.parseGenerateResponse(response, {
        request: options.request,
        providerConfig: options.providerConfig,
        credential,
        preparedImages: options.preparedImages
      });
    } catch (error) {
      lastError = error;
      const failure = options.plugin.classifyFailure({
        error,
        response
      });
      if (failure.kind === "retryable-credential") {
        continue;
      }
      throw error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("All provider credentials failed.");
}

type RunGenerateRequestOptions = {
  homeDir?: string;
  env?: Record<string, string | undefined>;
};

export async function runGenerateRequest(
  request: GenerateRequest,
  options: RunGenerateRequestOptions = {}
): Promise<OutputManifest> {
  const resolvedConfig = await loadResolvedConfig({
    homeDir: options.homeDir,
    env: options.env
  });
  const providerPlugin = getProviderPlugin(request.model.providerId);
  const providerConfig = resolvedConfig.providers[request.model.providerId];
  if (!providerConfig) {
    throw new Error(
      `Provider "${request.model.providerId}" is not configured in ~/.image/config.json.`
    );
  }

  if (providerConfig.credentials.length === 0) {
    throw new Error(
      `Provider "${request.model.providerId}" does not have any resolved API keys.`
    );
  }

  const preparedImages = await prepareImageInputs(request.images ?? []);
  const result = await executeGenerateWithFailover({
    plugin: providerPlugin,
    providerConfig,
    request,
    preparedImages,
    execute: executeCurlRequest
  });

  const outputDir = request.outputDir ?? defaultOutputDir();
  return await writeGenerateArtifacts({
    outputDir,
    result
  });
}

function defaultOutputDir(): string {
  const timestamp = new Date().toISOString().replaceAll(":", "-");
  return path.resolve(process.cwd(), "image-output", timestamp);
}
