# Image CLI v1 Spec

## Goal

Provide one local CLI, `image`, for agent-driven image generation. The CLI
accepts an OpenAI-compatible image generation request shape, routes it to a
configured provider, saves artifacts, and prints compact output.

v1 public commands:

- `image generate`
- `image config init`
- `image config path`
- `image config show`
- `image config doctor`
- `image config providers`
- `image provider list`
- `image provider <provider-id> model list`

## Design Principles

- CLI protocol follows OpenAI image generation naming and request semantics.
- Provider identity and API interface mapping are separate layers.
- Protocol validation happens before provider transport.
- Provider modules translate the protocol request to native HTTP requests.
- Provider modules do not perform provider-specific option filtering; unsupported options are reported by provider responses.
- Secrets never live in tracked files.
- Runtime code uses Node built-ins and `curl`; published runtime dependencies stay at zero.
- Default output is short enough for calling agents.
- Provider diagnostics belong in explicit diagnostic paths, not default success output.

## CLI Grammar

```bash
image --help
image generate <prompt> [options]
image config <subcommand> [options]
image provider <subcommand> [options]
image provider <provider-id> model list [options]
```

Generate:

```bash
image generate "prompt" \
  --model provider_id/model_id \
  [--size auto|WIDTHxHEIGHT] \
  [--n COUNT] \
  [--quality VALUE] \
  [--background auto|opaque|transparent] \
  [--output-format png|jpeg|webp] \
  [--output-compression 0-100] \
  [--moderation auto|low] \
  [--response-format url|b64_json] \
  [--stream] \
  [--partial-images COUNT] \
  [--style vivid|natural] \
  [--user ID] \
  [--reference-image PATH|URL] \
  [--mask PATH|URL] \
  [--input-fidelity low|high] \
  [--extra JSON_OBJECT] \
  [--output-dir PATH] \
  [--json]
```

`--reference-image` may be repeated to pass multiple reference images. When one or
more reference images are present, the request is an image-to-image / edit
request; otherwise it is text-to-image. `--mask` marks the editable region
(transparent pixels are editable) and is only meaningful for edit requests.
`--input-fidelity` controls how closely the output follows the reference image
for models that accept it.

Config:

```bash
image config init
image config path
image config show [--json]
image config doctor [--json]
image config providers [--json]
```

Provider inspection:

```bash
image provider list [--json]
image provider <provider-id> model list [--json] [--limit COUNT]
```

## Help Standard

- Running `image` without a subcommand prints concise root help plus the public operation guide, then exits non-zero.
- Running a command group without a required subcommand prints only that group's local help and exits non-zero.
- `-h` and `--help` print command help and exit zero.
- Missing required arguments print a concise error plus the target command's help.
- Help and guidance output is English.
- Root help may list all public operations; subcommand help must not append root-only operation guides.
- New public commands must update `SPEC.md`, README files, generated help, bundled skill docs, and CLI help tests.
- Help text is maintained in `src/cli/help.ts`; command routing belongs in `src/cli/program.ts`.

## Generate Request

```ts
type GenerateRequest = {
  prompt: string;
  model: ModelRef;
  size?: string;
  n?: number;
  quality?: string;
  background?: "auto" | "opaque" | "transparent";
  output_format?: "png" | "jpeg" | "webp";
  output_compression?: number;
  moderation?: "auto" | "low";
  response_format?: "url" | "b64_json";
  stream?: boolean;
  partial_images?: number;
  style?: "vivid" | "natural";
  user?: string;
  extra?: Record<string, unknown>;
  outputDir?: string;
  json?: boolean;
  reference_images?: ImageInput[];
  mask?: ImageInput;
  input_fidelity?: "low" | "high";
};

type ImageInput = { url: string } | { file: string };
```

`reference_images` carries one or more source images for image-to-image / edit
requests. `mask` marks the editable region. `input_fidelity` controls fidelity
to the reference image. All three are validated by the protocol layer but
provider-specific support is decided by the provider response.

