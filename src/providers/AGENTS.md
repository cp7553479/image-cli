This module owns provider registry and shared provider abstractions.

- Shared provider code must stay provider-neutral.
- Provider-specific logic belongs in `src/providers/<provider>`.
- Add contract tests whenever shared provider interfaces change.

## Documentation maintenance convention
- When adding a new provider, create `src/providers/<provider>/AGENTS.md` with an `## Official docs` section.
- The `## Official docs` section must include 1-3 first-party official links that cover API overview, generation interface, and auth/error docs.
- Keep link format consistent as markdown list items with one-line purpose notes.
