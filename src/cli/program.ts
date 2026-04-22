import { Command } from "commander";
import os from "node:os";

import { initImageConfigDirectory } from "../config/init.js";
import { getImageConfigPaths } from "../config/paths.js";
import { getSanitizedResolvedConfig } from "../config/show.js";
import { runConfigDoctor } from "../config/doctor.js";
import { PROVIDER_CATALOG } from "../providers/catalog.js";
import { buildGenerateRequest } from "../protocol/generate-request.js";
import { runGenerateRequest } from "../runtime/generate.js";

export function buildProgram(): Command {
  const program = new Command();
  program
    .name("image")
    .description("Unified image generation CLI with provider plugins.")
    .showHelpAfterError()
    .configureHelp({
      subcommandTerm: (command) => {
        if (command.name() === "generate") {
          return "generate <prompt>";
        }
        return command.name();
      }
    })
    .addHelpText(
      "after",
      `
Examples:
  image config init
  image config providers
  image generate "A cinematic fox poster" --model openai/gpt-image-1.5 --size 2k --aspect 16:9
  image generate "High-energy milk tea battle poster" --model seedream/doubao-seedream-4-5-251128 --size 2k --aspect 16:9

Use "image <command> --help" for full command details.
`
    );

  const generateCommand = program
    .command("generate")
    .argument("<prompt>", "generation prompt")
    .description("Generate one or more images.")
    .usage("<prompt>")
    .summary("Generate images from a prompt.")
    .configureHelp({
      commandUsage: () => "image generate <prompt>"
    })
    .requiredOption("--model <provider/model>", "provider_id/model_id")
    .option("--size <preset|WIDTHxHEIGHT>", "size preset (`2k`, `4k`) or explicit dimensions (`WIDTHxHEIGHT`)")
    .option("--aspect <ratio>", "target aspect ratio: 1:1, 4:3, 3:4, 16:9, 9:16, 3:2, 2:3, 21:9")
    .option("--n <count>", "number of output images requested")
    .option("--image <pathOrUrl>", "reference image path or URL; repeatable", collectOption, [])
    .option("--quality <value>", "provider-native quality hint when supported")
    .option("--format <png|jpeg|webp>", "preferred output format when supported")
    .option("--background <auto|opaque|transparent>", "background mode for providers that support transparency")
    .option("--seed <integer>", "deterministic seed when supported")
    .option("--stream", "enable provider streaming when supported")
    .option("--output-dir <path>", "directory for saved outputs; default is ./image-output/<timestamp>/")
    .option("--json", "print JSON manifest instead of plain-text summary")
    .option("--extra <json>", "provider-specific JSON object; use this for provider-only fields such as Qwen negative_prompt")
    .action(async (prompt, options) => {
      const request = buildGenerateRequest(prompt, {
        model: options.model,
        size: options.size,
        aspect: options.aspect,
        n: options.n,
        image: options.image,
        quality: options.quality,
        format: options.format,
        background: options.background,
        seed: options.seed,
        stream: options.stream,
        outputDir: options.outputDir,
        json: options.json,
        extra: options.extra
      });

      const manifest = await runGenerateRequest(request);
      if (options.json) {
        process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
        return;
      }

      process.stdout.write(`Saved ${manifest.files.length} file(s).\n`);
      process.stdout.write(`Manifest: ${manifest.manifestPath}\n`);
      for (const file of manifest.files) {
        process.stdout.write(`${file}\n`);
      }
      if (manifest.warnings.length > 0) {
        process.stdout.write(`Warnings:\n`);
        for (const warning of manifest.warnings) {
          process.stdout.write(`- ${warning}\n`);
        }
      }
    });

  generateCommand.addHelpText(
    "after",
    `
Provider coverage:
  --model           required for all providers
  --size            normalized by the CLI, then mapped per provider
  --aspect          normalized by the CLI, then mapped per provider
  --n               supported by some providers; others may clamp or ignore it
  --image           used for reference-image capable providers
  --quality         provider-specific
  --format          provider-specific
  --background      mainly useful for OpenAI-style image APIs
  --seed            provider-specific
  --stream          provider-specific
  --extra           required for provider-only parameters not standardized by the CLI

Examples:
  image generate "Studio mug product shot" --model seedream/doubao-seedream-4-5-251128 --size 2k
  image generate "Launch poster" --model openrouter/google/gemini-3.1-flash-image-preview --size 4k --aspect 16:9
  image generate "Qwen scene" --model qwen/qwen-image-2.0-pro --extra '{"negative_prompt":"low quality, blurry"}'
`
  );

  const configCommand = program
    .command("config")
    .description("Manage ~/.image configuration.")
    .summary("Manage local config.");

  configCommand
    .command("init")
    .description("Create ~/.image config files without overwriting existing config.json.")
    .action(async () => {
      const result = await initImageConfigDirectory();
      process.stdout.write(`Created:\n`);
      for (const filePath of result.created) {
        process.stdout.write(`${filePath}\n`);
      }
      if (result.skipped.length > 0) {
        process.stdout.write(`Skipped:\n`);
        for (const filePath of result.skipped) {
          process.stdout.write(`${filePath}\n`);
        }
      }
    });

  configCommand
    .command("path")
    .description("Show the paths used under ~/.image.")
    .action(() => {
      process.stdout.write(`${JSON.stringify(getImageConfigPaths(os.homedir()), null, 2)}\n`);
    });

  configCommand
    .command("show")
    .description("Show sanitized resolved configuration with secrets redacted.")
    .option("--json", "print JSON output")
    .action(async (options) => {
      const data = await getSanitizedResolvedConfig();
      if (options.json) {
        process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
        return;
      }
      process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
    });

  configCommand
    .command("doctor")
    .description("Run configuration diagnostics and credential presence checks.")
    .option("--json", "print JSON output")
    .action(async (options) => {
      const report = await runConfigDoctor();
      if (options.json) {
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
        return;
      }
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    });

  configCommand
    .command("providers")
    .description("List built-in providers, aliases, and default base URLs.")
    .option("--json", "print JSON output")
    .action((options) => {
      if (options.json) {
        process.stdout.write(`${JSON.stringify(PROVIDER_CATALOG, null, 2)}\n`);
        return;
      }
      for (const provider of PROVIDER_CATALOG) {
        process.stdout.write(
          `${provider.providerId}: ${provider.description} [aliases: ${provider.aliases.join(", ") || "none"}]\n`
        );
      }
    });

  configCommand.addHelpText(
    "after",
    `
Subcommands:
  init       create ~/.image/config.json if missing, refresh ~/.image/README.md
  path       print the config file paths used by the CLI
  show       print sanitized config with api_key presence only
  doctor     verify config files, curl availability, and credential counts
  providers  list built-in provider ids, aliases, and descriptions
`
  );

  return program;
}

function collectOption(value: string, previous: string[]): string[] {
  return [...previous, value];
}
