This module owns `~/.image` paths, config parsing, env loading, templates, and doctor checks.

- Keep runtime config strict JSON and secrets in `.env`.
- Never log secret values.
- Add tests for precedence, missing keys, invalid files, and init templates.

