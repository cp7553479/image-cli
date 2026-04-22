# Image CLI v1 Spec

## Goal

Provide a single CLI, `image`, that gives agents a stable interface for image generation across multiple providers with unified configuration, unified semantics, and provider-specific extensibility.

v1 ships:

- `image generate`
- `image config init`
- `image config path`
- `image config show`
- `image config doctor`
- `image config providers`

v1 does not expose `image edit`, but the protocol and plugin system reserve it.

## Design Principles

- Protocol layer owns user-facing semantics and validation.
- Provider plugins own HTTP mapping and response parsing.
- Secrets never live in JSON config.
- `curl` is the transport boundary; no official provider SDKs.
- The CLI must fail early on invalid normalized input before provider transport.
- Provider-specific power is available through `--extra`, but `--extra` cannot override protocol-owned fields.

## CLI Grammar

### Root

```bash
image --help
image generate <prompt> [options]
image config <subcommand> [options]
```

### Generate

```bash
image generate "prompt" \
  --model provider_id/model_id \
  [--size 2k|4k|WIDTHxHEIGHT] \
  [--aspect 1:1|4:3|3:4|16:9|9:16|3:2|2:3|21:9] \
  [--n COUNT] \
  [--image PATH_OR_URL ...] \
  [--quality VALUE] \
  [--format png|jpeg|webp] \
  [--background auto|opaque|transparent] \
  [--negative-prompt TEXT] \
  [--seed INTEGER] \
  [--stream] \
  [--output-dir PATH] \
  [--json] \
  [--extra JSON_OBJECT]
```

### Config

```bash
image config init
image config path
image config show [--json]
image config doctor [--json]
image config providers [--json]
```

## Normalized Generate Request

```ts
type GenerateRequest = {
  prompt: string;
  model: ModelRef;
  size?: SizeInput;
  normalizedSize?: NormalizedSize;
  aspectRatio?: AspectRatio;
  count?: number;
  images?: ImageInput[];
  quality?: string;
  outputFormat?: "png" | "jpeg" | "webp";
  background?: "auto" | "opaque" | "transparent";
  negativePrompt?: string;
  seed?: number;
  stream?: boolean;
  outputDir?: string;
  json?: boolean;
  extra?: Record<string, unknown>;
};
```

Reserved for future:

```ts
type EditRequest = {
  model: ModelRef;
  prompt: string;
  images: ImageInput[];
  mask?: ImageInput;
  size?: SizeInput;
  aspectRatio?: AspectRatio;
  extra?: Record<string, unknown>;
};
```

## Model Reference

`--model` must parse as `provider_id/model_id`.

Canonical provider IDs:

- `openai`
- `gemini`
- `seedream`
- `qwen`
- `minimax`

Accepted provider aliases:

- `chatgpt-image` -> `openai`
- `nano-banana` -> `gemini`
- `qwen-image` -> `qwen`
- `minimax-image` -> `minimax`

Alias resolution only applies to the provider segment. The model segment is passed through unchanged.

## Size Semantics

Accepted raw size forms:

- semantic preset: `2k`, `4k`
- explicit dimensions: `WIDTHxHEIGHT`

Accepted aspect values:

- `1:1`
- `4:3`
- `3:4`
- `16:9`
- `9:16`
- `3:2`
- `2:3`
- `21:9`

Normalization rules:

- `WIDTHxHEIGHT` wins over preset-derived dimensions.
- `--aspect` may refine preset sizes.
- If `--size` is explicit dimensions and `--aspect` disagrees, fail before transport.
- If a provider does not support the normalized result, the plugin returns a capability error with the provider name and supported values.

Preset defaults:

- `2k`:
  - `1:1` -> `2048x2048`
  - `4:3` -> `2304x1728`
  - `3:4` -> `1728x2304`
  - `16:9` -> `2848x1600`
  - `9:16` -> `1600x2848`
  - `3:2` -> `2496x1664`
  - `2:3` -> `1664x2496`
  - `21:9` -> `3136x1344`
- `4k`:
  - `1:1` -> `4096x4096`
  - `4:3` -> `4096x3072`
  - `3:4` -> `3072x4096`
  - `16:9` -> `4096x2304`
  - `9:16` -> `2304x4096`
  - `3:2` -> `4096x2736`
  - `2:3` -> `2736x4096`
  - `21:9` -> `4096x1752`

If a preset is provided without `--aspect`, default to `1:1`.

## Provider Capability Model

```ts
type ProviderCapabilities = {
  generate: boolean;
  edit: boolean;
  inputImages: boolean;
  asyncTasks: boolean;
  streaming: boolean;
  background: boolean;
  negativePrompt: boolean;
  multipleOutputs: boolean;
  transparentOutput: boolean;
};
```

v1 capability expectations:

- OpenAI: generate yes, edit yes, input images yes, async tasks no, streaming yes
- Gemini: generate yes, edit yes, input images yes, async tasks yes via batch only, streaming no for v1 transport
- Seedream: generate yes, edit model family yes, input images yes, async tasks no, streaming yes
- Qwen: generate yes, edit yes, input images yes, async tasks yes
- MiniMax: generate yes, edit via same endpoint surface, input images yes, async tasks no

Public CLI gating:

