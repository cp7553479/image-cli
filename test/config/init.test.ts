import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, test } from "vitest";

import { getImageConfigPaths } from "../../src/config/paths.js";
import { initImageConfigDirectory } from "../../src/config/init.js";

describe("config init", () => {
  test("creates config files and examples", async () => {
    const homeDir = await makeTempHome("image-cli-init");
    const result = await initImageConfigDirectory({ homeDir });
    const paths = getImageConfigPaths(homeDir);

    expect(result.created.sort()).toEqual(
      [
        paths.configFile,
        paths.configExampleFile,
        paths.envExampleFile,
        paths.envFile,
        paths.gitignoreFile
      ].sort()
    );
    await expect(access(paths.configFile, constants.F_OK)).resolves.toBeUndefined();
    await expect(access(paths.envFile, constants.F_OK)).resolves.toBeUndefined();
    expect(await readFile(paths.gitignoreFile, "utf8")).toContain(".env");
  });

  test("does not overwrite existing config without force", async () => {
    const homeDir = await makeTempHome("image-cli-init-existing");
    const paths = getImageConfigPaths(homeDir);
    await mkdir(paths.configDir, { recursive: true });
    await writeFile(paths.configFile, '{"version":1,"defaultProvider":"openai","providers":{}}');

    const result = await initImageConfigDirectory({ homeDir });

    expect(result.skipped).toContain(paths.configFile);
  });
});

async function makeTempHome(prefix: string): Promise<string> {
  const baseDir = path.join(tmpdir(), prefix, `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(baseDir, { recursive: true });
  return baseDir;
}
