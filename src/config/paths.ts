import path from "node:path";

import type { ImageConfigPaths } from "./types.js";

export function getImageConfigPaths(homeDir: string): ImageConfigPaths {
  const configDir = path.join(homeDir, ".image");
  return {
    configDir,
    configFile: path.join(configDir, "config.json"),
    envFile: path.join(configDir, ".env"),
    envExampleFile: path.join(configDir, ".env.example"),
    gitignoreFile: path.join(configDir, ".gitignore"),
    configExampleFile: path.join(configDir, "config.example.jsonc")
  };
}
