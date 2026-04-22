Coordinate this repo through clear module ownership.

- Build shared layers first: `src/protocol`, `src/config`, `src/transport`, `src/cli`.
- Provider work is isolated to `src/providers/<provider>` plus matching tests.
- Do not change public CLI semantics without updating `SPEC.md`, `README.md`, help text, and the image-cli skill.
- Keep subagent prompts short, second-person, and specific to owned paths.
- Before accepting provider work, verify request mapping, failure classification, and tests for that provider.

