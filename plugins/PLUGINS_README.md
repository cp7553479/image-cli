# Provider Plugins

Custom providers can be installed under:

```text
~/.image/plugins/<plugin-name>/
```

Each plugin directory must contain:

- `plugin.json`
- a script entry file referenced by `plugin.json`

## `plugin.json`

Minimum manifest:

```json
{
  "providerId": "my-provider",
  "entry": "./index.js"
}
```

Supported manifest fields:

- `providerId`: provider id routed by `config.json` and `provider/modelid`
- `entry`: script entry path, relative to `plugin.json`
- `runtime`: `node`, `python`, or `executable`
- `description`: optional human-readable description
- `aliases`: optional provider aliases
- `capabilities`: optional capability overrides

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

## Script Contract

The CLI invokes the plugin script with:

```bash
<runtime> <entry> --action <action> --input-stdin
```

Actions:

- `build-generate`
- `parse-generate`

The request payload is passed as JSON through stdin.
The plugin must write one JSON object to stdout.
If the plugin exits non-zero, the CLI treats it as a provider failure.

## Action Payloads

### `build-generate`

Input JSON:

```json
{
  "request": {},
  "providerConfig": {},
  "credential": {},
  "preparedImages": []
}
```

Output JSON must match:

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

`followUp` is not supported in the plugin script contract.

### `parse-generate`

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

Output JSON must match:

```json
{
  "providerId": "my-provider",
  "modelId": "provider-model-id",
  "images": [],
  "warnings": [],
  "raw": {}
}
```

## Routing

Custom plugin providers are routed by provider id exactly like built-in providers.

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

Then run:

```bash
image generate "A custom provider image"
```

or:

```bash
image generate "A custom provider image" --model custom-router/my-model
```
