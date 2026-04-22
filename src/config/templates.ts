export type ConfigTemplates = {
  configExample: string;
  readme: string;
};

export function buildConfigTemplates(): ConfigTemplates {
  return {
    configExample: `// Copy this file to config.json and remove comments.
{
  "version": 1,
  "defaultProvider": "openai",
  "providers": {
    "openai": {
      "enabled": true,
      "apiBaseUrl": "https://api.openai.com/v1",
      "defaultModel": "gpt-image-1.5",
      "timeoutMs": 120000,
      "retryPolicy": {
        "maxAttempts": 2
      },
      "api_key": ["YOUR_OPENAI_API_KEY"]
    },
    "openrouter": {
      "enabled": true,
      "apiBaseUrl": "https://openrouter.ai/api/v1",
      "defaultModel": "google/gemini-3.1-flash-image-preview",
      "timeoutMs": 120000,
      "retryPolicy": {
        "maxAttempts": 2
      },
      "api_key": ["YOUR_OPENROUTER_API_KEY"]
    },
    "gemini": {
      "enabled": true,
      "apiBaseUrl": "https://generativelanguage.googleapis.com/v1beta",
      "defaultModel": "gemini-3.1-flash-image-preview",
      "timeoutMs": 120000,
      "retryPolicy": {
        "maxAttempts": 2
      },
      "api_key": ["YOUR_GEMINI_API_KEY"]
    },
    "seedream": {
      "enabled": true,
      "apiBaseUrl": "https://ark.cn-beijing.volces.com/api/v3",
      "defaultModel": "doubao-seedream-4.5",
      "timeoutMs": 120000,
      "retryPolicy": {
        "maxAttempts": 2
      },
      "api_key": ["YOUR_SEEDREAM_API_KEY"]
    },
    "qwen": {
      "enabled": true,
      "apiBaseUrl": "https://dashscope.aliyuncs.com/api/v1",
      "defaultModel": "qwen-image-2.0-pro",
      "timeoutMs": 120000,
      "retryPolicy": {
        "maxAttempts": 2
      },
      "api_key": ["YOUR_QWEN_API_KEY"]
    },
    "minimax": {
      "enabled": true,
      "apiBaseUrl": "https://api.minimax.io/v1",
      "defaultModel": "image-01",
      "timeoutMs": 120000,
      "retryPolicy": {
        "maxAttempts": 2
      },
      "api_key": ["YOUR_MINIMAX_API_KEY"]
    }
  }
}
`,
    readme: `# ~/.image

This directory stores local configuration for the \`image\` CLI.

- \`config.json\`: your active provider configuration, including \`api_key\`
- \`config.example.jsonc\`: commented template for reference

Quick start:

1. Copy the structure from \`config.example.jsonc\` into \`config.json\` if needed.
2. Fill each provider's \`api_key\` directly in \`config.json\`. It can be a string or an array of strings.
3. Run \`image config doctor\` to verify the setup.

Notes:

- \`image config init\` does not overwrite an existing \`config.json\`.
- \`image config init\` refreshes this README so the usage notes stay current.
`,
  };
}
