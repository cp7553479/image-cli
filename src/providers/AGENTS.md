This module owns provider registry and shared provider abstractions.

- Shared provider code must stay provider-neutral.
- Provider-specific logic belongs in `src/providers/<provider>`.
- Add contract tests whenever shared provider interfaces change.

