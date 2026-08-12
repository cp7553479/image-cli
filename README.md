# Image CLI

[中文说明 / README_CN](./README_CN.md)

`image` is a local, agent-oriented image generation CLI. It routes a single
OpenAI-compatible image generation request shape to configured providers, saves
outputs, and prints compact agent-friendly results.

The published runtime has no third-party dependencies. Runtime code uses Node
built-ins plus `curl` for HTTP transport. Development dependencies are used only
for TypeScript, linting, build, and tests.

Built-in providers:

- OpenAI
- OpenRouter
- Gemini
- Volcengine (Ark / Doubao Seedream)
- Bailian (Alibaba Cloud / DashScope)
- MiniMax

Custom providers can be installed under `~/.image/plugins/`.

## Install

```bash
npm install -g @cp7553479/image-cli
```

Verify:

```bash
image --help
image generate --help
image config --help
image provider --help
```

## Quick Start

```bash
image config init
image config doctor --json
image provider list
image provider openai model list
image generate "A cinematic fox poster in snowfall" --model openai/gpt-image-1.5
```

If `--model` is omitted, the CLI uses top-level `config.defaultModel`.

## Generate

```bash
image generate "<prompt>" [flags]
```

Supported flags:

- `--model <provider/model>`
- `--size <auto|WIDTHxHEIGHT>`
- `--n <count>`
- `--quality <value>`
- `--background <auto|opaque|transparent>`
- `--output-format <png|jpeg|webp>`
- `--output-compression <0-100>`
- `--moderation <auto|low>`
- `--response-format <url|b64_json>`
- `--stream`
- `--partial-images <count>`
- `--style <vivid|natural>`
- `--user <id>`
- `--reference-image <path|url>` (repeatable; enables image-to-image / edit)
- `--mask <path|url>` (transparent areas are editable)
- `--input-fidelity <low|high>` (gpt-image fidelity to the reference image)
- `--extra <json object>`
- `--output-dir <path>`
- `--json`

`--reference-image` enables image-to-image generation. Pass it multiple times
to fuse several reference images. Each provider adapts the reference images to
its native API; provider-specific support is still decided by the remote
response. Downloaded reference images are cached under `~/.image/.temp/`.

`--extra` is for provider-specific options beyond the OpenAI-compatible
fields. It must be a JSON object and cannot override standard fields such as
`model`, `prompt`, `size`, `n`, or `output_format`.

The CLI validates only the common request shape. Provider-specific option
support is decided by the remote provider response.

Example:

```bash
image generate "Editorial portrait with dramatic rim light" \
  --model openai/gpt-image-1.5 \
  --size 1536x1024 \
  --n 1 \
  --quality high \
  --output-format png \
  --response-format b64_json
```

Image-to-image example:

```bash
image generate "add a knitted hat" \
  --model openai/gpt-image-1.5 \
  --reference-image ./portrait.png \
  --mask ./mask.png \
  --input-fidelity high
```

`--model` uses `provider/modelid`. The provider segment is used for local
routing. The model segment is sent to the provider unchanged.

## Output

Plain successful output is intentionally compact:

```text
/absolute/path/to/image-1.png
manifest: /absolute/path/to/manifest.json
warning: optional warning text
```

Use `--json` for the full output manifest. Token usage in manifests is
normalized to OpenAI-style fields when provider responses expose usage data:
`input_tokens`, `output_tokens`, `total_tokens`, `input_tokens_details`, and
`output_tokens_details`.

## Config

```bash
image config init
image config path
image config show --json
image config doctor --json
image config providers --json
```

`~/.image/config.json` contains:

- top-level `defaultModel`
- provider enablement
- provider base URLs
- timeouts
- ordered `api_key` values

Secrets must stay out of tracked files.

## Provider Discovery

```bash
image provider list
image provider list --json
image provider openai model list
image provider openai model list --json --limit 20
```

Model listing uses provider APIs where the built-in integration supports it. If
API discovery is unavailable, output includes an English warning that built-in
model ids may be incomplete or outdated.

## Public Behavior Source

`SPEC.md` is the public behavior contract. Production behavior changes must
update source, tests, docs, generated help, and the bundled `image-cli` skill.
