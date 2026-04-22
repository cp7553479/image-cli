import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

export type CurlFormField =
  | {
      name: string;
      value: string;
    }
  | {
      name: string;
      filePath: string;
      filename?: string;
      contentType?: string;
    };

export type CurlRequest = {
  method: string;
  url: string;
  headers?: Record<string, string>;
  json?: unknown;
  form?: CurlFormField[];
  timeoutMs?: number;
  stream?: boolean;
};

export type CurlExecutionResult = {
  statusCode: number;
  headers: Record<string, string>;
  bodyText: string;
  stderrText: string;
  exitCode: number;
};

export type CurlDownloadRequest = {
  url: string;
  destinationPath: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
};

export async function executeCurlRequest(
  request: CurlRequest
): Promise<CurlExecutionResult> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "image-cli-curl-"));
  const headersFile = path.join(tempDir, "headers.txt");
  const bodyFile = path.join(tempDir, "body.txt");
  const jsonFile = path.join(tempDir, "payload.json");

  const args = ["--silent", "--show-error", "--location", "--request", request.method];
  args.push("--dump-header", headersFile, "--url", request.url);

  if (request.timeoutMs) {
    args.push("--max-time", String(Math.ceil(request.timeoutMs / 1000)));
  }

  for (const [headerName, headerValue] of Object.entries(request.headers ?? {})) {
    args.push("--header", `${headerName}: ${headerValue}`);
  }

  if (request.json !== undefined && request.form) {
    throw new Error("CurlRequest cannot include both json and form.");
  }

  if (request.json !== undefined) {
    await writeFile(jsonFile, JSON.stringify(request.json));
    args.push("--header", "Content-Type: application/json");
    args.push("--data-binary", `@${jsonFile}`);
  }

  for (const field of request.form ?? []) {
    args.push("--form", formatFormField(field));
  }

  if (!request.stream) {
    args.push("--output", bodyFile);
  }

  try {
    const { exitCode, stdoutText, stderrText } = await spawnCurl(args);
    const bodyText = request.stream
      ? stdoutText
      : await readFile(bodyFile, "utf8").catch(() => "");
    const headersText = await readFile(headersFile, "utf8").catch(() => "");
    const headers = parseHeaders(headersText);
    const statusCode = parseStatusCode(headersText);

    return {
      statusCode,
      headers,
      bodyText,
      stderrText,
      exitCode
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export async function downloadCurlFile(
  request: CurlDownloadRequest
): Promise<void> {
  const args = ["--silent", "--show-error", "--location", "--url", request.url];
  if (request.timeoutMs) {
    args.push("--max-time", String(Math.ceil(request.timeoutMs / 1000)));
  }
  for (const [headerName, headerValue] of Object.entries(request.headers ?? {})) {
    args.push("--header", `${headerName}: ${headerValue}`);
  }
  args.push("--output", request.destinationPath);
  await spawnCurl(args);
}

function formatFormField(field: CurlFormField): string {
  if ("value" in field) {
    return `${field.name}=${field.value}`;
  }

  let formatted = `${field.name}=@${field.filePath}`;
  if (field.filename) {
    formatted += `;filename=${field.filename}`;
  }
  if (field.contentType) {
    formatted += `;type=${field.contentType}`;
  }
  return formatted;
}

async function spawnCurl(args: string[]): Promise<{
  exitCode: number;
  stdoutText: string;
  stderrText: string;
}> {
  return await new Promise((resolve, reject) => {
    const child = spawn("curl", args, {
      stdio: ["ignore", "pipe", "pipe"]
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdoutChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderrChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    child.on("error", reject);
    child.on("close", (exitCode) => {
      const stdoutText = Buffer.concat(stdoutChunks).toString("utf8");
      const stderrText = Buffer.concat(stderrChunks).toString("utf8");
      if (exitCode !== 0) {
        reject(
          new Error(
            `curl failed with exit code ${exitCode ?? -1}: ${stderrText || stdoutText}`
          )
        );
        return;
      }
      resolve({
        exitCode: exitCode ?? 0,
        stdoutText,
        stderrText
      });
    });
  });
}

function parseHeaders(rawHeaders: string): Record<string, string> {
  const headerBlocks = rawHeaders
    .split(/\r?\n\r?\n/)
    .map((block) => block.trim())
    .filter(Boolean);
  const lastBlock = headerBlocks.at(-1) ?? "";
  const lines = lastBlock.split(/\r?\n/).slice(1);

  return lines.reduce<Record<string, string>>((accumulator, line) => {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex <= 0) {
      return accumulator;
    }

    const key = line.slice(0, separatorIndex).trim().toLowerCase();
    const value = line.slice(separatorIndex + 1).trim();
    accumulator[key] = value;
    return accumulator;
  }, {});
}

function parseStatusCode(rawHeaders: string): number {
  const headerBlocks = rawHeaders
    .split(/\r?\n\r?\n/)
    .map((block) => block.trim())
    .filter(Boolean);
  const statusLine = headerBlocks.at(-1)?.split(/\r?\n/)[0] ?? "";
  const match = statusLine.match(/^HTTP\/\S+\s+(\d{3})/);
  if (!match) {
    return 0;
  }
  return Number(match[1]);
}
