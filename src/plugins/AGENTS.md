This module owns local provider plugin discovery and execution.

- Discover plugins from `~/.image/plugins/<plugin-name>/plugin.json`.
- Keep the plugin contract explicit and stable.
- Test manifest parsing, script execution, and provider routing through plugin wrappers.

