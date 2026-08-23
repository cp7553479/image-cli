# Error Handling

This document defines how `image-cli` reports, classifies, retries, and records
failures.

## Goals

- Keep default output short enough for calling agents.
- Write successful output to stdout.
- Write errors to stderr and return a non-zero exit code.
- Use `--json` for structured machine output.
- Preserve detailed run data in `manifest.json`.
- Avoid leaking secrets, full request payloads, or provider credentials.

## CLI Boundary

Owned by:

- `src/cli/main.ts`
- `src/cli/program.ts`
- `src/cli/help.ts`
- `src/cli/core.ts`

Rules:

- `image`, `image config`, `image provider`, `image provider <provider-id>`, and `image provider <provider-id> model` with no required action print scoped help and exit `1`.
- `-h` and `--help` print help and exit `0`.
- Missing required arguments print a concise error plus scoped help.
- Stack traces are not part of normal CLI output.
- Help output is English.

## Success Output

Plain successful `image generate` output:

```text
/absolute/path/to/image-1.png
manifest: /absolute/path/to/manifest.json
warning: optional warning text
```

Rules:

- `--json` prints the manifest JSON.
- Default success output must not include raw provider responses.
- Warnings are not failures.
- Token usage uses OpenAI-style field names when provider usage is available.

## Config Errors

Owned by:

- `src/config/load.ts`
- `src/config/init.ts`
- `src/config/doctor.ts`
- `src/config/show.ts`

Cases:

| Case | Current behavior | Caller action |
| --- | --- | --- |
| Missing config | `Missing ~/.image/config.json. Run "image config init" first.` | Run `image config init` |
| Invalid JSON | `Failed to parse config.json: ...` | Fix JSON syntax |
| Provider missing | `Provider "<id>" is not configured in ~/.image/config.json. Run 'image provider list' to see configured providers.` | Add provider config or change `--model` |
| No API keys | `Provider "<id>" does not have any resolved API keys.` | Fill `api_key` |
| Existing init file | Listed under skipped files | Use `--force` only when overwrite is intended |

Rules:

- Never print raw secret values.
- `api_key` may be a string or ordered string array.
- Empty key strings are ignored.

## Protocol Validation

Owned by:

- `src/protocol/model-ref.ts`
- `src/protocol/generate-request.ts`

Cases:

| Case | Error style |
| --- | --- |
| Missing model and no default model | `--model is required unless config.defaultModel is set.` |
| Invalid model reference | `Invalid model reference. Expected --model provider_id/model_id.` |
| Missing model id | `Missing model id in --model provider_id/model_id.` |
| Invalid `--n` | `--n must be a positive integer.` |
| Invalid `--size` | `--size must be "auto" or explicit dimensions like "1024x1024".` |
| Unsupported `--output-format` | `Unsupported --output-format "<value>".` |
| Invalid `--output-compression` | `--output-compression must be an integer between 0 and 100.` |
| Unsupported `--background` | `Unsupported --background "<value>".` |
| Unsupported `--moderation` | `Unsupported --moderation "<value>".` |
| Unsupported `--response-format` | `Unsupported --response-format "<value>".` |
| Invalid `--partial-images` | `--partial-images must be an integer between 0 and 3.` |
| Unsupported `--style` | `Unsupported --style "<value>".` |
| Empty `--user` | `--user must not be empty.` |
| Invalid `--extra` JSON | `--extra must be a valid JSON object...` |
| `--extra` overrides a standard field | `--extra must not override OpenAI-compatible field "<field>".` |

Validation failures must happen before provider transport.

Provider-specific option support is not validated locally. After protocol
shape validation, provider adapters forward standard fields through their
request surface and let the remote provider accept or reject them.

## Provider Selection

Owned by:

- `src/providers/index.ts`
- `src/plugins/loader.ts`

Cases:

| Case | Current behavior |
| --- | --- |
| Built-in provider id | Use built-in provider |
| Plugin provider id | Load plugin manifest from `~/.image/plugins/<name>/plugin.json` |
| Unknown provider | Throw `Unknown provider "<id>". Run 'image config providers' to see known provider ids and aliases.` |
| Plugin action exits non-zero | Throw stderr or exit-code message |
| Plugin returns invalid JSON | JSON parse error bubbles as provider failure |

Rules:

- Built-in aliases are resolved in the protocol layer from provider catalog metadata.
- Custom provider ids must use the accepted provider-id shape.
- Plugin providers classify failures as `unknown` in v1.

## Provider Mapping

Owned by each `src/providers/<provider>/index.ts`.

Provider modules:

- map `GenerateRequest` into native HTTP requests
- parse provider responses into `GenerateResult`
- preserve safe provider warnings
- keep raw provider response data for `manifest.json`
- classify failures into `FailureClassification`

Common failures:

| Case | Expected handling |
| --- | --- |
| Provider response is not valid JSON | Throw `Failed to parse <Provider> response JSON...` |
| Provider rejects an unsupported option | Throw the provider HTTP error with safe status/message details |
| Provider response has no image output | Throw provider-specific missing-output error when detectable |
| Async task has unknown status | Throw provider-specific task status error |
| Async task exceeds poll limit | Throw provider-specific poll limit error |
| Provider reports structured API error | Include safe status/message details without secrets |
| Provider HTTP failure during `image generate` | Append next-step hint: `Next: run 'image config doctor' ... or pass --model with another configured provider (see 'image provider list').` |

## Credential Failover

Runtime tries provider credentials in configured order.

Retry on:

- authentication failures when provider classification returns `retryable-credential`
- quota or rate-limit failures when the provider classifies them as credential-specific

Do not retry on:

- protocol validation errors
- provider request-shape errors
- non-retryable provider responses

## Transport

Owned by `src/transport/curl.ts`.

Rules:

- Use `curl` as the HTTP boundary.
- Keep request and response payloads out of default CLI output.
- Use provider-level parse errors for response body shape issues.

## Manifest

`manifest.json` is the durable run record. It may include:

- saved file paths
- warnings
- provider id
- model id
- raw provider response
- normalized usage

Manifest content must not include credentials.
