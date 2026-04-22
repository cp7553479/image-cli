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
    .showHelpAfterError();

  program
    .command("generate")
    .argument("<prompt>", "generation prompt")
    .description("Generate one or more images.")
    .requiredOption("--model <provider/model>", "provider_id/model_id")
    .option("--size <preset|WIDTHxHEIGHT>", "size preset like 2k or explicit dimensions")
    .option("--aspect <ratio>", "aspect ratio such as 1:1 or 16:9")
    .option("--n <count>", "number of images")
    .option("--image <pathOrUrl>", "reference image path or URL", collectOption, [])
    .option("--quality <value>", "provider quality hint")
    .option("--format <png|jpeg|webp>", "output format")
    .option("--background <auto|opaque|transparent>", "background mode")
    .option("--negative-prompt <text>", "negative prompt")
    .option("--seed <integer>", "seed")
    .option("--stream", "enable provider streaming when supported")
    .option("--output-dir <path>", "directory for saved outputs")
    .option("--json", "print JSON manifest")
    .option("--extra <json>", "provider-specific JSON object")
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
        negativePrompt: options.negativePrompt,
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

  const configCommand = program
    .command("config")
    .description("Manage ~/.image configuration.");

  configCommand
    .command("init")
    .description("Create ~/.image config and template files.")
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
    .description("Show configuration paths.")
    .action(() => {
      process.stdout.write(`${JSON.stringify(getImageConfigPaths(os.homedir()), null, 2)}\n`);
    });

  configCommand
    .command("show")
    .description("Show sanitized resolved configuration.")
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
    .description("Run configuration diagnostics.")
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
    .description("List built-in providers and aliases.")
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

  return program;
}

function collectOption(value: string, previous: string[]): string[] {
  return [...previous, value];
}
