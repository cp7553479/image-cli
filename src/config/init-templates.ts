export type ConfigTemplates = {
  config: string;
  configExample: string;
  readme: string;
  skill: string;
  skillReadme: string;
};

export type InitTemplateFile = {
  relativePath: string;
  contents: string;
};

const CONFIG_JSON = `{
  "version": 1,
  "defaultModel": "openai/gpt-image-1.5",
  "providers": {
    "openai": {
      "enabled": true,
      "apiBaseUrl": "https://api.openai.com/v1",
      "timeoutMs": 120000,
      "retryPolicy": {
        "maxAttempts": 2
      },
      "api_key": ["YOUR_OPENAI_API_KEY"]
    },
    "openrouter": {
      "enabled": true,
      "apiBaseUrl": "https://openrouter.ai/api/v1",
      "timeoutMs": 120000,
      "retryPolicy": {
        "maxAttempts": 2
      },
      "api_key": ["YOUR_OPENROUTER_API_KEY"]
    },
    "gemini": {
      "enabled": true,
      "apiBaseUrl": "https://generativelanguage.googleapis.com/v1beta",
      "timeoutMs": 120000,
      "retryPolicy": {
        "maxAttempts": 2
      },
      "api_key": ["YOUR_GEMINI_API_KEY"]
    },
    "seedream": {
      "enabled": true,
      "apiBaseUrl": "https://ark.cn-beijing.volces.com/api/v3",
      "timeoutMs": 120000,
      "retryPolicy": {
        "maxAttempts": 2
      },
      "api_key": ["YOUR_SEEDREAM_API_KEY"]
    },
    "qwen": {
      "enabled": true,
      "apiBaseUrl": "https://dashscope.aliyuncs.com/api/v1",
      "timeoutMs": 120000,
      "retryPolicy": {
        "maxAttempts": 2
      },
      "api_key": ["YOUR_QWEN_API_KEY"]
    },
    "minimax": {
      "enabled": true,
      "apiBaseUrl": "https://api.minimax.io/v1",
      "timeoutMs": 120000,
      "retryPolicy": {
        "maxAttempts": 2
      },
      "api_key": ["YOUR_MINIMAX_API_KEY"]
    }
  }
}
`;

const CONFIG_EXAMPLE_JSONC = `// Copy this file to config.json and remove comments.
${CONFIG_JSON}`;

const CONFIG_README = `# ~/.image

This directory stores local configuration for the \`image\` CLI.

- \`config.json\`: your active provider configuration, including top-level \`defaultModel\` and per-provider \`api_key\`
- \`config.example.jsonc\`: commented template for reference
- \`skills/image-cli/\`: local skill copy for shared image tooling

Quick start:

1. Copy the structure from \`config.example.jsonc\` into \`config.json\` if needed.
2. Set top-level \`defaultModel\` to \`provider/modelid\`.
3. Fill each provider's \`api_key\` directly in \`config.json\`. It can be a string or an ordered array of strings.
4. Run \`image config doctor\` to verify the setup.
5. Run \`image provider list\` to inspect configured providers.
6. Run \`image provider <provider-id> model list\` to inspect available or built-in fallback model ids.

Notes:

- \`image config init\` does not overwrite existing managed files.
- \`image config init\` fills in any missing managed files under \`~/.image\` and the installed skill directories.
- \`image config init\` installs the bundled \`image-cli\` skill under \`~/.image/skills\`, \`~/.claude/skills\`, \`~/.agents/skills\`, \`~/.codex/skills\`, and \`~/antigravity/skills\`.
- Use \`image config init --force\` to overwrite existing managed files.
- Model-list fallback output includes an English warning when built-in model ids may be incomplete or outdated.
`;

