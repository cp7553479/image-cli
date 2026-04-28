import path from "node:path";

import type { ImageConfigPaths } from "./types.js";

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
