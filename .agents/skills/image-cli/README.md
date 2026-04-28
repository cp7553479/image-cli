# image-cli skill install

Use this file only when the skill is missing or the agent cannot find it.

Expected locations:

- `~/.image/skills/image-cli/`
- `~/.claude/skills/image-cli/`
- `~/.agents/skills/image-cli/`
- `~/.codex/skills/image-cli/`
- `~/antigravity/skills/image-cli/`

Install or repair:

```bash
image config init
```

Overwrite managed files:

```bash
image config init --force
```

Then verify:

```bash
image config path
```

If the CLI itself is missing, install it first:

```bash
npm install -g @cp7553479/image-cli
```
