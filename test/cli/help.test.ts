import { describe, expect, test } from "vitest";

import {
  buildProgram,
  formatConfigDoctorText,
  formatConfigPathText,
  formatConfigShowText,
  formatGenerateTextOutput
} from "../../src/cli/program.js";

describe("CLI help", () => {
  test("documents root commands", () => {
    const program = buildProgram();
    const help = program.helpInformation();

    expect(help).toContain("image");
    expect(help).toContain("generate <prompt>");
    expect(help).toContain("config");
    expect(help).toContain("provider");
    expect(help).toContain("Commands:");
  });

  test("documents generate options", () => {
    const program = buildProgram();
    const generateHelp = program.commands.find((command) => command.name() === "generate")?.helpInformation();

    expect(generateHelp).toContain("--model <provider/model>");
    expect(generateHelp).toContain("--size <auto|WIDTHxHEIGHT>");
    expect(generateHelp).toContain("--output-format <png|jpeg|webp>");
    expect(generateHelp).toContain("--output-compression <0-100>");
    expect(generateHelp).toContain("--response-format <url|b64_json>");
    expect(generateHelp).toContain("--extra <json>");
    expect(generateHelp).toContain("print JSON manifest");
    expect(generateHelp).toContain("Usage: image generate <prompt>");
    expect(generateHelp).toContain("config.defaultModel");
    expect(generateHelp).not.toContain("Provider coverage:");
    expect(generateHelp).not.toContain("Routing:");
  });

  test("formats generate default output as paths and warnings only", () => {
    const output = formatGenerateTextOutput({
      files: ["/tmp/image-1.png", "/tmp/image-2.png"],
      manifestPath: "/tmp/manifest.json",
      warnings: ["temporary url"]
    });

    expect(output).toBe([
      "/tmp/image-1.png",
      "/tmp/image-2.png",
      "manifest: /tmp/manifest.json",
      "warning: temporary url",
      ""
    ].join("\n"));
    expect(output).not.toContain("Saved");
    expect(output).not.toContain("Warnings:");
  });

  test("formats config path output as labeled paths", () => {
    const output = formatConfigPathText({
      configDir: "/home/me/.image",
      configFile: "/home/me/.image/config.json",
      configExampleFile: "/home/me/.image/config.example.jsonc",
      readmeFile: "/home/me/.image/README.md",
      skillInstallDirs: ["/home/me/.image/skills/image-cli"]
    });

    expect(output).toBe([
      "configDir: /home/me/.image",
      "config: /home/me/.image/config.json",
      "example: /home/me/.image/config.example.jsonc",
      "readme: /home/me/.image/README.md",
      "skill: /home/me/.image/skills/image-cli",
      ""
    ].join("\n"));
  });

  test("formats config show output as the active model and provider basics", () => {
    const output = formatConfigShowText({
      defaultModel: "openai/gpt-image-1.5",
      providers: {
        openai: {
          enabled: true,
          apiBaseUrl: "https://api.openai.com/v1",
          credentials: [{ present: true }]
        },
        qwen: {
          enabled: false,
          apiBaseUrl: "https://dashscope.aliyuncs.com/api/v1",
          credentials: []
        }
      }
    });

    expect(output).toBe([
      "default=openai/gpt-image-1.5",
      "openai credentials=1 baseUrl=https://api.openai.com/v1",
      "qwen disabled credentials=0 baseUrl=https://dashscope.aliyuncs.com/api/v1",
      ""
    ].join("\n"));
  });

  test("formats config doctor output as status lines", () => {
    const output = formatConfigDoctorText({
      configExists: true,
      readmeExists: false,
      curlAvailable: true,
      resolvedConfig: {
        defaultModel: "openai/gpt-image-1.5",
        providers: {
          openai: {
            enabled: true,
            credentialCount: 1
          }
        }
      }
    });

    expect(output).toBe([
      "config=ok",
      "readme=missing",
      "curl=ok",
      "default=openai/gpt-image-1.5",
      "openai credentials=1",
      ""
    ].join("\n"));
  });

  test("documents config subcommands", () => {
    const program = buildProgram();
    const configHelp = program.commands.find((command) => command.name() === "config")?.helpInformation();

    expect(configHelp).toContain("init");
    expect(configHelp).toContain("path");
    expect(configHelp).toContain("show");
    expect(configHelp).toContain("doctor");
    expect(configHelp).toContain("providers");
  });

  test("documents provider subcommands", () => {
    const program = buildProgram();
    const providerCommand = program.commands.find((command) => command.name() === "provider");
    const providerHelp = providerCommand?.helpInformation();
    const providerTargetHelp = providerCommand?.commands.find((command) => command.name() === "<provider-id>")?.helpInformation();
    const modelHelp = providerCommand?.commands
      .find((command) => command.name() === "<provider-id>")
      ?.commands.find((command) => command.name() === "model")
      ?.helpInformation();

    expect(providerHelp).toContain("list");
    expect(providerHelp).toContain("<provider-id>");
    expect(providerTargetHelp).toContain("model list");
    expect(modelHelp).toContain("list");
  });

  test("prints root guidance when no root command is provided", async () => {
    const result = await runProgram([]);

    expect(result.exitCode).toBe(1);
    expect(result.combined).toContain("Usage: image");
    expect(result.combined).toContain("Operations:");
    expect(result.combined).toContain("image generate <prompt> [options]");
    expect(result.combined).toContain("image provider list [--json]");
    expect(result.combined).toContain("image provider <provider-id> model list");
    expect(result.combined).not.toContain("image <provider-id> model list");
  });

  test("prints local command-group guidance without leaking root guidance", async () => {
    const providerResult = await runProgram(["provider"]);
    expect(providerResult.exitCode).toBe(1);
    expect(providerResult.combined).toContain("Usage: image provider");
    expect(providerResult.combined).toContain("<provider-id> model list");
    expect(providerResult.combined).not.toContain("Operations:");
    expect(providerResult.combined).not.toContain("image generate <prompt> [options]");

    const configResult = await runProgram(["config"]);
    expect(configResult.exitCode).toBe(1);
    expect(configResult.combined).toContain("Usage: image config");
    expect(configResult.combined).toContain("providers  list provider ids and aliases");
    expect(configResult.combined).not.toContain("Operations:");

    const providerTargetResult = await runProgram(["provider", "openai"]);
    expect(providerTargetResult.exitCode).toBe(1);
    expect(providerTargetResult.combined).toContain("Usage: image provider <provider-id>");
    expect(providerTargetResult.combined).toContain("model list");
    expect(providerTargetResult.combined).not.toContain("Operations:");

    const providerTargetModelResult = await runProgram(["provider", "openai", "model"]);
    expect(providerTargetModelResult.exitCode).toBe(1);
    expect(providerTargetModelResult.combined).toContain("Usage: image provider <provider-id> model");
    expect(providerTargetModelResult.combined).toContain("list");
    expect(providerTargetModelResult.combined).not.toContain("Operations:");
  });

  test("prints command help after required-argument errors", async () => {
    const generateResult = await runProgram(["generate"]);
    expect(generateResult.exitCode).toBe(1);
    expect(generateResult.combined).toContain("error: missing required argument 'prompt'");
    expect(generateResult.combined).toContain("Usage: image generate <prompt>");

    const modelListResult = await runProgram(["provider", "model", "list"]);
    expect(modelListResult.exitCode).toBe(1);
    expect(modelListResult.combined).toContain("Use 'image provider <provider-id> model list'");
    expect(modelListResult.combined).toContain("Usage: image provider");
  });

  test("rejects removed provider model-list compatibility forms with guidance", async () => {
    const rootShorthand = await runProgram(["openai", "model", "list"]);
    expect(rootShorthand.exitCode).toBe(1);
    expect(rootShorthand.combined).toContain("error: unknown command 'openai'");
    expect(rootShorthand.combined).toContain("image provider <provider-id> model list");

    const oldProviderOrder = await runProgram(["provider", "model", "list", "openai"]);
    expect(oldProviderOrder.exitCode).toBe(1);
    expect(oldProviderOrder.combined).toContain("Use 'image provider <provider-id> model list'");
    expect(oldProviderOrder.combined).toContain("Usage: image provider");
  });

  test("prints scoped help for the standard provider model-list command", async () => {
    const result = await runProgram(["provider", "openai", "model", "list", "--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.combined).toContain("Usage: image provider <provider-id> model list");
    expect(result.combined).toContain("--limit <count>");
    expect(result.combined).not.toContain("Compatibility:");
  });

  test("prints provider definitions as ids and aliases only", async () => {
    const result = await runProgram(["config", "providers"]);

    expect(result.exitCode).toBeUndefined();
    expect(result.combined).toContain("openai aliases=chatgpt-image");
    expect(result.combined).toContain("gemini aliases=nano-banana");
    expect(result.combined).not.toContain("OpenAI Images API");
    expect(result.combined).not.toContain("[aliases:");
  });
});

async function runProgram(argv: string[]): Promise<{
  combined: string;
  exitCode?: number;
}> {
  const program = buildProgram();
  let output = "";
  let exitCode: number | undefined;
  configureProgramForTest(program, {
    writeOut: (value) => {
      output += value;
    },
    writeErr: (value) => {
      output += value;
    }
  });

  try {
    await program.parseAsync(["node", "image", ...argv], { from: "node" });
  } catch (error) {
    if (isCliExitError(error)) {
      exitCode = error.exitCode;
    } else {
      throw error;
    }
  }

  return {
    combined: output,
    exitCode
  };
}

function configureProgramForTest(
  command: ReturnType<typeof buildProgram>,
  output: {
    writeOut: (value: string) => void;
    writeErr: (value: string) => void;
  }
): void {
  command.exitOverride();
  command.configureOutput(output);
  for (const subcommand of command.commands) {
    configureProgramForTest(subcommand as ReturnType<typeof buildProgram>, output);
  }
}

function isCliExitError(error: unknown): error is { exitCode: number } {
  return typeof error === "object" &&
    error !== null &&
    "exitCode" in error &&
    typeof (error as { exitCode?: unknown }).exitCode === "number";
}
