# Image-Cli: An agent-native image tool

[中文说明 / README_CN](./README_CN.md)

`image` is a local multi-provider image generation CLI.

It standardizes:

- command surface
- config layout
- provider routing
- output saving
- provider-specific escape hatches through `--extra`

Built-in providers:

- OpenAI
- OpenRouter
- Gemini
- Seedream
- Qwen
- MiniMax

It also supports custom providers installed under `~/.image/plugins/`.

## Install

```bash
npm install -g @cp7553479/image-cli
```

Verify installation:

```bash
image --help
image generate --help
image config --help
```

## Quick Start

1. Initialize local config:

```bash
image config init
```

2. Open [`~/.image/config.json`](/Users/vincent/.image/config.json).

3. Set the top-level `defaultModel` in `provider/modelid` form.

4. Fill each provider's `api_key`.

5. Verify configuration:

```bash
image config doctor --json
```

6. Generate:

```bash
image generate "A cinematic fox poster in snowfall"
```

If `--model` is omitted, the CLI uses `config.defaultModel`.

## Command Reference

### `image`

Root command.

It exposes:

- `image generate <prompt>`
- `image config init`
- `image config path`
- `image config show`
- `image config doctor`
- `image config providers`

The root help is intentionally concise.
Use `image generate --help` and `image config --help` for full command details.

### `image generate`

Usage:

```bash
image generate "<prompt>" [flags]
```

Arguments:

- `<prompt>`
  Required.
  The generation prompt text.

Flags:

- `--model <provider/model>`
  Optional if `config.defaultModel` is set.
  Explicitly chooses the provider and the provider-native model id.

- `--size <preset|WIDTHxHEIGHT>`
  Optional.
  Normalized size input.
  Supported presets:
  - `2k`
  - `4k`
  Explicit dimensions example:
  - `1536x1024`

- `--aspect <ratio>`
  Optional.
  Normalized aspect ratio.
  Supported values:
  - `1:1`
  - `4:3`
  - `3:4`
  - `16:9`
  - `9:16`
  - `3:2`
  - `2:3`
  - `21:9`

- `--n <count>`
  Optional.
  Requested output count.
  Provider support differs; some providers clamp or ignore it.

- `--image <pathOrUrl>`
  Optional and repeatable.
  Reference image input.
  Can be:
  - a local file path
  - an HTTP/HTTPS URL

- `--quality <value>`
  Optional.
  Provider-native quality hint.
  Not normalized across all providers.

- `--format <png|jpeg|webp>`
  Optional.
  Preferred output format when the provider supports it.

- `--background <auto|opaque|transparent>`
  Optional.
  Provider-native background mode.
  Most relevant for OpenAI-style image APIs.

- `--seed <integer>`
  Optional.
  Deterministic seed when the provider supports it.

- `--stream`
  Optional.
  Enables provider streaming when supported.

- `--output-dir <path>`
  Optional.
  Directory where generated files and `manifest.json` are written.
  Default:

  ```text
  ./image-output/<timestamp>/
  ```

- `--json`
  Optional.
  Prints the output manifest as JSON instead of plain text.

- `--extra <json>`
  Optional.
  Provider-specific JSON object for features that are not normalized by the CLI.

### `--extra`

Use `--extra` for provider-only parameters.

Examples:

```bash
--extra '{"watermark":false}'
--extra '{"response_format":"base64"}'
--extra '{"prompt_optimizer":true}'
```

Rules:

- must be a JSON object
- cannot override normalized fields such as `prompt`, `model`, `size`, `images`, or `seed`
- should be used for provider-only features that do not exist consistently across providers

## Is `negative_prompt` a universal CLI flag?

No.

It is not exposed as a top-level normalized flag because official provider support is not consistent.

Provider status from official docs:

