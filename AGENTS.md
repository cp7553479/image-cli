Keep files concise, execution-focused, and free of prompt commentary.

- Follow `SPEC.md` for public behavior and interfaces.
- Treat `.agents/AGENTS.md` as the orchestration source for subagent and module ownership rules.
- Keep secrets out of tracked files.
- Every production behavior change needs tests under `test/`.
- Prefer small focused modules over large mixed-responsibility files.
- New code should preserve public compatibility unless `SPEC.md` changes, stay maintainable, and use clear abstractions at stable protocol/provider/runtime boundaries.
- When code talks to servers, handle error responses explicitly.
- Prefer Node built-ins for runtime code. Adding a third-party runtime dependency requires a documented exception in `SPEC.md` and tests for the new boundary.
