import { readFile } from "node:fs/promises";

import { describe, expect, test } from "vitest";

async function readJson(path: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
}

describe("package boundary", () => {
  test("prepack verifies check, lint, tests, and production build", async () => {
    const packageJson = await readJson("package.json");
    const scripts = packageJson.scripts as Record<string, string>;

    expect(scripts.prepack).toBe("npm run verify");
    expect(scripts.verify).toContain("npm run check");
    expect(scripts.verify).toContain("npm run lint");
    expect(scripts.verify).toContain("npm test");
    expect(scripts.verify).toContain("npm run build");
  });

  test("production build excludes tests and vitest config", async () => {
    const packageJson = await readJson("package.json");
    const scripts = packageJson.scripts as Record<string, string>;
    const buildConfig = await readJson("tsconfig.build.json");

    expect(scripts.build).toContain("tsconfig.build.json");
    expect(scripts.build).toContain("npm run clean");
    expect(buildConfig.include).toEqual(["src/**/*.ts"]);
    expect(buildConfig.exclude).toEqual(
      expect.arrayContaining(["test", "vitest.config.ts"])
    );
    expect((buildConfig.compilerOptions as Record<string, unknown>).types).toEqual(
      ["node"]
    );
  });

  test("published files include README link targets", async () => {
    const packageJson = await readJson("package.json");

    expect(packageJson.files).toEqual(
      expect.arrayContaining(["docs", "README_CN.md", "plugins/PLUGINS_README.md"])
    );
    expect(packageJson.files).not.toContain("templates");
  });

  test("published runtime has no third-party dependencies", async () => {
    const packageJson = await readJson("package.json");

    expect(packageJson.dependencies).toBeUndefined();
  });
});
