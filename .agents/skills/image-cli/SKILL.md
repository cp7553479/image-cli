---
name: image-cli
description: Use when an agent needs to generate images through the local `image` CLI, inspect available providers, or initialize `~/.image` config.
---

# Image CLI

Use the local `image` command.

`api_key` can be either a single string or an ordered array of credential strings.

If this skill is missing or unavailable, read `README.md` in the same directory.

Useful checks when generation fails or routing is unclear:

```bash
image config show --json
image config doctor --json
image provider list
image provider <provider-id> model list
```

## Generate

Basic form:

```bash
image generate "<prompt>" --model provider/model
```

Common flags:

- `--size auto|WIDTHxHEIGHT`
- `--n <count>`
- `--quality <value>`
- `--background auto|opaque|transparent`
- `--output-format png|jpeg|webp`
- `--output-compression <0-100>`
- `--moderation auto|low`
- `--response-format url|b64_json`
- `--stream`
- `--partial-images <count>`
- `--style vivid|natural`
- `--user <id>`
- `--reference-image <path|url>` (repeatable; image-to-image / edit)
- `--mask <path|url>` (transparent areas are editable)
- `--input-fidelity <low|high>` (gpt-image fidelity to reference image)
- `--extra <json object>`
- `--output-dir <path>`
- `--json`

`--reference-image` enables image-to-image generation. Pass it multiple times
to fuse several reference images. Each provider adapts the reference images to
its native API (OpenAI edits multipart, Gemini inlineData parts, Seedream
`image` field, Qwen multimodal content, MiniMax `subject_reference`, OpenRouter
multimodal content). Downloaded reference images are cached under
`~/.image/.temp/`.

`--extra` is for provider-specific options beyond the OpenAI-compatible fields.
It must be a JSON object and cannot override standard fields.

The CLI validates only the common request shape. Provider-specific option
support is decided by the remote provider response.

```bash
image generate "Editorial portrait with dramatic rim light" --model openai/gpt-image-1.5 --size 1536x1024 --output-format png --response-format b64_json
```

Image-to-image example:

```bash
image generate "add a knitted hat" --model openai/gpt-image-1.5 --reference-image ./portrait.png --mask ./mask.png --input-fidelity high
```

## Provider Discovery

```bash
image provider list
image provider openai model list
```

Model-list output prefers provider APIs when supported. Built-in model-list output includes an English warning when model ids may be incomplete or outdated.

## Provider Aliases

- `chatgpt-image` -> `openai`
- `openrouter-image` -> `openrouter`
- `nano-banana` -> `gemini`
- `doubao-seedream` -> `seedream`
- `qwen-image` -> `qwen`
- `minimax-image` -> `minimax`
