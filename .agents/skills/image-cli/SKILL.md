---
name: image-cli
description: Use when an agent needs to generate images through the local `image` CLI, inspect available providers, initialize `~/.image` config, or pass provider-specific image options through `--extra`.
---

# Image CLI

Use the local `image` command for image generation through a unified provider interface.

## Initialize

Run this first on a new machine or repo:

```bash
image config init
```

Then fill in `~/.image/.env` and review `~/.image/config.json`.

Useful checks:

```bash
image config path
image config show --json
image config doctor --json
image config providers
```

## Generate

Basic form:

```bash
image generate "<prompt>" --model provider/model
```

Common flags:

- `--size 2k|4k|WIDTHxHEIGHT`
- `--aspect 1:1|4:3|3:4|16:9|9:16|3:2|2:3|21:9`
- `--n <count>`
- `--image <path-or-url>` repeatable
- `--quality <value>`
- `--format png|jpeg|webp`
- `--background auto|opaque|transparent`
- `--negative-prompt "<text>"`
- `--seed <integer>`
- `--stream`
- `--output-dir <path>`
- `--json`
- `--extra '<json object>'`

Examples:

```bash
image generate "Editorial portrait with dramatic rim light" \
  --model openai/chatgpt-image-latest \
  --size 2k \
  --aspect 3:4
```

```bash
image generate "Turn this product reference into a clean launch visual" \
  --model gemini/gemini-2.5-flash-image \
  --image ./reference.png \
  --extra '{"thinkingConfig":{"thinkingLevel":"low"}}'
```

```bash
image generate "Studio ecommerce render" \
  --model seedream/doubao-seedream-4.5 \
  --extra '{"watermark":false}'
```

## Provider Aliases

- `chatgpt-image` -> `openai`
- `nano-banana` -> `gemini`
- `qwen-image` -> `qwen`
- `minimax-image` -> `minimax`

## `--extra`

Use `--extra` only for provider-native fields that are not covered by the normalized flags.

Examples:

- `{"watermark":false}`
- `{"response_format":"base64"}`
- `{"prompt_optimizer":true}`

Do not try to override normalized fields such as `prompt`, `model`, `size`, `images`, or `seed` through `--extra`.
