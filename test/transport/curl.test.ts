import { createServer } from "node:http";
import type { IncomingMessage, Server } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { downloadCurlFile, executeCurlRequest } from "../../src/transport/curl.js";

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers.map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => {
            if (error) {
              reject(error);
              return;
            }
            resolve();
          });
        })
    )
  );
  servers.length = 0;
});

describe("curl transport", () => {
  test("executes JSON requests and captures headers and body", async () => {
    const server = createServer(async (request, response) => {
      const body = await readRequestBody(request);
      response.setHeader("x-test-header", "json-ok");
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          method: request.method,
          authorization: request.headers.authorization,
          contentType: request.headers["content-type"],
          body: JSON.parse(body)
        })
      );
    });
    const baseUrl = await listen(server);

    const result = await executeCurlRequest({
      method: "POST",
      url: `${baseUrl}/json`,
      headers: {
        Authorization: "Bearer test-key"
      },
      json: {
        prompt: "cat",
        n: 1
      },
      timeoutMs: 5_000
    });

    expect(result.statusCode).toBe(200);
    expect(result.headers["x-test-header"]).toBe("json-ok");
    expect(JSON.parse(result.bodyText)).toEqual({
      method: "POST",
      authorization: "Bearer test-key",
      contentType: "application/json",
      body: {
        prompt: "cat",
        n: 1
      }
    });
  });

  test("executes multipart requests with file uploads", async () => {
    const uploadPath = path.join(tmpdir(), `image-cli-upload-${Date.now()}.txt`);
    await writeFile(uploadPath, "demo-file");

    const server = createServer(async (request, response) => {
      const body = await readRequestBody(request);
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          contentType: request.headers["content-type"],
          body
        })
      );
    });
    const baseUrl = await listen(server);

    const result = await executeCurlRequest({
      method: "POST",
      url: `${baseUrl}/multipart`,
      form: [
        { name: "prompt", value: "turn this into a poster" },
        { name: "image", filePath: uploadPath, filename: "source.txt" }
      ],
      timeoutMs: 5_000
    });

    const payload = JSON.parse(result.bodyText) as {
      contentType: string;
      body: string;
    };

    expect(result.statusCode).toBe(200);
    expect(payload.contentType).toMatch(/^multipart\/form-data; boundary=/);
    expect(payload.body).toContain('name="prompt"');
    expect(payload.body).toContain("turn this into a poster");
    expect(payload.body).toContain('name="image"; filename="source.txt"');
    expect(payload.body).toContain("demo-file");
  });

  test("downloads binary responses to a file", async () => {
    const server = createServer((_request, response) => {
      response.setHeader("content-type", "image/png");
      response.end(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    });
    const baseUrl = await listen(server);
    const destination = path.join(tmpdir(), `image-cli-download-${Date.now()}.bin`);

    await downloadCurlFile({
      url: `${baseUrl}/asset`,
      destinationPath: destination,
      timeoutMs: 5_000
    });

    const bytes = await readFile(destination);
    expect(Buffer.from(bytes)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  });
});

async function listen(server: Server): Promise<string> {
  servers.push(server);

  await new Promise<void>((resolve, reject) => {
    server.listen(0, "127.0.0.1", (error?: Error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to determine server address.");
  }

  return `http://127.0.0.1:${address.port}`;
}

async function readRequestBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}