- v1 only exposes `generate`, even when plugin capability includes `edit`.

## Provider Plugin Contract

```ts
type ProviderPlugin = {
  providerId: CanonicalProviderId;
  aliases: string[];
  capabilities: ProviderCapabilities;
  buildGenerateOperation(input: ProviderGenerateContext): ProviderOperation;
  buildEditOperation?(input: ProviderEditContext): ProviderOperation;
  parseGenerateResponse(result: CurlExecutionResult, input: ProviderGenerateContext): Promise<GenerateResult>;
  classifyFailure(error: ProviderErrorContext): FailureClassification;
};
```

Rules:

- Plugins may only consume normalized protocol input plus provider config.
- Plugins may add provider-native fields from `extra`.
- Plugins may not reinterpret protocol-owned fields with different semantics.
- Plugins must classify failures into retryable auth/quota, retryable transport, non-retryable request, or unknown.

## `--extra` Rules

- `--extra` must parse as a JSON object.
- Arrays, scalars, and invalid JSON are rejected.
- Keys matching normalized protocol fields are rejected.
- The rejection happens before provider invocation.
- Providers may define a whitelist or passthrough mapping for extra fields.

Reserved protocol-owned keys:

- `prompt`
- `model`
- `size`
- `normalizedSize`
- `aspectRatio`
- `count`
- `images`
- `quality`
- `outputFormat`
- `background`
- `negativePrompt`
- `seed`
- `stream`
- `outputDir`
- `json`
- `extra`

## Output Contract

Default output directory:

- `./image-output/<timestamp>/`

Rules:

- The runtime saves any returned image bytes or downloaded image URLs into the output directory.
- Normal mode prints absolute output paths and a compact summary.
- `--json` prints a machine-readable manifest to stdout.
- The manifest includes provider id, model id, output files, provider response metadata, and warnings.
- If a provider returns temporary URLs, the manifest must include an expiry warning.

## Config Layout

Root config directory:

- `~/.image/`

Files:

- `~/.image/config.json`
- `~/.image/.env`
- `~/.image/config.example.jsonc`
- `~/.image/.env.example`
- `~/.image/.gitignore`

### `config.json`

Strict JSON only.

```json
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
    }
  }
}
```

### `.env`

Contains only secrets and secret-like runtime overrides.

Example:

```dotenv
IMAGE_OPENAI_API_KEY_1=
IMAGE_OPENAI_API_KEY_2=
IMAGE_GEMINI_API_KEY_1=
```

Precedence:

1. current process environment
2. `~/.image/.env`
3. no secret -> configuration error

## Credential Rotation

Per provider:

- load `apiKeyEnvNames[]`
- resolve each env var into a credential candidate
- attempt in listed order
- rotate to next key only on classified retryable credential failures

Retryable credential failures:

- invalid or revoked key
- exhausted quota or insufficient balance
- rate limit
- transient auth rejection

Do not rotate on:

- invalid request body
- unsupported model
- invalid image input
- malformed `--extra`

Rotation state is per invocation only and never persisted.

## Transport

Shared transport requirements:

- build `curl` argv arrays, never shell-concatenated command strings
- support JSON bodies
- support multipart file uploads
- support streamed response capture
- support explicit timeout
- capture exit code, stdout, stderr, and response headers
- preserve provider request id headers when available

## Initial Provider Mapping Rules

### OpenAI

- endpoint: `POST /images/generations`
- optional future edit endpoint: `POST /images/edits`
- auth header: `Authorization: Bearer`

### Gemini

- native endpoint: `POST /models/{model}:generateContent`
- auth header: `x-goog-api-key`
- treat Nano Banana aliases as Gemini models

### Seedream

- endpoint: `POST /images/generations`
- auth header: `Authorization: Bearer`
- support provider extra for sequential generation controls

### Qwen

- sync generate/edit endpoint: `POST /services/aigc/multimodal-generation/generation`
- async generate endpoint: `POST /services/aigc/text2image/image-synthesis`
- poll endpoint: `GET /tasks/{task_id}`

### MiniMax

- endpoint: `POST /image_generation`
- auth header: `Authorization: Bearer`
- support reference-image flow through provider-native fields

## Error Model

Runtime error categories:

- `ConfigError`
- `ValidationError`
- `ProviderCapabilityError`
- `ProviderRequestError`
- `ProviderAuthError`
- `ProviderRateLimitError`
- `ProviderQuotaError`
- `TransportError`

Each user-facing error must include:

- category
- provider when known
- summary
- actionable hint

## Test Requirements

All tests live under `test/`.

Minimum coverage targets:

- CLI parsing and help text snapshots
- model alias resolution
- size normalization and conflicts
- `--extra` validation
- config loading and env precedence
- transport JSON and multipart construction
- failover rotation behavior
- per-provider request building
- per-provider response parsing
- Qwen async polling
- output directory and manifest generation

## Docs And Skill

Required docs:

- `README.md`
- `SPEC.md`
- generated CLI help text through the CLI implementation
- `.agents/skills/image-cli/SKILL.md`

Skill requirements:

- explain how to configure providers
- explain `image generate`
- explain `image config` subcommands
- explain `--extra`
- keep wording concise and usage-focused

