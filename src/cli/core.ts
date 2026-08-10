import { parseArgs } from "node:util";

export type CliOutput = {
  writeOut: (value: string) => void;
  writeErr: (value: string) => void;
};

export type ParsedOptions = {
  values: Record<string, boolean | string | string[] | undefined>;
  positionals: string[];
};

export class CliExitError extends Error {
  readonly exitCode: number;

  constructor(exitCode: number) {
    super(`CLI exited with code ${exitCode}.`);
    this.exitCode = exitCode;
  }
}

export class CliUsageError extends Error {
  readonly helpText: string;

  constructor(message: string, helpText: string) {
    super(message);
    this.helpText = helpText;
  }
}

export class CliCommandNode {
  readonly commands: CliCommandNode[];
  private readonly commandName: string;
  private readonly helpText: string;

  constructor(commandName: string, helpText: string, commands: CliCommandNode[] = []) {
    this.commandName = commandName;
    this.helpText = helpText;
    this.commands = commands;
  }

  name(): string {
    return this.commandName;
  }

  helpInformation(): string {
    return this.helpText;
  }

  configureOutput(_output: CliOutput): this {
    return this;
  }

  exitOverride(): this {
    return this;
  }
}

export abstract class BaseCliProgram extends CliCommandNode {
  protected output: CliOutput = {
    writeOut: (value) => process.stdout.write(value),
    writeErr: (value) => process.stderr.write(value)
  };
  private shouldThrowOnExit = false;

  configureOutput(output: CliOutput): this {
    this.output = output;
    return this;
  }

  exitOverride(): this {
    this.shouldThrowOnExit = true;
    return this;
  }

  async parseAsync(argv: string[], options: { from?: "node" | "user" } = { from: "node" }): Promise<void> {
    const args = options.from === "user" ? argv : argv.slice(2);

    try {
      await this.run(args);
    } catch (error) {
      if (error instanceof CliUsageError) {
        this.writeUsageError(error);
        this.finish(1);
        return;
      }
      throw error;
    }
  }

  protected abstract run(args: string[]): Promise<void> | void;

  protected writeHelp(helpText: string, exitCode: number): void {
    const writer = exitCode === 0 ? this.output.writeOut : this.output.writeErr;
    writer(CLI_PARSE.ensureTrailingNewline(helpText));
    this.finish(exitCode);
  }

  private writeUsageError(error: CliUsageError): void {
    this.output.writeErr(`error: ${error.message}\n\n${CLI_PARSE.ensureTrailingNewline(error.helpText)}`);
  }

  private finish(exitCode: number): void {
    if (this.shouldThrowOnExit) {
      throw new CliExitError(exitCode);
    }
    if (exitCode !== 0) {
      process.exitCode = exitCode;
    }
  }
}

/**
 * Utility methods for the built-in CLI parser.
 */
export const CLI_PARSE = {
  parseCliArgs(
    args: string[],
    options: NonNullable<Parameters<typeof parseArgs>[0]>["options"],
    helpText: string
  ): ParsedOptions {
    try {
      const parsed = parseArgs({
        args,
        options,
        allowPositionals: true,
        strict: true
      });
      return {
        values: parsed.values as ParsedOptions["values"],
        positionals: parsed.positionals
      };
    } catch (error) {
      throw new CliUsageError(toErrorMessage(error), helpText);
    }
  },

  isHelpToken(value: string | undefined): boolean {
    return value === "-h" || value === "--help";
  },

  isHelpRequested(parsed: ParsedOptions): boolean {
    return Boolean(parsed.values.help);
  },

  ensureNoPositionals(parsed: ParsedOptions, helpText: string): void {
    if (parsed.positionals.length > 0) {
      throw new CliUsageError(`too many arguments: ${parsed.positionals.join(" ")}`, helpText);
    }
  },

  stringValue(value: boolean | string | string[] | undefined): string | undefined {
    return typeof value === "string" ? value : undefined;
  },

  stringArrayValue(value: boolean | string | string[] | undefined): string[] | undefined {
    if (Array.isArray(value)) {
      return value;
    }
    if (typeof value === "string") {
      return [value];
    }
    return undefined;
  },

  ensureTrailingNewline(value: string): string {
    return value.endsWith("\n") ? value : `${value}\n`;
  }
} as const;

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
