import os from "node:os";
import path from "node:path";

import type { ImageConfigPaths } from "./types.js";

/**
 * getImageConfigPaths 的导出入口。
 */
export function getImageConfigPaths(homeDir: string): ImageConfigPaths {
  const configDir = path.join(homeDir, ".image");
  return {
    configDir,
    configFile: path.join(configDir, "config.json"),
    configExampleFile: path.join(configDir, "config.example.jsonc"),
    readmeFile: path.join(configDir, "README.md"),
    skillInstallDirs: [
      path.join(configDir, "skills", "image-cli"),
      path.join(homeDir, ".claude", "skills", "image-cli"),
      path.join(homeDir, ".agents", "skills", "image-cli"),
      path.join(homeDir, ".codex", "skills", "image-cli"),
      path.join(homeDir, "antigravity", "skills", "image-cli")
    ]
  };
}

/**
 * 返回统一的工作临时目录 ~/.image/.temp/。
 * 下载的参考图等中间产物在用户未显式指定目录时统一存放于此。
 */
export function getImageTempDir(homeDir: string = os.homedir()): string {
  return path.join(homeDir, ".image", ".temp");
}
