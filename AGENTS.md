Keep files concise, execution-focused, and free of prompt commentary.

- Follow `SPEC.md` for public behavior and interfaces.
- Treat `.agents/AGENTS.md` as the orchestration source for subagent and module ownership rules.
- Keep secrets out of tracked files.
- Every production behavior change needs tests under `test/`.
- Prefer small focused modules over large mixed-responsibility files.
- New code should preserve public compatibility unless `SPEC.md` changes, stay maintainable, and use clear abstractions at stable protocol/provider/runtime boundaries.
- When code talks to servers, handle error responses explicitly.
- Prefer Node built-ins for runtime code. Adding a third-party runtime dependency requires a documented exception in `SPEC.md` and tests for the new boundary.
- Be test-driven against real APIs: capture the actual request and response bodies before writing provider request/response mapping. When no real test environment is available, consult the official API docs instead. Do not write fallback or guesswork logic (e.g. trying multiple response shapes or field-name variants) unless it is genuinely necessary.
