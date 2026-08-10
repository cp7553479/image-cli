import os from "node:os";

import { runConfigDoctor } from "../config/doctor.js";
import { initImageConfigDirectory } from "../config/init.js";
import { getImageConfigPaths } from "../config/paths.js";
import { getSanitizedResolvedConfig } from "../config/show.js";
import type { ImageConfigPaths } from "../config/types.js";
import { loadPluginManifests } from "../plugins/loader.js";
import { PROVIDER_CATALOG } from "../providers/catalog.js";
import {
  formatConfiguredProvidersText,
  formatProviderModelsText,
  listConfiguredProviders,
  listProviderModels
} from "../providers/model-list.js";
import { buildGenerateRequest } from "../protocol/generate-request.js";
import { resolveDefaultModel, runGenerateRequest } from "../runtime/generate.js";
import {
  BaseCliProgram,
  CliCommandNode,
  CLI_PARSE,
  CliUsageError
} from "./core.js";
import { CLI_HELP, CLI_OPTIONS } from "./help.js";

class ImageCliProgram extends BaseCliProgram {
  protected async run(args: string[]): Promise<void> {
    if (args.length === 0) {
      this.writeHelp(CLI_HELP.root, 1);
      return;
    }

    const [command, ...rest] = args;
    if (CLI_PARSE.isHelpToken(command)) {
      this.writeHelp(CLI_HELP.root, 0);
      return;
    }

    if (command === "help") {
      this.runHelp(rest);
      return;
    }

    if (command === "generate") {
      await this.runGenerate(rest);
      return;
    }

    if (command === "config") {
      await this.runConfig(rest);
      return;
    }

    if (command === "provider") {
      await this.runProvider(rest);
      return;
    }

    throw new CliUsageError(`unknown command '${command}'`, CLI_HELP.root);
  }

  private runHelp(args: string[]): void {
    const target = findHelpTarget(args);
    if (!target) {
      throw new CliUsageError(`unknown help topic '${args.join(" ")}'`, CLI_HELP.root);
    }
    this.writeHelp(target.helpInformation(), 0);
  }

  private async runGenerate(args: string[]): Promise<void> {
    const parsed = CLI_PARSE.parseCliArgs(args, CLI_OPTIONS.generate, CLI_HELP.generate);
    if (CLI_PARSE.isHelpRequested(parsed)) {
      this.writeHelp(CLI_HELP.generate, 0);
      return;
    }

    if (parsed.positionals.length === 0) {
      throw new CliUsageError("missing required argument 'prompt'", CLI_HELP.generate);
    }

    const prompt = parsed.positionals.join(" ");
    const values = parsed.values;
    const defaultModel = values.model
      ? undefined
      : await resolveDefaultModel().catch(() => undefined);
    const request = buildGenerateRequest(prompt, {
      model: CLI_PARSE.stringValue(values.model),
      size: CLI_PARSE.stringValue(values.size),
      n: CLI_PARSE.stringValue(values.n),
      quality: CLI_PARSE.stringValue(values.quality),
      background: CLI_PARSE.stringValue(values.background),
      output_format: CLI_PARSE.stringValue(values["output-format"]),
      output_compression: CLI_PARSE.stringValue(values["output-compression"]),
      moderation: CLI_PARSE.stringValue(values.moderation),
      response_format: CLI_PARSE.stringValue(values["response-format"]),
      stream: Boolean(values.stream),
      partial_images: CLI_PARSE.stringValue(values["partial-images"]),
      style: CLI_PARSE.stringValue(values.style),
      user: CLI_PARSE.stringValue(values.user),
      extra: CLI_PARSE.stringValue(values.extra),
      outputDir: CLI_PARSE.stringValue(values["output-dir"]),
      json: Boolean(values.json)
    }, {
      defaultModel
    });

    const manifest = await runGenerateRequest(request);
    if (values.json) {
      this.output.writeOut(`${JSON.stringify(manifest, null, 2)}\n`);
      return;
    }

    this.output.writeOut(formatGenerateTextOutput(manifest));
  }

  private async runConfig(args: string[]): Promise<void> {
    if (args.length === 0) {
      this.writeHelp(CLI_HELP.config, 1);
      return;
    }

    const [subcommand, ...rest] = args;
    if (CLI_PARSE.isHelpToken(subcommand)) {
      this.writeHelp(CLI_HELP.config, 0);
      return;
    }

    if (subcommand === "help") {
      this.runHelp(["config", ...rest]);
      return;
    }

    if (subcommand === "init") {
      await this.runConfigInit(rest);
      return;
    }

    if (subcommand === "path") {
      this.runConfigPath(rest);
      return;
    }

    if (subcommand === "show") {
      await this.runConfigShow(rest);
      return;
    }

    if (subcommand === "doctor") {
      await this.runConfigDoctor(rest);
      return;
    }

    if (subcommand === "providers") {
      this.runConfigProviders(rest);
      return;
    }

    throw new CliUsageError(`unknown command 'config ${subcommand}'`, CLI_HELP.config);
  }

