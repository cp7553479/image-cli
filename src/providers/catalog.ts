export type ProviderCatalogEntry = {
  providerId: string;
  aliases: readonly string[];
  defaultBaseUrl: string;
  description: string;
};

/**
 * PROVIDER_CATALOG 的导出入口。
 */
export const PROVIDER_CATALOG = [
  {
    providerId: "openai",
    aliases: ["chatgpt-image"],
    defaultBaseUrl: "https://api.openai.com/v1",
    description: "OpenAI Images API"
  },
  {
    providerId: "openrouter",
    aliases: ["openrouter-image"],
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    description: "OpenRouter image generation via unified chat completions"
  },
  {
    providerId: "gemini",
    aliases: ["nano-banana"],
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
    description: "Gemini native image generation"
  },
  {
    providerId: "seedream",
    aliases: ["doubao-seedream"],
    defaultBaseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    description: "Volcengine Ark Seedream"
  },
  {
    providerId: "qwen",
    aliases: ["qwen-image"],
    defaultBaseUrl: "https://dashscope.aliyuncs.com/api/v1",
    description: "Alibaba Qwen image generation"
  },
  {
    providerId: "minimax",
    aliases: ["minimax-image"],
    defaultBaseUrl: "https://api.minimax.io/v1",
    description: "MiniMax image generation"
  }
] as const satisfies readonly ProviderCatalogEntry[];

export type BuiltInProviderId = (typeof PROVIDER_CATALOG)[number]["providerId"];
