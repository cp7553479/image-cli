This module owns `~/.image` paths, config parsing, templates, and doctor checks.

- Keep runtime config strict JSON and let users fill `api_key` directly in `config.json`.
- Never log secret values.
- Add tests for precedence, missing keys, invalid files, and init templates.
