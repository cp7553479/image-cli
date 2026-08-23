#!/usr/bin/env node
// Oracle image provider plugin for image-cli.
//
// Bridges `image generate` to the local `oracle` CLI running ChatGPT in browser
// mode. Every generation runs with `--engine browser --browser-manual-login`
// and saves the produced artifact through `--generate-image`.
//
// The plugin protocol is transport-agnostic but curl-based: build-generate
// must return a curl request and parse-generate receives its execution result.
// Since oracle is a local CLI, build-generate runs oracle synchronously, then
// exposes the generated image as a base64 sidecar file behind a `file://` URL;
// the standard curl transport fetches that sidecar as text and parse-generate
// turns it into the normal GenerateResult payload.

import { spawn } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
const PROVIDER_ID = "oracle";
const DEFAULT_TIMEOUT_MS = 20 * 60 * 1000;
const REFERENCE_MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;
const STALE_WORK_DIR_MS = 24 * 60 * 60 * 1000;
const WORK_DIR_PREFIX = "image-cli-oracle-";

// oracle --browser-thinking-time accepts these levels (verified against the
// installed CLI); they double as the effort suffix accepted in model ids.
const THINKING_LEVELS = [
  "light",
  "standard",
  "extended",
  "extra-high",
  "pro",
  "heavy",
  "instant",
  "medium",
  "high",
  "xhigh"
];

const GEMINI_ASPECTS = new Set(["1:1", "16:9", "4:3", "3:4"]);

/**
 * Maps a `--model oracle/<id>` value onto oracle CLI flags. GPT-5.6 Sol
 * display spellings ("GPT-5.6 Sol Medium") map to `gpt-5.6-sol` plus an
 * explicit `--browser-thinking-time` level; anything else passes through
 * verbatim so oracle performs its own validation.
 */
export function parseOracleModel(modelId) {
  if (typeof modelId !== "string" || modelId.trim() === "") {
    throw new Error("oracle plugin: model id must be a non-empty string.");
  }
  const normalized = modelId.trim().toLowerCase().replace(/\s+/g, "-");
  const pattern = new RegExp(`^(gpt-5\\.6(?:-sol)?)(?:-(${THINKING_LEVELS.join("|")}))?$`);
  const match = normalized.match(pattern);
  if (match) {
    return { oracleModel: "gpt-5.6-sol", thinkingTime: match[2] };
  }
  return { oracleModel: modelId.trim(), thinkingTime: undefined };
}

/**
 * Derives a Gemini `--aspect` value from the request `size`, if possible.
 * Only exact ratios oracle supports are used; other sizes are ignored.
 */
export function resolveGeminiAspect(oracleModel, size) {
  if (!size || !oracleModel.toLowerCase().startsWith("gemini")) {
    return undefined;
  }
  const trimmed = size.trim().toLowerCase();
  if (GEMINI_ASPECTS.has(trimmed)) {
    return trimmed;
  }
  const dimensions = trimmed.match(/^(\d+)x(\d+)$/);
  if (!dimensions) {
    return undefined;
  }
  const width = Number(dimensions[1]);
  const height = Number(dimensions[2]);
  const ratio = width / height;
  const known = {
    "1:1": 1,
    "16:9": 16 / 9,
    "4:3": 4 / 3,
    "3:4": 3 / 4
  };
  for (const [aspect, value] of Object.entries(known)) {
    if (Math.abs(ratio - value) < 0.01) {
      return aspect;
    }
  }
  return undefined;
}

/** Sniffs the real image format from decoded bytes; oracle artifacts are PNG in practice. */
function sniffImageFormat(buffer) {
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return { mimeType: "image/png", output_format: "png" };
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mimeType: "image/jpeg", output_format: "jpeg" };
  }
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") {
    return { mimeType: "image/webp", output_format: "webp" };
  }
  return undefined;
}

function collectWarnings(request, oracleModel) {
  const warnings = [];
  if (typeof request.n === "number" && request.n > 1) {
    warnings.push(`oracle generates one image per run; ignoring n=${request.n}.`);
  }
  if (request.mask) {
    warnings.push("oracle browser mode does not support --mask; it was ignored.");
  }
  if (request.size && !resolveGeminiAspect(oracleModel, request.size)) {
    warnings.push(`oracle browser mode cannot apply size "${request.size}" to this model; it was ignored.`);
  }
  return warnings;
}

