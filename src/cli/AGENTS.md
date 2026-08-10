This module owns command parsing and user-facing help.

- Depend on protocol/config/runtime layers, not provider internals directly.
- Keep command handlers thin; push semantics into shared modules.
- Add CLI tests for new flags, help text, and error surfaces.
- Follow the CLI Help And Guidance Standard in `SPEC.md`.
- Command groups with no action must show local help only; root operation guides must not leak into subcommand help.
- Keep command parsing on Node built-ins unless `SPEC.md` explicitly accepts a runtime dependency.
