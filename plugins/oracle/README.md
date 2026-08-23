# Oracle Provider Plugin

Third-party provider plugin that routes `image generate` through the local
[`oracle`](../../plugins/PLUGINS_README.md) CLI running ChatGPT in browser mode.
Every generation is executed as:

```bash
oracle --engine browser --browser-manual-login \
  --model <model> [--browser-thinking-time <level>] \
  [--file <reference-image> ...] \
  --generate-image <temp-file> \
  --prompt "<prompt>"
```

The first browser run opens a visible Chrome window using oracle's persistent
manual-login profile; sign in once and later runs reuse the session.

## Install

```bash
mkdir -p ~/.image/plugins/oracle
cp plugin.json index.mjs ~/.image/plugins/oracle/
```

Then add the provider to `~/.image/config.json` (the credential is a
placeholder: browser mode authenticates through the manual-login profile, not an
API key):

```json
{
  "providers": {
    "oracle": {
      "enabled": true,
      "apiBaseUrl": "https://chatgpt.com",
      "timeoutMs": 1200000,
      "api_key": ["browser-manual-login"]
    }
  }
}
```

`timeoutMs` is forwarded to oracle as `--timeout`; the default is 20 minutes.

## Use

```bash
image generate "A glass apple on a wooden table" --model oracle/gpt-5.6-sol
image generate "Same apple, cut in half" \
  --model "oracle/GPT-5.6 Sol Medium" \
  --reference-image apple.png
```

Model ids:

- `gpt-5.6`, `gpt-5.6-sol`, and display spellings like `GPT-5.6 Sol` map to
  ChatGPT's GPT-5.6 Sol picker.
- An effort suffix maps to `--browser-thinking-time`: `GPT-5.6 Sol Medium` →
  `gpt-5.6-sol` + `medium`, `GPT-5.6 Sol Pro` → `gpt-5.6-sol` + `pro`.
- Other ids (`gpt-5.5-pro`, `gemini-3-pro`, ...) pass through verbatim; oracle
  validates them.

Reference images (`--reference-image`) are attached with `--file`. Local paths
are used directly; URL references are downloaded first. One image is generated
per run (`--n` greater than 1 is ignored with a warning). If oracle finishes
without a downloadable image artifact the run fails with a pointer to
`oracle status`.

## Tests

`test/plugins/oracle-plugin.test.ts` exercises the plugin with a fake oracle
binary (`ORACLE_BIN`).
