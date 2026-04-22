This module owns invocation orchestration, key rotation, output saving, and user-facing runtime errors.

- Depend on protocol, config, transport, and provider registry.
- Keep provider mapping logic inside provider modules.
- Add tests for failover, output manifest generation, and invocation lifecycle behavior.
