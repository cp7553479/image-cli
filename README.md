# `@cp7553479/image-cli`

`image` is a local CLI for image generation across multiple providers through one command surface.

It gives you:

- one command for generation: `image generate`
- one config namespace: `image config`
- one config location: `~/.image/`
- one provider/plugin model for OpenAI, OpenRouter, Gemini, Seedream, Qwen, and MiniMax
- one escape hatch for provider-only features: `--extra`

The transport layer uses `curl` directly. No official provider SDK is required.

## Install

Global install from npm:

```bash
npm install -g @cp7553479/image-cli
```

Verify the command:

```bash
image --help
```

## Quick Start

1. Initialize config files:

```bash
image config init
```

2. Open [`~/.image/config.json`](/Users/vincent/.image/config.json) and fill the `api_key` for the providers you want to use.

3. Check your configuration:

```bash
image config doctor --json
```

4. Generate an image:

```bash
image generate "A cinematic fox poster in snowfall" \
  --model openai/gpt-image-1.5 \
  --size 2k \
  --aspect 16:9
```

Generated files are saved under `./image-output/<timestamp>/` unless you pass `--output-dir`.

## Command Overview

Top-level commands:

- `image generate <prompt>`
- `image config init`
- `image config path`
- `image config show`
- `image config doctor`
- `image config providers`

## `image generate`

Usage:

```bash
image generate "<prompt>" --model <provider>/<model> [flags]
```

Required arguments:

- `<prompt>`
  What to generate.
- `--model <provider>/<model>`
  Provider id plus provider-native model id.
  Example: `openai/gpt-image-1.5`

### Generate Flags

- `--size <preset|WIDTHxHEIGHT>`
  Normalized size input.
  Supported presets: `2k`, `4k`
  Explicit size example: `1536x1024`

- `--aspect <ratio>`
  Normalized aspect ratio.
  Supported values: `1:1`, `4:3`, `3:4`, `16:9`, `9:16`, `3:2`, `2:3`, `21:9`

- `--n <count>`
  Number of images requested.
  Some providers support multiple outputs; some clamp to `1`.

- `--image <pathOrUrl>`
  Reference image path or URL.
  Repeat the flag to pass multiple images.
  Example:

  ```bash
  --image ./ref-1.png --image https://example.com/ref-2.jpg
  ```

- `--quality <value>`
  Provider-native quality hint.
  This is not normalized across all providers.

- `--format <png|jpeg|webp>`
  Preferred output format when supported.
  If the provider ignores it, the provider decides the final format.

- `--background <auto|opaque|transparent>`
  Background mode for providers that support it.
  Most useful for OpenAI-style image APIs.

- `--seed <integer>`
  Deterministic seed when supported by the provider.

- `--stream`
  Enable provider streaming when supported.

- `--output-dir <path>`
  Directory where generated assets and `manifest.json` are saved.
  Default:

  ```text
  ./image-output/<timestamp>/
  ```

- `--json`
  Print the output manifest as JSON instead of plain text.

- `--extra <json>`
  Provider-specific JSON object for fields that are not standardized by the CLI.

### `--extra`

Use `--extra` for provider-only parameters.

Examples:

```bash
--extra '{"watermark":false}'
--extra '{"response_format":"base64"}'
--extra '{"prompt_optimizer":true}'
```

Important:

- `--extra` must be a JSON object
- `--extra` cannot override normalized fields like `prompt`, `model`, `size`, `images`, or `seed`
- if a provider exposes a feature that is not a stable cross-provider concept, prefer `--extra`

## Is `--negative-prompt` a universal flag?

No.

The current official docs do not support treating `negative_prompt` as a stable cross-provider parameter:

