# ~/.image

This directory stores local configuration for the `image` CLI.

- `config.json`: your active provider configuration, including top-level `defaultModel` and per-provider `api_key`
- `config.example.jsonc`: commented template for reference
- `skills/image-cli/`: local skill copy for shared image tooling

Quick start:

1. Copy the structure from `config.example.jsonc` into `config.json` if needed.
2. Set top-level `defaultModel` to `provider/modelid`.
3. Fill each provider's `api_key` directly in `config.json`. It can be a string or an array of strings.
4. Run `image config doctor` to verify the setup.

Notes:

- `image config init` does not overwrite existing managed files.
- `image config init` fills in any missing managed files under `~/.image` and the installed skill directories.
- `image config init` installs the bundled `image-cli` skill under `~/.image/skills`, `~/.claude/skills`, `~/.agents/skills`, `~/.codex/skills`, and `~/antigravity/skills`.
- Use `image config init --force` to overwrite existing managed files.
