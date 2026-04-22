import { readdirSync, existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import type { FailureClassification, GenerateResult, ProviderPlugin } from "../providers/types.js";
import type { CurlExecutionResult } from "../transport/curl.js";
import type { PluginAction, ProviderPluginManifest } from "./types.js";

export function loadPluginManifests(homeDir: string = os.homedir()): ProviderPluginManifest[] {
  const pluginsDir = path.join(homeDir, ".image", "plugins");
  if (!existsSync(pluginsDir)) {
    return [];
  }

  return readdirSync(pluginsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      const manifestPath = path.join(pluginsDir, entry.name, "plugin.json");
      if (!existsSync(manifestPath)) {
        return [];
      }

      const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as ProviderPluginManifest;
      return [
        {
          ...manifest,
          entry: path.resolve(path.dirname(manifestPath), manifest.entry)
        }
      ];
    });
}

export function createPluginProvider(
  manifest: ProviderPluginManifest
): ProviderPlugin {
  return {
    providerId: manifest.providerId,
    aliases: manifest.aliases ?? [],
    capabilities: {
      generate: true,
      edit: false,
      inputImages: false,
      asyncTasks: false,
      streaming: false,
      background: false,
      negativePrompt: false,
      multipleOutputs: false,
      transparentOutput: false,
      ...(manifest.capabilities ?? {})
    },
    async buildGenerateOperation(input) {
      return await runPluginAction(manifest, "build-generate", input);
    },
    async parseGenerateResponse(result, input) {
      return await runPluginAction<GenerateResult>(manifest, "parse-generate", {
        result,
        input
      });
    },
    classifyFailure(context) {
      return {
        kind: "unknown",
        reason: `Plugin provider "${manifest.providerId}" classify-failure requires async execution.`
      } satisfies FailureClassification;
    }
  };
}

export function findPluginProvider(
  providerId: string,
  homeDir?: string
): ProviderPlugin | undefined {
  const manifest = loadPluginManifests(homeDir).find((entry) => entry.providerId === providerId);
  return manifest ? createPluginProvider(manifest) : undefined;
}

async function runPluginAction<T = unknown>(
  manifest: ProviderPluginManifest,
  action: PluginAction,
  payload: unknown
): Promise<T> {
  const args = buildPluginArgs(manifest, action);
  const stdout = await runProcess(args.command, args.args, payload);
  return JSON.parse(stdout) as T;
}

function buildPluginArgs(manifest: ProviderPluginManifest, action: PluginAction): {
  command: string;
  args: string[];
} {
  const runtime = manifest.runtime ?? "node";
  if (runtime === "node") {
    return {
      command: "node",
      args: [manifest.entry, "--action", action, "--input-stdin"]
    };
  }
  if (runtime === "python") {
    return {
      command: "python3",
      args: [manifest.entry, "--action", action, "--input-stdin"]
    };
  }
  return {
    command: manifest.entry,
    args: ["--action", action, "--input-stdin"]
  };
}

async function runProcess(
  command: string,
  args: string[],
  payload: unknown
): Promise<string> {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["pipe", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `${command} exited with code ${code ?? -1}`));
        return;
      }
      resolve(stdout);
    });

    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
}

export function makeAsyncPluginFailureClassification(providerId: string): FailureClassification {
  return {
    kind: "unknown",
    reason: `Plugin provider "${providerId}" does not support synchronous classifyFailure.`
  };
}
