export type ConfigTemplates = {
  configExample: string;
  envExample: string;
  gitignore: string;
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
      "defaultModel": "chatgpt-image-latest",
      "timeoutMs": 120000,
      "retryPolicy": {
        "maxAttempts": 2,
        "retryableHttpStatus": [401, 408, 409, 429, 500, 502, 503, 504]
      },
      "apiKeyEnvNames": ["IMAGE_OPENAI_API_KEY_1"]
    },
    "gemini": {
      "enabled": true,
      "apiBaseUrl": "https://generativelanguage.googleapis.com/v1beta",
      "defaultModel": "gemini-2.5-flash-image",
      "timeoutMs": 120000,
      "retryPolicy": {
        "maxAttempts": 2,
        "retryableHttpStatus": [401, 408, 409, 429, 500, 502, 503, 504]
      },
      "apiKeyEnvNames": ["IMAGE_GEMINI_API_KEY_1"]
    },
    "seedream": {
      "enabled": true,
      "apiBaseUrl": "https://ark.cn-beijing.volces.com/api/v3",
      "defaultModel": "doubao-seedream-4.5",
      "timeoutMs": 120000,
      "retryPolicy": {
        "maxAttempts": 2,
        "retryableHttpStatus": [401, 408, 409, 429, 500, 502, 503, 504]
      },
      "apiKeyEnvNames": ["IMAGE_SEEDREAM_API_KEY_1"]
    },
    "qwen": {
      "enabled": true,
      "apiBaseUrl": "https://dashscope.aliyuncs.com/api/v1",
      "defaultModel": "qwen-image-2.0-pro",
      "timeoutMs": 120000,
      "retryPolicy": {
        "maxAttempts": 2,
        "retryableHttpStatus": [401, 408, 409, 429, 500, 502, 503, 504]
      },
      "apiKeyEnvNames": ["IMAGE_QWEN_API_KEY_1"]
    },
    "minimax": {
      "enabled": true,
      "apiBaseUrl": "https://api.minimax.io/v1",
      "defaultModel": "image-01",
      "timeoutMs": 120000,
      "retryPolicy": {
        "maxAttempts": 2,
        "retryableHttpStatus": [401, 408, 409, 429, 500, 502, 503, 504]
      },
      "apiKeyEnvNames": ["IMAGE_MINIMAX_API_KEY_1"]
    }
  }
}
`,
    envExample: `# Copy this file to .env and fill in your keys.
IMAGE_OPENAI_API_KEY_1=
IMAGE_OPENAI_API_KEY_2=
IMAGE_GEMINI_API_KEY_1=
IMAGE_SEEDREAM_API_KEY_1=
IMAGE_QWEN_API_KEY_1=
IMAGE_MINIMAX_API_KEY_1=
`,
    gitignore: `.env
`
  };
}