- OpenAI Images API: no documented `negative_prompt` field in the official image generation guide
  Source: [OpenAI Image Generation](https://platform.openai.com/docs/guides/images/image-generation)
- Gemini native image generation: no documented `negative_prompt` field in the official Gemini image generation docs
  Source: [Gemini Image Generation](https://ai.google.dev/gemini-api/docs/image-generation)
- Seedream / Ark image generation: the official request shape does not document a universal `negative_prompt` field
  Source: [Volcengine Seedream Image Generation](https://www.volcengine.com/docs/82379/1541523)
- MiniMax image generation: the official image generation request does not document `negative_prompt`
  Source: [MiniMax Text to Image](https://platform.minimax.io/docs/api-reference/image-generation-t2i)
- Qwen Image and Qwen Image Edit: official docs do document `negative_prompt`
  Sources:
  [Qwen Image API](https://help.aliyun.com/zh/model-studio/qwen-image-api)
  [Qwen Image Edit API](https://help.aliyun.com/zh/model-studio/qwen-image-edit-api)
- OpenRouter: image generation is routed through a unified chat API, but `negative_prompt` is not a guaranteed top-level standard across image models
  Source: [OpenRouter Image Generation](https://openrouter.ai/docs/guides/overview/multimodal/image-generation)

Because of that, `negative_prompt` is not exposed as a top-level normalized CLI flag.

If you need it for a provider that officially supports it, pass it through `--extra`.

Example for Qwen:

```bash
image generate "A clean drink poster" \
  --model qwen/qwen-image-2.0-pro \
  --extra '{"negative_prompt":"low quality, blurry, distorted text"}'
```

## `image config`

### `image config init`

Create the local config files under `~/.image/`.

Behavior:

- creates `config.json` if it does not already exist
- creates `config.example.jsonc` if it does not already exist
- refreshes `README.md` every time
- does not overwrite an existing `config.json`

### `image config path`

Print the paths used by the CLI.

### `image config show`

Print sanitized resolved config.

What you see:

- provider enablement
- base URLs
- default models
- timeout and retry settings
- whether `api_key` is present

What you do not see:

- raw secrets

### `image config doctor`

Run diagnostics for:

- config file existence
- README existence
- `curl` availability
- per-provider credential counts

### `image config providers`

List the built-in providers, aliases, and descriptions.

## Configuration Layout

The CLI uses:

- [`~/.image/config.json`](/Users/vincent/.image/config.json)
- [`~/.image/config.example.jsonc`](/Users/vincent/.image/config.example.jsonc)
- [`~/.image/README.md`](/Users/vincent/.image/README.md)

### `config.json`

This file stores provider config directly, including `api_key`.

Supported provider fields:

- `enabled`
- `apiBaseUrl`
- `defaultModel`
- `timeoutMs`
- `retryPolicy.maxAttempts`
- `api_key`

`api_key` supports either a single string:

```json
"api_key": "your-api-key"
```

or an ordered array:

```json
"api_key": ["your-api-key-1", "your-api-key-2"]
```

If an array is provided, the CLI uses the keys in order for same-provider failover.

### Template defaults

Current template defaults are:

- `openai`: `gpt-image-1.5`
- `openrouter`: `google/gemini-3.1-flash-image-preview`
- `gemini`: `gemini-3.1-flash-image-preview`
- `seedream`: `doubao-seedream-4.5`
- `qwen`: `qwen-image-2.0-pro`
- `minimax`: `image-01`

Important note for Seedream:

- depending on your Ark endpoint/model availability, you may need a versioned model id such as `doubao-seedream-4-5-251128`

## Provider Table

### OpenAI

- Provider id: `openai`
- Alias: `chatgpt-image`
- Default base URL: `https://api.openai.com/v1`
- Default model in template: `gpt-image-1.5`
- Docs: [OpenAI Image Generation](https://platform.openai.com/docs/guides/images/image-generation)
- API key page: [OpenAI API Keys](https://platform.openai.com/api-keys)
- Signup: [OpenAI Platform Signup](https://platform.openai.com/signup)

### OpenRouter

- Provider id: `openrouter`
- Alias: `openrouter-image`
- Default base URL: `https://openrouter.ai/api/v1`
- Default model in template: `google/gemini-3.1-flash-image-preview`
- Docs: [OpenRouter Image Generation](https://openrouter.ai/docs/guides/overview/multimodal/image-generation)
- API reference: [OpenRouter API Reference](https://openrouter.ai/docs/api-reference/overview)
- API key page: [OpenRouter Keys](https://openrouter.ai/settings/keys)
- Signup: [OpenRouter Sign In / Signup](https://openrouter.ai/sign-in)

### Gemini

- Provider id: `gemini`
- Alias: `nano-banana`
- Default base URL: `https://generativelanguage.googleapis.com/v1beta`
- Default model in template: `gemini-3.1-flash-image-preview`
- Docs: [Gemini Image Generation](https://ai.google.dev/gemini-api/docs/image-generation)
- API key docs: [Using Gemini API Keys](https://ai.google.dev/gemini-api/docs/api-key)
- API key page: [Google AI Studio API Keys](https://aistudio.google.com/apikey)
- API reference: [Gemini API Reference](https://ai.google.dev/api)

### Seedream

- Provider id: `seedream`
- Aliases: `seedream`, `doubao-seedream`
- Default base URL: `https://ark.cn-beijing.volces.com/api/v3`
- Default model in template: `doubao-seedream-4.5`
- Docs:
  [Seedream Image Generation](https://www.volcengine.com/docs/82379/1541523)
  [Ark Quick Start](https://www.volcengine.com/docs/82379/1399008?lang=zh)
- Console: [Volcengine Ark Console](https://console.volcengine.com/ark)
- API key/key-management guidance:
  [Volcengine Ark API Key guidance](https://www.volcengine.com/docs/6559/2310296)

### Qwen

- Provider id: `qwen`
- Alias: `qwen-image`
- Default base URL: `https://dashscope.aliyuncs.com/api/v1`
- Default model in template: `qwen-image-2.0-pro`
- Docs:
  [Qwen Image API](https://help.aliyun.com/zh/model-studio/qwen-image-api)
  [Qwen Image Edit API](https://help.aliyun.com/zh/model-studio/qwen-image-edit-api)
- Model catalog: [Alibaba Model Studio Models](https://help.aliyun.com/zh/model-studio/model)
- Console: [Alibaba Model Studio / DashScope](https://bailian.console.aliyun.com/)

### MiniMax

- Provider id: `minimax`
- Alias: `minimax-image`
- Default base URL: `https://api.minimax.io/v1`
- Default model in template: `image-01`
- Docs:
  [MiniMax Image Generation Overview](https://platform.minimax.io/docs/api-reference/image-generation-intro)
  [MiniMax Text to Image](https://platform.minimax.io/docs/api-reference/image-generation-t2i)
- Guide: [MiniMax Image Generation Guide](https://platform.minimax.io/docs/guides/image-generation)
- Console / platform: [MiniMax Platform](https://platform.minimax.io/)

## Examples

OpenAI:

```bash
image generate "Luxury drink ad, glossy lighting" \
  --model openai/gpt-image-1.5 \
  --size 2k \
  --aspect 16:9 \
  --format png
```

OpenRouter:

```bash
image generate "Futuristic tea brand battle poster" \
  --model openrouter/google/gemini-3.1-flash-image-preview \
  --size 4k \
  --aspect 16:9
```

Gemini:

```bash
image generate "Minimal mascot concept art" \
  --model gemini/gemini-3.1-flash-image-preview \
  --image ./reference.png
```

Seedream:

```bash
image generate "High-energy milk tea war movie poster" \
  --model seedream/doubao-seedream-4-5-251128 \
  --size 2k \
  --aspect 16:9
```

Qwen with provider-specific negative prompt:

```bash
image generate "Clean beverage campaign poster" \
  --model qwen/qwen-image-2.0-pro \
  --extra '{"negative_prompt":"blurry, low quality, distorted text"}'
```

MiniMax:

```bash
image generate "Bright brand key visual" \
  --model minimax/image-01 \
  --aspect 3:4 \
  --extra '{"response_format":"base64"}'
```

## Development

```bash
npm install
npm run check
npm test
npm run build
```
