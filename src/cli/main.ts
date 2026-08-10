import { buildProgram } from "./program.js";

const program = buildProgram();

program.parseAsync(process.argv).catch((error: unknown) => {
  // See docs/error-handling.md#cli-boundary for stderr and exit-code rules.
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
