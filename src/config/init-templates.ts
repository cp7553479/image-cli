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

export type ConfigTemplateOptions = {
  /**
   * Volcengine provider base URL written into config.json.
   * Defaults to the standard Ark `api` endpoint.
   */
  volcengineBaseUrl?: string;
  /**
   * Bailian provider base URL written into config.json.
   * Defaults to a placeholder until a workspaceId is provided.
   */
  bailianBaseUrl?: string;
};

/** Volcengine Ark standard API endpoint. */
export const VOLCENGINE_API_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";

/** Volcengine Ark Agent Plan endpoint. */
export const VOLCENGINE_AGENT_PLAN_BASE_URL = "https://ark.cn-beijing.volces.com/api/plan/v3";

/**
 * Bailian base URL template. The workspaceId is per-account and must be filled
 * at init time (or edited into config.json afterwards).
 *   https://{workspaceId}.cn-beijing.maas.aliyuncs.com/api/v1
 */
export const BAILIAN_WORKSPACE_HOST_SUFFIX = ".cn-beijing.maas.aliyuncs.com/api/v1";

/** Placeholder used when no workspaceId is known (non-interactive init). */
export const BAILIAN_DEFAULT_BASE_URL = `https://YOUR_WORKSPACE_ID${BAILIAN_WORKSPACE_HOST_SUFFIX}`;

const VOLCENGINE_BASE_URL_SENTINEL = "__VOLCENGINE_BASE_URL__";
const BAILIAN_BASE_URL_SENTINEL = "__BAILIAN_BASE_URL__";

/** Builds the workspace-specific Bailian base URL from a workspaceId. */
export function bailianBaseUrlFromWorkspaceId(workspaceId: string): string {
  return `https://${workspaceId}${BAILIAN_WORKSPACE_HOST_SUFFIX}`;
}

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
    "volcengine": {
      "enabled": true,
      "apiBaseUrl": "__VOLCENGINE_BASE_URL__",
      "timeoutMs": 120000,
      "retryPolicy": {
        "maxAttempts": 2
      },
      "api_key": ["YOUR_VOLCENGINE_API_KEY"]
    },
    "bailian": {
      "enabled": true,
      "apiBaseUrl": "__BAILIAN_BASE_URL__",
      "timeoutMs": 120000,
      "retryPolicy": {
        "maxAttempts": 2
      },
      "api_key": ["YOUR_DASHSCOPE_API_KEY"]
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
// volcengine supports two apiBaseUrl endpoints:
//   api        -> https://ark.cn-beijing.volces.com/api/v3
//   agent plan -> https://ark.cn-beijing.volces.com/api/plan/v3
// bailian apiBaseUrl is workspace-specific:
//   https://{workspaceId}.cn-beijing.maas.aliyuncs.com/api/v1
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

Common flags (values are passed through to the provider as-is, without CLI-side validation):

- \`--size <value>\` (e.g. auto, 1024x1024, 2K)
- \`--n <count>\`
- \`--quality <value>\`
- \`--background <value>\`
- \`--output-format <value>\` (e.g. png, jpeg, webp)
- \`--output-compression <value>\`
- \`--moderation <value>\`
- \`--response-format <value>\` (e.g. url, b64_json)
- \`--stream\`
- \`--partial-images <count>\`
- \`--style <value>\`
- \`--user <id>\`
- \`--reference-image <path|url>\` (repeatable; image-to-image / edit)
- \`--mask <path|url>\` (transparent areas are editable)
- \`--input-fidelity <value>\` (fidelity to reference image, gpt-image)
- \`--extra <json object>\`
- \`--output-dir <path>\`
- \`--json\`

\`--reference-image\` enables image-to-image generation. Pass it multiple times
to fuse several reference images. Each provider adapts the reference images to
its native API. Downloaded reference images are cached under \`~/.image/.temp/\`.

\`--extra\` is for provider-specific options beyond the OpenAI-compatible fields.
It must be a JSON object. It is merged into the request before standard fields,
so an explicit flag always takes precedence over a value in \`--extra\`.

The CLI does not validate flag values; everything is passed through to the
provider. Provider-specific option support is decided by the remote provider
response.

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
- \`doubao-seedream\` -> \`volcengine\`
- \`dashscope\` -> \`bailian\`
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
 *
 * `config.json` uses the resolved Volcengine base URL (chosen at init time).
 * `config.example.jsonc` always shows the standard `api` endpoint with a note
 * about the Agent Plan alternative, so the example stays stable reference.
 */
export function buildConfigTemplates(options: ConfigTemplateOptions = {}): ConfigTemplates {
  const volcengineBaseUrl = options.volcengineBaseUrl ?? VOLCENGINE_API_BASE_URL;
  const bailianBaseUrl = options.bailianBaseUrl ?? BAILIAN_DEFAULT_BASE_URL;
  return {
    config: CONFIG_JSON
      .replaceAll(VOLCENGINE_BASE_URL_SENTINEL, volcengineBaseUrl)
      .replaceAll(BAILIAN_BASE_URL_SENTINEL, bailianBaseUrl),
    configExample: CONFIG_EXAMPLE_JSONC
      .replaceAll(VOLCENGINE_BASE_URL_SENTINEL, VOLCENGINE_API_BASE_URL)
      .replaceAll(BAILIAN_BASE_URL_SENTINEL, BAILIAN_DEFAULT_BASE_URL),
    readme: CONFIG_README,
    skill: SKILL_MD,
    skillReadme: SKILL_README
  };
}

/**
 * listConfigInitTemplateFiles 的导出入口。
 */
export function listConfigInitTemplateFiles(options: ConfigTemplateOptions = {}): InitTemplateFile[] {
  const templates = buildConfigTemplates(options);
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
