import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";

const ROOTS = ["src/providers", "src/protocol", "src/transport", "src/runtime", "src/config", "src/cli"];

async function collectTsFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) files.push(...await collectTsFiles(full));
    if (e.isFile() && full.endsWith('.ts') && !full.endsWith('AGENTS.md')) files.push(full);
  }
  return files;
}

describe("exported symbols require jsdoc", () => {
  test("exported functions/constants in core dirs have jsdoc blocks", async () => {
    const offenders: string[] = [];
    for (const root of ROOTS) {
      if (!(await stat(root).catch(() => null))) continue;
      for (const file of await collectTsFiles(root)) {
        const content = await readFile(file, "utf8");
        const lines = content.split(/\r?\n/);
        lines.forEach((line, idx) => {
          if (!/^export\s+(async\s+)?function\s+|^export\s+const\s+[A-Za-z0-9_]+\s*=/.test(line.trim())) return;
          const prev = lines[idx - 1]?.trim() ?? "";
          if (!prev.endsWith("*/")) offenders.push(`${file}:${idx + 1}`);
        });
      }
    }
    expect(offenders, `Missing JSDoc on:\n${offenders.join("\n")}`).toEqual([]);
  });
});