`extra` carries provider-specific options outside the OpenAI-compatible image
fields. It must be a JSON object and must not override standard fields.

The protocol layer owns:

- model reference parsing
- enum validation
- numeric validation
- command help
- conversion from CLI option spelling to request field spelling

The provider layer owns:

- provider authentication
- URL construction
- request body translation
- forwarding standard OpenAI-compatible fields where the provider request surface can carry them
- response parsing
- failure classification
- provider warnings

## Model Reference

`--model` must parse as `provider_id/model_id`.

Built-in provider ids:

- `openai`
- `openrouter`
- `gemini`
- `seedream`
- `qwen`
- `minimax`

Built-in aliases:

- `chatgpt-image` -> `openai`
- `openrouter-image` -> `openrouter`
- `nano-banana` -> `gemini`
- `doubao-seedream` -> `seedream`
- `qwen-image` -> `qwen`
- `minimax-image` -> `minimax`

Provider ids and aliases are owned by provider catalog metadata. The protocol
parser must not keep a separate built-in provider table.

## Size

`--size` accepts:

- `auto`
- explicit dimensions as `WIDTHxHEIGHT`

The CLI does not derive dimensions from named presets. Providers that need
native aspect or size buckets must derive them from `size` in provider code.

## Provider Capability Model

```ts
type ProviderCapabilities = {
  generate: boolean;
  edit: boolean;
  asyncTasks: boolean;
  streaming: boolean;
  background: boolean;
  multipleOutputs: boolean;
  transparentOutput: boolean;
};
```

v1 public command behavior:

- `image generate` serves both text-to-image and image-to-image (edit). The
  presence of `reference_images` makes a request an edit request; the chosen
  provider decides whether it routes to a generations or edits API surface.
- Future commands may add other OpenAI-compatible image API surfaces as separate command contracts.
- Capabilities are descriptive metadata. Generation does not block requests by provider capability before transport.
- Unsupported option support must come from the provider response, not local provider-specific filtering.
- Each provider adapts the unified `reference_images` / `mask` / `input_fidelity`
  into its own native request shape. Provider-specific options beyond the
  OpenAI-compatible fields are carried by `extra`, merged verbatim into the
  provider request, and not locally validated.

## Provider Interface Layer

Provider routing and API interfaces are separate:

- Provider profile: provider id, aliases, base URL, auth profile, capabilities, interface adapter id.
- Interface adapter: the API surface used to build and parse provider HTTP calls.

Built-in adapter ids:

- `native-image`
- `openai-compatible-chat`
- `gemini-generate-content`

Adapters and direct provider implementations both consume the same `GenerateRequest`.

## Config

`~/.image/config.json`:

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

`api_key` may be a string or ordered string array. Empty values are ignored.
Runtime credential failover uses the configured order.

## Output

Plain successful `image generate` output:

```text
/absolute/path/to/image-1.png
manifest: /absolute/path/to/manifest.json
warning: optional warning text
```

Rules:

- stdout contains generated file paths, manifest path, and warnings.
- stderr contains errors.
- `--json` prints the manifest JSON.
- Default output must not include raw requests, raw responses, secrets, or long diagnostics.
- Manifest usage fields use OpenAI-style token names when usage data is available.

## Provider Model Listing

`image provider list` lists providers currently configured in `~/.image/config.json`.

`image provider <provider-id> model list` lists model ids for a configured provider.

Rules:

- Prefer provider API discovery when the built-in integration supports it.
- If API discovery is unavailable, print built-in model ids with an English warning.
- Plugin providers can be listed from config even when model discovery is unavailable.

## Plugins

Plugins register provider ids under `~/.image/plugins/<name>/plugin.json`.

Plugin actions:

- `build-generate`
- `parse-generate`

Plugin payloads use the same `GenerateRequest` and provider context as built-in providers.

## Error Handling

Detailed error-handling rules live in `docs/error-handling.md`.

Required behavior:

- validation errors are concise and flag-specific
- provider request failures include provider name and safe status details
- retryable credential failures rotate credentials
- raw provider responses stay in `manifest.json`, not default stdout