  private async runConfigInit(args: string[]): Promise<void> {
    const parsed = CLI_PARSE.parseCliArgs(args, CLI_OPTIONS.force, CLI_HELP.configInit);
    if (CLI_PARSE.isHelpRequested(parsed)) {
      this.writeHelp(CLI_HELP.configInit, 0);
      return;
    }
    CLI_PARSE.ensureNoPositionals(parsed, CLI_HELP.configInit);

    const result = await initImageConfigDirectory({
      force: Boolean(parsed.values.force)
    });
    this.output.writeOut(`Created:\n`);
    for (const filePath of result.created) {
      this.output.writeOut(`${filePath}\n`);
    }
    if (result.skipped.length > 0) {
      this.output.writeOut(`Skipped:\n`);
      for (const filePath of result.skipped) {
        this.output.writeOut(`${filePath}\n`);
      }
    }
  }

  private runConfigPath(args: string[]): void {
    const parsed = CLI_PARSE.parseCliArgs(args, CLI_OPTIONS.help, CLI_HELP.configPath);
    if (CLI_PARSE.isHelpRequested(parsed)) {
      this.writeHelp(CLI_HELP.configPath, 0);
      return;
    }
    CLI_PARSE.ensureNoPositionals(parsed, CLI_HELP.configPath);
    this.output.writeOut(formatConfigPathText(getImageConfigPaths(os.homedir())));
  }

  private async runConfigShow(args: string[]): Promise<void> {
    const parsed = CLI_PARSE.parseCliArgs(args, CLI_OPTIONS.json, CLI_HELP.configShow);
    if (CLI_PARSE.isHelpRequested(parsed)) {
      this.writeHelp(CLI_HELP.configShow, 0);
      return;
    }
    CLI_PARSE.ensureNoPositionals(parsed, CLI_HELP.configShow);
    const data = await getSanitizedResolvedConfig();
    if (!parsed.values.json) {
      this.output.writeOut(formatConfigShowText(data));
      return;
    }
    this.output.writeOut(`${JSON.stringify(data, null, 2)}\n`);
  }

  private async runConfigDoctor(args: string[]): Promise<void> {
    const parsed = CLI_PARSE.parseCliArgs(args, CLI_OPTIONS.json, CLI_HELP.configDoctor);
    if (CLI_PARSE.isHelpRequested(parsed)) {
      this.writeHelp(CLI_HELP.configDoctor, 0);
      return;
    }
    CLI_PARSE.ensureNoPositionals(parsed, CLI_HELP.configDoctor);
    const report = await runConfigDoctor();
    if (!parsed.values.json) {
      this.output.writeOut(formatConfigDoctorText(report));
      return;
    }
    this.output.writeOut(`${JSON.stringify(report, null, 2)}\n`);
  }

  private runConfigProviders(args: string[]): void {
    const parsed = CLI_PARSE.parseCliArgs(args, CLI_OPTIONS.json, CLI_HELP.configProviders);
    if (CLI_PARSE.isHelpRequested(parsed)) {
      this.writeHelp(CLI_HELP.configProviders, 0);
      return;
    }
    CLI_PARSE.ensureNoPositionals(parsed, CLI_HELP.configProviders);

    const providers = listProviderDefinitions();
    if (parsed.values.json) {
      this.output.writeOut(`${JSON.stringify(providers, null, 2)}\n`);
      return;
    }
    for (const provider of providers) {
      const aliases = provider.aliases.length > 0 ? ` aliases=${provider.aliases.join(",")}` : "";
      this.output.writeOut(`${provider.providerId}${aliases}\n`);
    }
  }

  private async runProvider(args: string[]): Promise<void> {
    if (args.length === 0) {
      this.writeHelp(CLI_HELP.provider, 1);
      return;
    }

    const [subcommand, ...rest] = args;
    if (CLI_PARSE.isHelpToken(subcommand)) {
      this.writeHelp(CLI_HELP.provider, 0);
      return;
    }

    if (subcommand === "help") {
      this.runHelp(["provider", ...rest]);
      return;
    }

    if (subcommand === "list") {
      await this.runProviderList(rest);
      return;
    }

    if (subcommand === "model") {
      throw new CliUsageError(
        "unknown command 'provider model'. Use 'image provider <provider-id> model list'.",
        CLI_HELP.provider
      );
    }

    await this.runProviderTarget(subcommand, rest);
  }