async function buildGenerate(payload) {
  const request = payload.request;
  if (!request || typeof request.prompt !== "string" || request.prompt.trim() === "") {
    throw new Error("oracle plugin: build-generate requires a non-empty prompt.");
  }
  const { oracleModel, thinkingTime } = parseOracleModel(request.model?.modelId);

  await pruneStaleWorkDirs();
  const workDir = await mkdtemp(path.join(tmpdir(), `${WORK_DIR_PREFIX}`));
  const imagePath = path.join(workDir, "image.png");

  const args = [
    "--engine",
    "browser",
    "--browser-manual-login",
    "--model",
    oracleModel
  ];
  if (thinkingTime) {
    args.push("--browser-thinking-time", thinkingTime);
  }

  const referenceFiles = await resolveReferenceFiles(request.reference_images ?? [], workDir);
  for (const referenceFile of referenceFiles) {
    args.push("--file", referenceFile);
  }
  if (referenceFiles.length > 0) {
    // Reference images are intentional uploads, not project text files; lift
    // oracle's default 1 MB attachment cap for them.
    args.push("--max-file-size-bytes", String(REFERENCE_MAX_FILE_SIZE_BYTES));
  }

  const aspect = resolveGeminiAspect(oracleModel, request.size);
  if (aspect) {
    args.push("--aspect", aspect);
  }

  args.push("--generate-image", imagePath);

  const timeoutMs = typeof payload.providerConfig?.timeoutMs === "number" && payload.providerConfig.timeoutMs > 0
    ? payload.providerConfig.timeoutMs
    : DEFAULT_TIMEOUT_MS;
  args.push("--timeout", `${Math.ceil(timeoutMs / 1000)}s`);

  args.push("--no-notify");
  args.push("--slug", "image cli generate");
  args.push("--prompt", request.prompt);

  await runOracle(args, timeoutMs);

  const imageStat = await stat(imagePath).catch(() => undefined);
  if (!imageStat || imageStat.size === 0) {
    throw new Error(
      "oracle finished without producing a downloadable image artifact. " +
      "Check `oracle status` for the session transcript; the model may have answered with text only."
    );
  }

  const base64 = (await readFile(imagePath)).toString("base64");
  const base64Path = path.join(workDir, "image.b64");
  await writeFile(base64Path, base64);

  return {
    request: {
      method: "GET",
      url: pathToFileURL(base64Path).href,
      timeoutMs: 30_000
    }
  };
}

function parseGenerate(payload) {
  const request = payload.input?.request;
  const bodyText = typeof payload.result?.bodyText === "string" ? payload.result.bodyText : "";
  const base64 = bodyText.replace(/\s+/g, "");
  if (!base64) {
    throw new Error("oracle plugin: transport returned an empty image payload.");
  }

  const buffer = Buffer.from(base64, "base64");
  const sniffed = sniffImageFormat(buffer);
  const { oracleModel } = parseOracleModel(request?.model?.modelId);

  return {
    providerId: PROVIDER_ID,
    modelId: request?.model?.modelId,
    images: [
      {
        dataBase64: base64,
        mimeType: sniffed?.mimeType ?? "image/png",
        output_format: sniffed?.output_format ?? "png"
      }
    ],
    warnings: collectWarnings(request ?? {}, oracleModel),
    raw: { engine: "browser", source: "oracle" }
  };
}

async function resolveReferenceFiles(referenceImages, workDir) {
  const files = [];
  let index = 0;
  for (const entry of referenceImages) {
    index += 1;
    if (entry && typeof entry.file === "string" && entry.file.trim() !== "") {
      const resolved = path.resolve(entry.file);
      const fileStat = await stat(resolved).catch(() => undefined);
      if (!fileStat || !fileStat.isFile()) {
        throw new Error(`oracle plugin: reference image ${index} is not an existing file: ${resolved}`);
      }
      files.push(resolved);
      continue;
    }
    if (entry && typeof entry.url === "string" && entry.url.trim() !== "") {
      const destination = path.join(workDir, `reference-${index}${referenceExtension(entry.url)}`);
      await downloadReference(entry.url, destination);
      files.push(destination);
      continue;
    }
    throw new Error(`oracle plugin: reference image ${index} must be a file path or URL.`);
  }
  return files;
}

