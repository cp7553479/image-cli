# `@cp7553479/image-cli`

Unified image generation CLI for agents and scripts.

It gives one command surface, `image`, across these providers:

- OpenAI / ChatGPT Image
- Gemini / Nano Banana
- Volcengine Seedream
- Qwen Image
- MiniMax Image

The CLI normalizes common flags like `--model`, `--size`, `--aspect`, `--image`, and `--extra`, then maps them to provider-native HTTP requests through internal provider plugins.

## Install

```bash
npm install -g @cp7553479/image-cli
```

## Quick Start

1. Initialize config files:

```bash
image config init
```

2. Edit `~/.image/.env` and add your API keys.

3. Edit `~/.image/config.json` and set provider defaults if needed.

4. Generate an image:

```bash
image generate "A cinematic poster of a red fox in snowfall" \
  --model openai/chatgpt-image-latest \
  --size 2k \
  --aspect 16:9
```

Generated files are saved under `./image-output/<timestamp>/` unless you pass `--output-dir`.

## Commands

### `image generate`

```bash
image generate <prompt> \
  --model <provider>/<model> \
  [--size 2k|4k|WIDTHxHEIGHT] \
  [--aspect 1:1|4:3|3:4|16:9|9:16|3:2|2:3|21:9] \
  [--n COUNT] \
  [--image PATH_OR_URL] \
  [--quality VALUE] \
  [--format png|jpeg|webp] \
  [--background auto|opaque|transparent] \
  [--negative-prompt TEXT] \
  [--seed INTEGER] \
  [--stream] \
  [--output-dir PATH] \
  [--json] \
  [--extra JSON]
```

Examples:

```bash
image generate "Studio product photo of a ceramic mug" \
  --model seedream/doubao-seedream-4.5 \
  --size 2k \
  --extra '{"watermark":false}'
```

```bash
image generate "Turn this into a glossy campaign visual" \
  --model gemini/gemini-2.5-flash-image \
  --image ./reference.png \
  --aspect 3:4
```

```bash
image generate "Minimal logo on white background" \
  --model minimax/image-01 \
  --size 1024x1024 \
  --json
```

### `image config`

```bash
image config init
image config path
image config show [--json]
image config doctor [--json]
image config providers [--json]
```

Useful commands:

```bash
image config path
image config show --json
image config doctor --json
image config providers
```

## Configuration

The CLI uses `~/.image/`:

- `config.json`: strict JSON runtime config
- `.env`: secret values
- `config.example.jsonc`: commented template
- `.env.example`: key template
- `.gitignore`: ignores `.env`

### `config.json`

This file stores non-secret config only:

- `enabled`
- `apiBaseUrl`
- `defaultModel`
- `timeoutMs`
- `retryPolicy`
- `apiKeyEnvNames`

### `.env`

Secrets live here:

```dotenv
IMAGE_OPENAI_API_KEY_1=
IMAGE_OPENAI_API_KEY_2=
IMAGE_GEMINI_API_KEY_1=
IMAGE_SEEDREAM_API_KEY_1=
IMAGE_QWEN_API_KEY_1=
IMAGE_MINIMAX_API_KEY_1=
```

When one key for the same provider fails with a retryable credential error, the CLI automatically tries the next key listed in `apiKeyEnvNames`.

## Model Syntax

Use `provider/model`:

- `openai/chatgpt-image-latest`
- `gemini/gemini-2.5-flash-image`
- `seedream/doubao-seedream-4.5`
- `qwen/qwen-image-2.0-pro`
- `minimax/image-01`

Friendly provider aliases also work:

- `chatgpt-image/...`
- `nano-banana/...`
- `qwen-image/...`
- `minimax-image/...`

## `--extra`

`--extra` is for provider-only parameters that are not part of the normalized protocol.

Examples:

```bash
--extra '{"watermark":false}'
--extra '{"prompt_optimizer":true}'
--extra '{"response_format":"base64"}'
```

`--extra` must be a JSON object. It cannot override normalized fields like `prompt`, `model`, `size`, `images`, or `seed`.

## Notes

- v1 exposes `generate` and `config`.
- Internal provider capability models already reserve future edit support.
- The transport layer uses `curl`, not provider SDKs.

## Development

```bash
npm install
npm run check
npm test
npm run build
```
