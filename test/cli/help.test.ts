import { describe, expect, test } from "vitest";

import { buildProgram } from "../../src/cli/program.js";

describe("CLI help", () => {
  test("documents root commands", () => {
    const program = buildProgram();
    const help = program.helpInformation();

    expect(help).toContain("image");
    expect(help).toContain("generate <prompt>");
    expect(help).toContain("config");
    expect(help).toContain("Commands:");
  });

  test("documents generate options", () => {
    const program = buildProgram();
    const generateHelp = program.commands.find((command) => command.name() === "generate")?.helpInformation();

    expect(generateHelp).toContain("--model <provider/model>");
    expect(generateHelp).toContain("--size <preset|WIDTHxHEIGHT>");
    expect(generateHelp).toContain("--extra <json>");
    expect(generateHelp).not.toContain("--negative-prompt");
    expect(generateHelp).toContain("Usage: image generate <prompt>");
    expect(generateHelp).toContain("config.defaultModel");
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
});