function referenceExtension(url) {
  try {
    const extension = path.extname(new URL(url).pathname).toLowerCase();
    return /^\.[a-z0-9]{2,5}$/.test(extension) ? extension : ".png";
  } catch {
    return ".png";
  }
}

async function downloadReference(url, destination) {
  const outcome = await spawnToCompletion("curl", [
    "--silent",
    "--show-error",
    "--location",
    "--url",
    url,
    "--output",
    destination
  ]);
  if (outcome.exitCode !== 0) {
    throw new Error(`oracle plugin: failed to download reference image: ${describeFailure(outcome)}`);
  }
}

function runOracle(args, timeoutMs) {
  const command = process.env.ORACLE_BIN ?? "oracle";
  return spawnWithDeadline(command, args, timeoutMs + 120_000, (outcome) => {
    if (outcome.exitCode !== 0) {
      return new Error(`oracle failed: ${describeFailure(outcome)}`);
    }
    return undefined;
  });
}

function spawnWithDeadline(command, args, deadlineMs, classify) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      child.kill("SIGKILL");
      reject(new Error(`${command} exceeded ${Math.round(deadlineMs / 1000)}s and was terminated.`));
    }, deadlineMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      reject(new Error(`oracle plugin: failed to start "${command}": ${error.message}`));
    });
    child.on("close", (exitCode) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      const outcome = { exitCode: exitCode ?? -1, stdout, stderr };
      const failure = classify(outcome);
      if (failure) {
        reject(failure);
        return;
      }
      resolve(outcome);
    });
  });
}

async function spawnToCompletion(command, args) {
  return await spawnWithDeadline(command, args, 120_000, () => undefined);
}

function describeFailure(outcome) {
  const tail = `${outcome.stderr}\n${outcome.stdout}`.trim().split(/\r?\n/).slice(-15).join("\n");
  return `exit code ${outcome.exitCode}${tail ? `:\n${tail}` : ""}`;
}

async function pruneStaleWorkDirs() {
  const base = tmpdir();
  const entries = await readdir(base).catch(() => []);
  const cutoff = Date.now() - STALE_WORK_DIR_MS;
  await Promise.all(entries
    .filter((entry) => entry.startsWith(WORK_DIR_PREFIX))
    .map(async (entry) => {
      const target = path.join(base, entry);
      const info = await stat(target).catch(() => undefined);
      if (info && info.mtimeMs < cutoff) {
        await rm(target, { recursive: true, force: true }).catch(() => undefined);
      }
    }));
}

async function readStdinPayload() {
  const chunks = [];
  await new Promise((resolve, reject) => {
    process.stdin.on("data", (chunk) => chunks.push(chunk));
    process.stdin.on("end", resolve);
    process.stdin.on("error", reject);
  });
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) {
    throw new Error("oracle plugin: expected a JSON payload on stdin.");
  }
  const payload = JSON.parse(raw);
  if (!payload || typeof payload !== "object") {
    throw new Error("oracle plugin: stdin payload must be a JSON object.");
  }
  return payload;
}

function readActionFromArgv() {
  const index = process.argv.indexOf("--action");
  const action = index >= 0 ? process.argv[index + 1] : "";
  if (action !== "build-generate" && action !== "parse-generate") {
    throw new Error(
      `oracle plugin: unknown action "${action}". Expected --action build-generate|parse-generate.`
    );
  }
  return action;
}

async function main() {
  const action = readActionFromArgv();
  const payload = await readStdinPayload();
  if (action === "build-generate") {
    process.stdout.write(JSON.stringify(await buildGenerate(payload)));
    return;
  }
  process.stdout.write(JSON.stringify(parseGenerate(payload)));
}

// The plugin protocol always invokes this entry as
// `node index.mjs --action <action> --input-stdin`; matching argv is more
// robust than comparing import.meta.url with argv[1], which breaks through
// symlinked temp directories (macOS /var -> /private/var).
if (process.argv.includes("--action") && process.argv.includes("--input-stdin")) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}