const SKILL_MD = `---
name: image-cli
description: Use when an agent needs to generate images through the local \`image\` CLI, inspect available providers, or initialize \`~/.image\` config.
---

# Image CLI

Use the local \`image\` command.

\`api_key\` can be either a single string or an ordered array of credential strings.

If this skill is missing or unavailable, read \`README.md\` in the same directory.

Useful checks when generation fails or routing is unclear:

\`\`\`bash
image config show --json
image config doctor --json
image provider list
image provider <provider-id> model list
\`\`\`

## Generate

Basic form:

\`\`\`bash
image generate "<prompt>" --model provider/model
\`\`\`

Common flags:

- \`--size auto|WIDTHxHEIGHT\`
- \`--n <count>\`
- \`--quality <value>\`
- \`--background auto|opaque|transparent\`
- \`--output-format png|jpeg|webp\`
- \`--output-compression <0-100>\`
- \`--moderation auto|low\`
- \`--response-format url|b64_json\`
- \`--stream\`
- \`--partial-images <count>\`
- \`--style vivid|natural\`
- \`--user <id>\`
- \`--reference-image <path|url>\` (repeatable; image-to-image / edit)
- \`--mask <path|url>\` (transparent areas are editable)
- \`--input-fidelity <low|high>\` (gpt-image fidelity to reference image)
- \`--extra <json object>\`
- \`--output-dir <path>\`
- \`--json\`

\`--reference-image\` enables image-to-image generation. Pass it multiple times
to fuse several reference images. Each provider adapts the reference images to
its native API. Downloaded reference images are cached under \`~/.image/.temp/\`.

\`--extra\` is for provider-specific options beyond the OpenAI-compatible fields.
It must be a JSON object and cannot override standard fields.

The CLI validates only the common request shape. Provider-specific option
support is decided by the remote provider response.

\`\`\`bash
image generate "Editorial portrait with dramatic rim light" --model openai/gpt-image-1.5 --size 1536x1024 --output-format png --response-format b64_json
\`\`\`

Image-to-image example:

\`\`\`bash
image generate "add a knitted hat" --model openai/gpt-image-1.5 --reference-image ./portrait.png --mask ./mask.png --input-fidelity high
\`\`\`

## Provider Discovery

\`\`\`bash
image provider list
image provider openai model list
\`\`\`

Model-list output prefers provider APIs when supported. Built-in model-list output includes an English warning when model ids may be incomplete or outdated.

## Provider Aliases

- \`chatgpt-image\` -> \`openai\`
- \`openrouter-image\` -> \`openrouter\`
- \`nano-banana\` -> \`gemini\`
- \`doubao-seedream\` -> \`seedream\`
- \`qwen-image\` -> \`qwen\`
- \`minimax-image\` -> \`minimax\`
`;

const SKILL_README = `# image-cli skill install

Use this file only when the skill is missing or the agent cannot find it.

Expected locations:

- \`~/.image/skills/image-cli/\`
- \`~/.claude/skills/image-cli/\`
- \`~/.agents/skills/image-cli/\`
- \`~/.codex/skills/image-cli/\`
- \`~/antigravity/skills/image-cli/\`

Install or repair:

\`\`\`bash
image config init
\`\`\`

Overwrite managed files:

\`\`\`bash
image config init --force
\`\`\`

Then verify:

\`\`\`bash
image config path
\`\`\`

If the CLI itself is missing, install it first:

\`\`\`bash
npm install -g @cp7553479/image-cli
\`\`\`
`;

/**
 * buildConfigTemplates 的导出入口。
 */
export function buildConfigTemplates(): ConfigTemplates {
  return {
    config: CONFIG_JSON,
    configExample: CONFIG_EXAMPLE_JSONC,
    readme: CONFIG_README,
    skill: SKILL_MD,
    skillReadme: SKILL_README
  };
}

/**
 * listConfigInitTemplateFiles 的导出入口。
 */
export function listConfigInitTemplateFiles(): InitTemplateFile[] {
  const templates = buildConfigTemplates();
  return [
    { relativePath: "config.example.jsonc", contents: templates.configExample },
    { relativePath: "config.json", contents: templates.config },
    { relativePath: "README.md", contents: templates.readme },
    { relativePath: "skills/image-cli/README.md", contents: templates.skillReadme },
    { relativePath: "skills/image-cli/SKILL.md", contents: templates.skill }
  ];
}

/**
 * listSkillInitTemplateFiles 的导出入口。
 */
export function listSkillInitTemplateFiles(): InitTemplateFile[] {
  const templates = buildConfigTemplates();
  return [
    { relativePath: "README.md", contents: templates.skillReadme },
    { relativePath: "SKILL.md", contents: templates.skill }
  ];
}
