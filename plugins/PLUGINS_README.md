# Custom Provider Plugin Guide

This document is for developers who want `image` to call a provider that is not built in.

If you are only using built-in providers such as OpenAI, OpenRouter, Gemini, Seedream, Qwen, or MiniMax, you do not need this document.

## First: what problem does a plugin solve?

The `image` CLI already knows how to talk to built-in providers.

A custom provider plugin exists for one reason:

- you want to keep using the same `image generate ...` command
- but the target provider is not built into the CLI

Without plugins, every new provider would require editing the CLI source code and publishing a new version.

With plugins, the CLI can stay the same, while you add one small adapter under `~/.image/plugins/`.

## The basic idea

Think of the CLI as having two layers:

- the protocol layer
- the provider implementation layer

The protocol layer is the part users see.
It handles stable concepts such as:

- `image generate "<prompt>"`
- `--model provider/modelid`
- `--size`
- `--aspect`
- `--image`
- `--seed`
- `--extra`

The provider implementation layer is different for every vendor.
That is where details change, for example:

- auth header format
- request JSON shape
- multipart vs JSON upload
- synchronous vs asynchronous APIs
- where the image URL or base64 result appears in the response

A plugin is just a small adapter that sits in that provider implementation layer.

It does two jobs:

1. turn the CLI's normalized request into the provider's real HTTP request
2. turn the provider's HTTP response back into the CLI's normalized result

## What actually happens when you run `image generate`

Suppose you run:

```bash
image generate "A glass apple on a wooden table" --model my-provider/v1
```

The CLI flow is:

1. Parse the command and build a normalized request.
2. Read `~/.image/config.json`.
3. See that `providerId` is `my-provider`.
4. Look for a built-in provider named `my-provider`.
5. If none exists, look under `~/.image/plugins/`.
6. Load the plugin whose `plugin.json` declares `providerId: "my-provider"`.
7. Ask that plugin to build the real HTTP request.
8. Send the request.
9. Ask that plugin to parse the provider response.
10. Save the returned images and manifest in the normal CLI output flow.

This is why a custom plugin still feels like a normal `image` provider to the end user.

## What files do I need?

Each plugin lives in its own directory:

```text
~/.image/plugins/<plugin-name>/
```

Minimum structure:

```text
~/.image/plugins/my-provider/
  plugin.json
  index.js
```

You only need:

- `plugin.json`
- one script file referenced by `plugin.json`

## What is `plugin.json`?

`plugin.json` is the plugin's registration file.

It tells the CLI:

- which provider id this plugin owns
- which script to run
- which runtime should execute the script

Minimum example:

```json
{
  "providerId": "my-provider",
  "entry": "./index.js"
}
```

Supported fields:

- `providerId`
  The provider id that users will write in `config.json` and `--model`.

- `entry`
  Relative path to the plugin script.

- `runtime`
  Optional.
  One of:
  - `node`
  - `python`
  - `executable`

- `description`
  Optional human-readable description.

- `aliases`
  Optional provider aliases.

- `capabilities`
  Optional capability hints such as `generate`, `inputImages`, or `multipleOutputs`.

Example:

```json
{
  "providerId": "custom-router",
  "entry": "./index.js",
  "runtime": "node",
  "description": "Custom image provider",
  "aliases": ["custom-router-image"],
  "capabilities": {
    "generate": true,
    "inputImages": true,
    "multipleOutputs": true
  }
}
```

## How does routing work?

Once a plugin registers `providerId`, it is routed exactly like a built-in provider.

That means the same provider id appears in all three places:

- `config.defaultModel`
- `providers.<providerId>` in `config.json`
- `--model <providerId>/<modelId>`

Example:

```json
{
  "version": 1,
  "defaultModel": "custom-router/my-model",
  "providers": {
    "custom-router": {
      "enabled": true,
      "apiBaseUrl": "https://example.com",
      "timeoutMs": 120000,
      "retryPolicy": {
        "maxAttempts": 2
      },
      "api_key": ["your-key"]
    }
  }
}
```

Then either of these works:

