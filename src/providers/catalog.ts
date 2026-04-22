import type { CanonicalProviderId } from "../protocol/types.js";

export type ProviderCatalogEntry = {
  providerId: CanonicalProviderId;
  aliases: string[];
  defaultBaseUrl: string;
  description: string;
};

export const PROVIDER_CATALOG: ProviderCatalogEntry[] = [
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
];