  private async runProviderList(args: string[]): Promise<void> {
    const parsed = CLI_PARSE.parseCliArgs(args, CLI_OPTIONS.json, CLI_HELP.providerList);
    if (CLI_PARSE.isHelpRequested(parsed)) {
      this.writeHelp(CLI_HELP.providerList, 0);
      return;
    }
    CLI_PARSE.ensureNoPositionals(parsed, CLI_HELP.providerList);

    const providers = await listConfiguredProviders();
    if (parsed.values.json) {
      this.output.writeOut(`${JSON.stringify(providers, null, 2)}\n`);
      return;
    }
    this.output.writeOut(formatConfiguredProvidersText(providers));
  }

  private async runProviderTarget(providerId: string, args: string[]): Promise<void> {
    if (args.length === 0) {
      this.writeHelp(CLI_HELP.providerTarget, 1);
      return;
    }

    const [subcommand, ...rest] = args;
    if (CLI_PARSE.isHelpToken(subcommand)) {
      this.writeHelp(CLI_HELP.providerTarget, 0);
      return;
    }

    if (subcommand === "help") {
      this.runProviderTargetHelp(rest);
      return;
    }

    if (subcommand !== "model") {
      throw new CliUsageError(
        `unknown command 'provider ${providerId} ${subcommand}'`,
        CLI_HELP.providerTarget
      );
    }

    await this.runProviderTargetModel(providerId, rest);
  }

  private runProviderTargetHelp(args: string[]): void {
    if (args.length === 0) {
      this.writeHelp(CLI_HELP.providerTarget, 0);
      return;
    }

    if (args[0] === "model") {
      if (args.length === 1) {
        this.writeHelp(CLI_HELP.providerTargetModel, 0);
        return;
      }
      if (args.length === 2 && args[1] === "list") {
        this.writeHelp(CLI_HELP.providerTargetModelList, 0);
        return;
      }
    }

    throw new CliUsageError(
      `unknown help topic 'provider <provider-id> ${args.join(" ")}'`,
      CLI_HELP.providerTarget
    );
  }

  private async runProviderTargetModel(providerId: string, args: string[]): Promise<void> {
    if (args.length === 0) {
      this.writeHelp(CLI_HELP.providerTargetModel, 1);
      return;
    }

    const [subcommand, ...rest] = args;
    if (CLI_PARSE.isHelpToken(subcommand)) {
      this.writeHelp(CLI_HELP.providerTargetModel, 0);
      return;
    }

    if (subcommand === "help") {
      if (rest.length === 0) {
        this.writeHelp(CLI_HELP.providerTargetModel, 0);
        return;
      }
      if (rest.length === 1 && rest[0] === "list") {
        this.writeHelp(CLI_HELP.providerTargetModelList, 0);
        return;
      }
      throw new CliUsageError(
        `unknown help topic 'provider <provider-id> model ${rest.join(" ")}'`,
        CLI_HELP.providerTargetModel
      );
    }

    if (subcommand !== "list") {
      throw new CliUsageError(
        `unknown command 'provider ${providerId} model ${subcommand}'`,
        CLI_HELP.providerTargetModel
      );
    }

    await this.runProviderTargetModelList(providerId, rest);
  }

  private async runProviderTargetModelList(providerId: string, args: string[]): Promise<void> {
    const parsed = CLI_PARSE.parseCliArgs(args, CLI_OPTIONS.modelList, CLI_HELP.providerTargetModelList);
    if (CLI_PARSE.isHelpRequested(parsed)) {
      this.writeHelp(CLI_HELP.providerTargetModelList, 0);
      return;
    }
    CLI_PARSE.ensureNoPositionals(parsed, CLI_HELP.providerTargetModelList);

    const result = await listProviderModels(providerId, {
      limit: parsePositiveIntegerOption(CLI_PARSE.stringValue(parsed.values.limit))
    });
    if (parsed.values.json) {
      this.output.writeOut(`${JSON.stringify(result, null, 2)}\n`);
      return;
    }
    this.output.writeOut(formatProviderModelsText(result));
  }
}

/**
 * Builds the CLI program using only Node built-ins for parsing.
 */
export function buildProgram(): ImageCliProgram {
  const providerModelCommand = new CliCommandNode("model", CLI_HELP.providerTargetModel, [
    new CliCommandNode("list", CLI_HELP.providerTargetModelList)
  ]);
  const providerCommand = new CliCommandNode("provider", CLI_HELP.provider, [
    new CliCommandNode("list", CLI_HELP.providerList),
    new CliCommandNode("<provider-id>", CLI_HELP.providerTarget, [
      providerModelCommand
    ])
  ]);
  const configCommand = new CliCommandNode("config", CLI_HELP.config, [
    new CliCommandNode("init", CLI_HELP.configInit),
    new CliCommandNode("path", CLI_HELP.configPath),
    new CliCommandNode("show", CLI_HELP.configShow),
    new CliCommandNode("doctor", CLI_HELP.configDoctor),
    new CliCommandNode("providers", CLI_HELP.configProviders)
  ]);

  return new ImageCliProgram("image", CLI_HELP.root, [
    new CliCommandNode("generate", CLI_HELP.generate),
    configCommand,
    providerCommand
  ]);
}