- OpenAI Images API: no documented `negative_prompt`
  - [OpenAI Image Generation](https://platform.openai.com/docs/guides/images/image-generation)
- Gemini native image generation: no documented `negative_prompt`
  - [Gemini Image Generation](https://ai.google.dev/gemini-api/docs/image-generation)
- Seedream / Ark image generation: no documented normalized `negative_prompt`
  - [Seedream Image Generation](https://www.volcengine.com/docs/82379/1541523)
- MiniMax image generation: no documented `negative_prompt`
  - [MiniMax Text to Image](https://platform.minimax.io/docs/api-reference/image-generation-t2i)
- Qwen Image: official docs do document `negative_prompt`
  - [Qwen Image API](https://help.aliyun.com/zh/model-studio/qwen-image-api)
  - [Qwen Image Edit API](https://help.aliyun.com/zh/model-studio/qwen-image-edit-api)
- OpenRouter image generation: no guaranteed universal top-level `negative_prompt` contract across routed models
  - [OpenRouter Image Generation](https://openrouter.ai/docs/guides/overview/multimodal/image-generation)

If you need `negative_prompt` for a provider that officially supports it, pass it through `--extra`.

Example for Qwen:

```bash
image generate "A clean drink poster" \
  --model qwen/qwen-image-2.0-pro \
  --extra '{"negative_prompt":"low quality, blurry, distorted text"}'
```

### `image config init`

Initializes `~/.image/`.

Behavior:

- creates `config.json` if missing
- creates `config.example.jsonc` if missing
- always refreshes `README.md`
- does not overwrite `config.json` unless `--force` is used
- does not overwrite `config.example.jsonc` unless `--force` is used

Flags:

- `--force`
  Overwrite `~/.image/config.json` and `~/.image/config.example.jsonc`.

### `image config path`

Prints the paths used by the CLI under `~/.image/`.

No flags.

### `image config show`

Prints sanitized resolved config.

Flags:

- `--json`
  Print JSON output.

What it shows:

- top-level `defaultModel`
- per-provider enablement
- base URLs
- timeout and retry settings
- whether `api_key` is present

What it does not show:

- raw secrets

### `image config doctor`

Runs diagnostics.

Flags:

- `--json`
  Print JSON output.

Checks include:

- config file existence
- README existence
- `curl` availability
- per-provider credential counts

### `image config providers`

Lists built-in providers and installed plugin providers.

Flags:

- `--json`
  Print JSON output.

## Configuration Layout

The CLI uses:

- [`~/.image/config.json`](/Users/vincent/.image/config.json)
- [`~/.image/config.example.jsonc`](/Users/vincent/.image/config.example.jsonc)
- [`~/.image/README.md`](/Users/vincent/.image/README.md)
- `~/.image/plugins/<plugin-name>/plugin.json`

## `config.json`

Top-level structure:

```json
{
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
    }
  }
}
```

### Top-level fields

- `version`
  Config schema version.

- `defaultModel`
  Default routing target in `provider/modelid` format.
  This is what the CLI uses when `--model` is omitted.

- `providers`
  Provider config map keyed by provider id.
  This includes both built-in providers and plugin providers.

### Per-provider fields

- `enabled`
- `apiBaseUrl`
- `timeoutMs`
- `retryPolicy.maxAttempts`
- `api_key`

### `api_key`

Supported formats:

Single key:

```json
"api_key": "your-api-key"
```

Ordered failover keys:

```json
"api_key": ["your-api-key-1", "your-api-key-2"]
```

If an array is provided, the CLI tries the keys in order for same-provider failover.

## Built-in Provider Defaults

Template defaults:

- `defaultModel`: `openai/gpt-image-1.5`
- `openai`: `https://api.openai.com/v1`
- `openrouter`: `https://openrouter.ai/api/v1`
- `gemini`: `https://generativelanguage.googleapis.com/v1beta`
- `seedream`: `https://ark.cn-beijing.volces.com/api/v3`
- `qwen`: `https://dashscope.aliyuncs.com/api/v1`
- `minimax`: `https://api.minimax.io/v1`

Seedream note:

- depending on your Ark account/model availability, you may need a versioned model id such as `doubao-seedream-4-5-251128`

## Provider IDs, Docs, and API Key Links

### OpenAI

- Provider id: `openai`
- Alias: `chatgpt-image`
- Docs: [OpenAI Image Generation](https://platform.openai.com/docs/guides/images/image-generation)
- Model docs: [GPT Image 1.5](https://platform.openai.com/docs/models/gpt-image-1.5)
- API keys: [OpenAI API Keys](https://platform.openai.com/api-keys)
- Signup: [OpenAI Platform Signup](https://platform.openai.com/signup)

### OpenRouter

- Provider id: `openrouter`
- Alias: `openrouter-image`
- Docs: [OpenRouter Image Generation](https://openrouter.ai/docs/guides/overview/multimodal/image-generation)
- API reference: [OpenRouter API Reference](https://openrouter.ai/docs/api-reference/overview)
- API keys: [OpenRouter Keys](https://openrouter.ai/settings/keys)
- Signup: [OpenRouter Sign In](https://openrouter.ai/sign-in)

### Gemini

- Provider id: `gemini`
- Alias: `nano-banana`
- Docs: [Gemini Image Generation](https://ai.google.dev/gemini-api/docs/image-generation)
- API key docs: [Gemini API Key Guide](https://ai.google.dev/gemini-api/docs/api-key)
- API keys: [Google AI Studio API Keys](https://aistudio.google.com/apikey)
- API reference: [Gemini API Reference](https://ai.google.dev/api)

### Seedream

- Provider id: `seedream`
- Aliases: `seedream`, `doubao-seedream`
- Docs:
  - [Seedream Image Generation](https://www.volcengine.com/docs/82379/1541523)
  - [Ark Quick Start](https://www.volcengine.com/docs/82379/1399008?lang=zh)
- Console: [Volcengine Ark Console](https://console.volcengine.com/ark)
- API key guidance: [Volcengine Ark API Key Guide](https://www.volcengine.com/docs/6559/2310296)

### Qwen

- Provider id: `qwen`
- Alias: `qwen-image`
- Docs:
  - [Qwen Image API](https://help.aliyun.com/zh/model-studio/qwen-image-api)
  - [Qwen Image Edit API](https://help.aliyun.com/zh/model-studio/qwen-image-edit-api)
- Model catalog: [Alibaba Model Studio Models](https://help.aliyun.com/zh/model-studio/model)
- Console: [Alibaba Model Studio](https://bailian.console.aliyun.com/)

### MiniMax

- Provider id: `minimax`
- Alias: `minimax-image`
- Docs:
  - [MiniMax Image Generation Overview](https://platform.minimax.io/docs/api-reference/image-generation-intro)
  - [MiniMax Text to Image](https://platform.minimax.io/docs/api-reference/image-generation-t2i)
  - [MiniMax Image Generation Guide](https://platform.minimax.io/docs/guides/image-generation)
- Console: [MiniMax Platform](https://platform.minimax.io/)

## Custom Provider Plugins

You only need this section if you want `image` to call a provider that is not built in.

For normal use of built-in providers, skip this section.

### Why does this feature exist?

The CLI keeps one stable user-facing command surface:

- `image generate "<prompt>"`
- `--model provider/modelid`
- `--size`
- `--aspect`
- `--image`
- `--extra`

But every provider has different implementation details:

- auth header format
- request body format
- sync vs async flow
- where image results are returned

The built-in providers solve this internally.

The custom plugin system exists so you can add the same kind of adapter for a provider that is not shipped with the CLI, without changing the CLI itself.

### How should a beginner think about it?

Do not think of a plugin as "extending the whole CLI".

Think of it as only adding one translator layer:

- the CLI already knows how to parse commands, load config, rotate keys, and save output
- the plugin only teaches the CLI how to talk to one extra provider

In practice, that means:

1. you still run the normal `image generate ...` command
2. the provider id still appears in `config.json` and `--model`
3. the plugin only converts between the CLI's normalized request and the provider's real API

### Where does a plugin live?

Custom providers are installed under:

```text
~/.image/plugins/<plugin-name>/
```

Each plugin must contain a registration file:

```text
~/.image/plugins/<plugin-name>/plugin.json
```

### How is a plugin routed?

Once a plugin registers a `providerId`, the CLI routes it exactly like a built-in provider.

The same provider id appears in:

- in `config.defaultModel`
- in `image generate --model <provider/model>`
- in `config.providers.<providerId>`

### What is the minimum mental model?

For a newcomer, this is the shortest accurate explanation:

- `plugin.json` says which provider id the plugin owns
- the plugin script builds the real HTTP request for that provider
- the plugin script parses the provider response back into the CLI's common result format

If you understand those three lines, you understand the plugin system.

### Where is the full developer guide?

For the full explanation, including:

- the beginner-friendly architecture walkthrough
- what `plugin.json` does
- what `build-generate` and `parse-generate` do
- what JSON comes in and out
- common beginner mistakes and questions

- [plugins/PLUGINS_README.md](plugins/PLUGINS_README.md)

## Development

```bash
npm install
npm run check
npm test
npm run build
```