```bash
image generate "A custom provider image"
```

```bash
image generate "A custom provider image" --model custom-router/my-model
```

## What does the plugin script need to do?

The script has two actions:

- `build-generate`
- `parse-generate`

That split is important for a beginner to understand:

- `build-generate` does not send the network request
- `parse-generate` does not decide CLI arguments

The CLI still owns:

- argument parsing
- config loading
- output saving
- retries and failover flow

The plugin only owns provider translation.

## How the CLI calls your script

The CLI runs:

```bash
<runtime> <entry> --action <action> --input-stdin
```

The payload comes from stdin as one JSON object.
Your script must print one JSON object to stdout.

If your script exits with a non-zero code, the CLI treats that as provider failure.

## `build-generate`

This action receives a normalized request and must return the real HTTP request to send.

Input JSON:

```json
{
  "request": {},
  "providerConfig": {},
  "credential": {},
  "preparedImages": []
}
```

What the important fields mean:

- `request`
  The normalized CLI request.
  This contains semantic fields such as prompt, model id, size, aspect, images, seed, and `extra`.

- `providerConfig`
  The matching provider config from `~/.image/config.json`.

- `credential`
  The currently selected API key entry for this attempt.

- `preparedImages`
  Reference images already normalized by the CLI.

Output JSON:

```json
{
  "request": {
    "method": "POST",
    "url": "https://example.com",
    "headers": {},
    "json": {}
  }
}
```

This returned `request` object is what the CLI will actually send.

## `parse-generate`

This action receives the raw HTTP result and must turn it into the CLI's normalized result shape.

Input JSON:

```json
{
  "result": {
    "statusCode": 200,
    "headers": {},
    "bodyText": "",
    "stderrText": "",
    "exitCode": 0
  },
  "input": {
    "request": {},
    "providerConfig": {},
    "credential": {},
    "preparedImages": []
  }
}
```

Output JSON:

```json
{
  "providerId": "my-provider",
  "modelId": "provider-model-id",
  "images": [],
  "warnings": [],
  "raw": {}
}
```

The `images` array should contain the normalized image results that the CLI can save.

## Minimal mental model

If the full contract still feels abstract, reduce it to this:

- `plugin.json` says "when provider id is X, run this script"
- `build-generate` says "for provider X, send this HTTP request"
- `parse-generate` says "for provider X, interpret the HTTP response like this"

That is the whole plugin mechanism.

## Common beginner questions

### Do I need to modify the `image` CLI source code?

No.

That is the point of the plugin system.
You add files under `~/.image/plugins/`, then reference the same `providerId` in `config.json`.

### Do I need to publish an npm package?

No.

A local plugin is just a directory on your machine.

### Is `plugin.json` the same thing as `config.json`?

No.

They solve different problems:

- `~/.image/config.json` is user configuration
  - API keys
  - default model
  - provider base URL
  - timeout

- `~/.image/plugins/<plugin-name>/plugin.json` is developer registration
  - provider id
  - entry script
  - runtime

### What should `providerId` be?

It should be a stable identifier that users can type.

Good:

- `acme-image`
- `my-router`
- `internal-art`

Avoid:

- spaces
- display names
- ids that change every week

### Can I reuse `--extra`?

Yes.

If your provider has fields that the CLI does not normalize, read them from `request.extra` inside `build-generate`.

### Can the plugin do retries by itself?

It should not own the general retry strategy.

The CLI already controls retry and API key failover.
The plugin should focus on provider translation and accurate error parsing.

### Can the plugin save files directly?

It should not.

Return normalized image results.
The CLI will handle output saving and manifest writing.

## Recommended development path

For a first plugin, do this in order:

1. Pick a provider id.
2. Create `~/.image/plugins/<plugin-name>/plugin.json`.
3. Write a tiny `index.js`.
4. Implement `build-generate` only for one simple text-to-image path.
5. Log the provider response locally while building `parse-generate`.
6. Return one image successfully.
7. Only then add input images, multiple outputs, or special provider features.

Start with the smallest working path.
Do not begin with every optional parameter at once.
