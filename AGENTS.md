Keep files concise, execution-focused, and free of prompt commentary.

- Follow `SPEC.md` for public behavior and interfaces.
- Treat `.agents/AGENTS.md` as the orchestration source for subagent and module ownership rules.
- Keep secrets out of tracked files.
- Every production behavior change needs tests under `test/`.
- Prefer small focused modules over large mixed-responsibility files.
- New code should preserve public compatibility unless `SPEC.md` changes, stay maintainable, and use clear abstractions at stable protocol/provider/runtime boundaries.
- Third-party and non-HTTP providers extend through the plugin boundary (`~/.image/plugins/`); built-in providers stay limited to curated first-party HTTP integrations.
- When code talks to servers, handle error responses explicitly.
- Prefer Node built-ins for runtime code. Adding a third-party runtime dependency requires a documented exception in `SPEC.md` and tests for the new boundary.
- Be test-driven against real APIs: capture the actual request and response bodies before writing provider request/response mapping. When no real test environment is available, consult the official API docs instead. Do not write fallback or guesswork logic (e.g. trying multiple response shapes or field-name variants) unless it is genuinely necessary.

## Printed Output

- Printed output — help menus, listings, errors, and success output — is a public interface for both humans and AI agents. The bar: a reader with no repo knowledge can choose and run the correct next command from the printed output alone.
- Keep output structured and scannable: one item per line, aligned columns, stable spellings. Emitted ids, refs, paths, and commands must be usable verbatim in the next invocation, and truncated output states how much was hidden.
- Errors are self-recovering and distinguishable: state the cause plus the exact next command to run, and never print identical output for different failure causes.
- Guidance must match behavior: never document a flag, alias, or command the CLI does not honor; cover documented interface claims with tests so help cannot drift from behavior.
- Keep text and `--json` output at parity for every actionable field.
- Changes to printed guidance need test coverage and SPEC sync when public behavior changes. Verify new public commands or help changes by completing a real task from printed output alone — a fresh-eyes or subagent black-box run.

## Skill

- Skill source of truth: the `SKILL_MD` / `SKILL_README` templates in `src/config/init-templates.ts`. `image config init` installs them to `~/.image/skills/image-cli/`, `~/.claude/skills/image-cli/`, `~/.agents/skills/image-cli/`, `~/.codex/skills/image-cli/`, and `~/antigravity/skills/image-cli/`.
- The tracked copy at `.agents/skills/image-cli/SKILL.md` must stay identical to the template (enforced by `test/config/templates.test.ts`); edit the template, then sync copies — never edit copies directly.
- Any change to commands, flags, providers, aliases, or config flow must update the skill in the same change, keeping it consistent with `SPEC.md` and `image generate --help` output.
- Keep the skill concise and command-oriented: supported commands, flags, and config flow only. Installation/repair steps belong in the skill `README.md`. No secrets, no development notes, no version history.
