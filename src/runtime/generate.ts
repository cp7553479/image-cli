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

/**
 * 依次尝试 provider 凭证执行生成请求。
 * @param options 运行参数与执行器。
 * @returns 首个成功解析的生成结果。
 * @throws 当所有凭证失败或遇到不可重试错误时抛出。
 */
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

/**
 * 执行一次完整的生成调用（加载配置、执行请求、落盘输出）。
 * @param request 标准化生成请求。
 * @param options 可选环境覆盖。
 * @returns 输出清单。
 */
export async function runGenerateRequest(
  request: GenerateRequest,
  options: RunGenerateRequestOptions = {}
): Promise<OutputManifest> {
  const resolvedConfig = await loadResolvedConfig({
    homeDir: options.homeDir,
    env: options.env
  });
  const providerPlugin = getProviderPlugin(request.model.providerId, {
    homeDir: options.homeDir
  });
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

/**
 * resolveDefaultModel 的导出入口。
 */
export async function resolveDefaultModel(homeDir?: string): Promise<string | undefined> {
  const resolvedConfig = await loadResolvedConfig({ homeDir });
  return resolvedConfig.defaultModel;
}

function defaultOutputDir(): string {
  const timestamp = new Date().toISOString().replaceAll(":", "-");
  return path.resolve(process.cwd(), "image-output", timestamp);
}
