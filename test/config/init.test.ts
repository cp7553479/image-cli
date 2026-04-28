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
    const skillFiles = paths.skillInstallDirs.flatMap((skillDir) => [
      path.join(skillDir, "SKILL.md"),
      path.join(skillDir, "README.md")
    ]);

    expect(result.created.sort()).toEqual(
      [
        paths.configFile,
        paths.configExampleFile,
        paths.readmeFile,
        ...skillFiles
      ].sort()
    );
    await expect(access(paths.configFile, constants.F_OK)).resolves.toBeUndefined();
    await expect(access(paths.readmeFile, constants.F_OK)).resolves.toBeUndefined();
    await Promise.all(skillFiles.map(async (filePath) => {
      await expect(access(filePath, constants.F_OK)).resolves.toBeUndefined();
    }));
    await Promise.all(paths.skillInstallDirs.map(async (skillDir) => {
      await expect(access(path.join(skillDir, "AGENTS.md"), constants.F_OK)).rejects.toMatchObject({ code: "ENOENT" });
    }));
    expect(await readFile(paths.configFile, "utf8")).toContain('"defaultModel": "openai/gpt-image-1.5"');
    expect(await readFile(paths.configFile, "utf8")).toContain('"api_key": ["YOUR_OPENAI_API_KEY"]');
    expect(await readFile(paths.readmeFile, "utf8")).toContain("config.json");
    expect(await readFile(path.join(paths.skillInstallDirs[0], "SKILL.md"), "utf8")).toContain("If this skill is missing or unavailable");
    expect(await readFile(path.join(paths.skillInstallDirs[0], "README.md"), "utf8")).toContain("image config init");
  });

  test("fills missing files inside an existing .image directory without overwriting existing managed files", async () => {
    const homeDir = await makeTempHome("image-cli-init-existing");
    const paths = getImageConfigPaths(homeDir);
    const firstSkillDir = paths.skillInstallDirs[0];
    const firstSkillFile = path.join(firstSkillDir, "SKILL.md");
    await mkdir(paths.configDir, { recursive: true });
    await mkdir(firstSkillDir, { recursive: true });
    await writeFile(paths.configFile, '{"version":1,"defaultModel":"openai/gpt-image-1.5","providers":{}}');
    await writeFile(paths.readmeFile, "old readme");
    await writeFile(firstSkillFile, "custom skill");

    const result = await initImageConfigDirectory({ homeDir });
    const skillFiles = paths.skillInstallDirs.flatMap((skillDir) => [
      path.join(skillDir, "SKILL.md"),
      path.join(skillDir, "README.md")
    ]);

    expect(result.skipped).toContain(paths.configFile);
    expect(result.skipped).toContain(paths.readmeFile);
    expect(result.skipped).toContain(firstSkillFile);
    expect(result.created).toContain(paths.configExampleFile);
    expect(result.created).toEqual(
      expect.arrayContaining(skillFiles.filter((filePath) => filePath !== firstSkillFile))
    );
    for (const skillDir of paths.skillInstallDirs) {
      expect(result.created).not.toContain(path.join(skillDir, "AGENTS.md"));
      await expect(access(path.join(skillDir, "AGENTS.md"), constants.F_OK)).rejects.toMatchObject({ code: "ENOENT" });
    }
    expect(await readFile(paths.readmeFile, "utf8")).toBe("old readme");
    expect(await readFile(firstSkillFile, "utf8")).toBe("custom skill");
  });

  test("overwrites all managed files when --force is used", async () => {
    const homeDir = await makeTempHome("image-cli-init-force");
    const paths = getImageConfigPaths(homeDir);
    await mkdir(paths.configDir, { recursive: true });
    await mkdir(paths.skillInstallDirs[1], { recursive: true });
    await writeFile(paths.configFile, '{"version":1,"defaultModel":"old/provider","providers":{}}');
    await writeFile(paths.readmeFile, "old readme");
    await writeFile(path.join(paths.skillInstallDirs[1], "SKILL.md"), "old skill");
    await writeFile(path.join(paths.skillInstallDirs[1], "README.md"), "old install readme");

    const result = await initImageConfigDirectory({ homeDir, force: true });

    expect(result.created).toContain(paths.configFile);
    expect(result.created).toContain(paths.readmeFile);
    expect(result.created).toContain(path.join(paths.skillInstallDirs[1], "SKILL.md"));
    expect(result.created).toContain(path.join(paths.skillInstallDirs[1], "README.md"));
    for (const skillDir of paths.skillInstallDirs) {
      expect(result.created).not.toContain(path.join(skillDir, "AGENTS.md"));
      await expect(access(path.join(skillDir, "AGENTS.md"), constants.F_OK)).rejects.toMatchObject({ code: "ENOENT" });
    }
    expect(await readFile(paths.configFile, "utf8")).toContain('"defaultModel": "openai/gpt-image-1.5"');
    expect(await readFile(paths.readmeFile, "utf8")).toContain("config.json");
    expect(await readFile(path.join(paths.skillInstallDirs[1], "SKILL.md"), "utf8")).toContain("If this skill is missing or unavailable");
    expect(await readFile(path.join(paths.skillInstallDirs[1], "README.md"), "utf8")).toContain("image config init");
  });
});

async function makeTempHome(prefix: string): Promise<string> {
  const baseDir = path.join(tmpdir(), prefix, `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(baseDir, { recursive: true });
  return baseDir;
}
