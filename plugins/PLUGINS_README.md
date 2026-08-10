# Custom Provider Plugin Guide

This document is for developers who want `image` to call a provider that is not
built in.

A plugin keeps the public CLI stable while adding one provider adapter under
`~/.image/plugins/`.

## Structure

```text
~/.image/plugins/my-provider/
  plugin.json
  index.js
```

`plugin.json`:

```json
{
  "providerId": "my-provider",
  "entry": "./index.js",
  "runtime": "node",
  "description": "Custom image provider",
  "aliases": ["my-provider-image"],
  "capabilities": {
    "generate": true,
    "multipleOutputs": true
  }
}
```

Supported runtime values:

- `node`
- `python`
- `executable`

Supported capability keys:

- `generate`
- `edit`
- `asyncTasks`
- `streaming`
- `background`
- `multipleOutputs`
- `transparentOutput`

## Routing

The same provider id is used in config and model references:

```json
{
  "version": 1,
  "defaultModel": "my-provider/my-model",
  "providers": {
    "my-provider": {
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

Then:

```bash
image generate "A glass apple on a wooden table"
image generate "A glass apple on a wooden table" --model my-provider/my-model
image generate "A glass apple on a wooden table" --model my-provider/my-model --extra '{"vendorOption":true}'
```

`request.extra` contains provider-specific JSON options. Plugins should treat it
as an escape hatch and keep OpenAI-compatible fields on the standard request
properties.

## Actions

The CLI runs plugin scripts with:

```bash
<runtime> <entry> --action <action> --input-stdin
```

The script receives one JSON payload on stdin and must print one JSON object to
stdout. A non-zero exit code is treated as provider failure.

Actions:

- `build-generate`
- `parse-generate`

## `build-generate`

Input:

```json
{
  "request": {
    "prompt": "A glass apple",
    "model": {
      "providerId": "my-provider",
      "providerAlias": "my-provider",
      "modelId": "my-model"
    },
    "size": "1024x1024",
    "n": 1,
    "quality": "high",
    "output_format": "png",
    "response_format": "b64_json"
  },
  "providerConfig": {},
  "credential": {}
}
```

Return:

```json
{
  "request": {
    "method": "POST",
    "url": "https://example.com/images",
    "headers": {
      "Authorization": "Bearer token"
    },
    "json": {
      "prompt": "A glass apple"
    },
    "timeoutMs": 120000
  }
}
```

## `parse-generate`

Input:

```json
{
  "result": {
    "statusCode": 200,
    "headers": {},
    "bodyText": "{}",
    "stderrText": "",
    "exitCode": 0
  },
  "input": {
    "request": {},
    "providerConfig": {},
    "credential": {}
  }
}
```

Return:

```json
{
  "providerId": "my-provider",
  "modelId": "my-model",
  "images": [
    {
      "dataBase64": "base64-image-data",
      "mimeType": "image/png",
      "output_format": "png"
    }
  ],
  "warnings": [],
  "raw": {}
}
```

Image result entries may contain either:

- `dataBase64`
- `url`

The CLI owns output saving and manifest writing.

## Model Listing

Plugin providers can be listed with `image provider list` when configured.
Plugin model discovery is not defined in v1, so callers should confirm model ids
with the provider.