/**
 * Formats the default generate text output for agent callers.
 */
export function formatGenerateTextOutput(input: {
  files: string[];
  manifestPath: string;
  warnings: string[];
}): string {
  return [
    ...input.files,
    `manifest: ${input.manifestPath}`,
    ...input.warnings.map((warning) => `warning: ${warning}`)
  ].join("\n") + "\n";
}

/**
 * Formats config paths for default human-readable output.
 */
export function formatConfigPathText(paths: ImageConfigPaths): string {
  return [
    `configDir: ${paths.configDir}`,
    `config: ${paths.configFile}`,
    `example: ${paths.configExampleFile}`,
    `readme: ${paths.readmeFile}`,
    ...paths.skillInstallDirs.map((dir) => `skill: ${dir}`)
  ].join("\n") + "\n";
}

/**
 * Formats sanitized config for default human-readable output.
 */
export function formatConfigShowText(input: Record<string, unknown>): string {
  const providers = isRecord(input.providers) ? input.providers : {};
  return [
    `default=${String(input.defaultModel ?? "")}`,
    ...Object.entries(providers).map(([providerId, provider]) => {
      const providerData = isRecord(provider) ? provider : {};
      const credentials = Array.isArray(providerData.credentials) ? providerData.credentials.length : 0;
      return [
        providerId,
        providerData.enabled === false ? "disabled" : undefined,
        `credentials=${credentials}`,
        typeof providerData.apiBaseUrl === "string" ? `baseUrl=${providerData.apiBaseUrl}` : undefined
      ].filter(Boolean).join(" ");
    })
  ].join("\n") + "\n";
}

/**
 * Formats config doctor results for default human-readable output.
 */
export function formatConfigDoctorText(input: Record<string, unknown>): string {
  const lines = [
    `config=${status(Boolean(input.configExists))}`,
    `readme=${status(Boolean(input.readmeExists))}`,
    `curl=${status(Boolean(input.curlAvailable))}`
  ];
  if (typeof input.configError === "string" && input.configError.length > 0) {
    lines.push(`error: ${input.configError}`);
    return lines.join("\n") + "\n";
  }

  const resolvedConfig = isRecord(input.resolvedConfig) ? input.resolvedConfig : {};
  if (typeof resolvedConfig.defaultModel === "string") {
    lines.push(`default=${resolvedConfig.defaultModel}`);
  }

  const providers = isRecord(resolvedConfig.providers) ? resolvedConfig.providers : {};
  for (const [providerId, provider] of Object.entries(providers)) {
    const providerData = isRecord(provider) ? provider : {};
    lines.push([
      providerId,
      providerData.enabled === false ? "disabled" : undefined,
      `credentials=${String(providerData.credentialCount ?? 0)}`
    ].filter(Boolean).join(" "));
  }
  return lines.join("\n") + "\n";
}

function findHelpTarget(args: string[]): CliCommandNode | undefined {
  const program = buildProgram();
  if (args.length === 0) {
    return program;
  }

  let current: CliCommandNode | undefined = program;
  for (const name of args) {
    current = current.commands.find((command) =>
      command.name() === name || isPlaceholderCommand(command)
    );
    if (!current) {
      return undefined;
    }
  }
  return current;
}

function isPlaceholderCommand(command: CliCommandNode): boolean {
  return command.name().startsWith("<") && command.name().endsWith(">");
}

function listProviderDefinitions(): Array<{
  providerId: string;
  aliases: string[];
  defaultBaseUrl: string;
  description: string;
}> {
  const pluginEntries = loadPluginManifests().map((manifest) => ({
    providerId: manifest.providerId,
    aliases: manifest.aliases ?? [],
    defaultBaseUrl: "plugin-defined",
    description: manifest.description ?? "Local plugin provider"
  }));
  const builtInEntries = PROVIDER_CATALOG.map((provider) => ({
    providerId: provider.providerId,
    aliases: [...provider.aliases],
    defaultBaseUrl: provider.defaultBaseUrl,
    description: provider.description
  }));
  return [...builtInEntries, ...pluginEntries];
}

function parsePositiveIntegerOption(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new CliUsageError(
      `Expected a positive integer, got "${value}".`,
      CLI_HELP.providerTargetModelList
    );
  }
  return parsed;
}

function status(value: boolean): "ok" | "missing" {
  return value ? "ok" : "missing";
}

/**
 * Checks whether an unknown value is a plain record for formatter reads.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
