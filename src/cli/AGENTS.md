This module owns command parsing and user-facing help.

- Depend on protocol/config/runtime layers, not provider internals directly.
- Keep command handlers thin; push semantics into shared modules.
- Add CLI tests for new flags, help text, and error surfaces.

