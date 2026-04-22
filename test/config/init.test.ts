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
        paths.readmeFile
      ].sort()
    );
    await expect(access(paths.configFile, constants.F_OK)).resolves.toBeUndefined();
    await expect(access(paths.readmeFile, constants.F_OK)).resolves.toBeUndefined();
    expect(await readFile(paths.configFile, "utf8")).toContain('"defaultModel": "openai/gpt-image-1.5"');
    expect(await readFile(paths.configFile, "utf8")).toContain('"api_key": ["YOUR_OPENAI_API_KEY"]');
    expect(await readFile(paths.readmeFile, "utf8")).toContain("config.json");
  });

  test("does not overwrite existing config when .image already exists but refreshes README", async () => {
    const homeDir = await makeTempHome("image-cli-init-existing");
    const paths = getImageConfigPaths(homeDir);
    await mkdir(paths.configDir, { recursive: true });
    await writeFile(paths.configFile, '{"version":1,"defaultModel":"openai/gpt-image-1.5","providers":{}}');
    await writeFile(paths.readmeFile, "old readme");

    const result = await initImageConfigDirectory({ homeDir });

    expect(result.skipped).toContain(paths.configFile);
    expect(result.created).toContain(paths.readmeFile);
    expect(await readFile(paths.readmeFile, "utf8")).toContain("config.json");
  });

  test("overwrites config files when --force is used", async () => {
    const homeDir = await makeTempHome("image-cli-init-force");
    const paths = getImageConfigPaths(homeDir);
    await mkdir(paths.configDir, { recursive: true });
    await writeFile(paths.configFile, '{"version":1,"defaultModel":"old/provider","providers":{}}');

    const result = await initImageConfigDirectory({ homeDir, force: true });

    expect(result.created).toContain(paths.configFile);
    expect(await readFile(paths.configFile, "utf8")).toContain('"defaultModel": "openai/gpt-image-1.5"');
  });
});

async function makeTempHome(prefix: string): Promise<string> {
  const baseDir = path.join(tmpdir(), prefix, `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(baseDir, { recursive: true });
  return baseDir;
}
