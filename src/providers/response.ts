import type { CurlExecutionResult } from "../transport/curl.js";

/**
 * Fails provider parsing when an HTTP response is not successful.
 */
export function assertSuccessfulResponse(
  providerName: string,
  result: CurlExecutionResult,
  payload?: unknown
): void {
  if (result.statusCode >= 200 && result.statusCode < 300) {
    return;
  }

  const message = extractProviderErrorMessage(payload) ?? trimBody(result.bodyText);
  if (message) {
    throw new Error(
      `${providerName} request failed with HTTP ${result.statusCode}: ${message}`
    );
  }

  throw new Error(`${providerName} request failed with HTTP ${result.statusCode}.`);
}

/**
 * Parses provider JSON response bodies with optional error-tolerant behavior.
 */
export function parseJsonBody<T>(
  providerName: string,
  bodyText: string,
  options: {
    allowEmpty?: boolean;
    tolerateInvalid?: boolean;
  } = {}
): T {
  const trimmed = bodyText.trim();
  if (!trimmed) {
    if (options.allowEmpty) {
      return {} as T;
    }
    throw new Error(`${providerName} response body was empty.`);
  }

  try {
    return JSON.parse(trimmed) as T;
  } catch (error) {
    if (options.tolerateInvalid) {
      return {} as T;
    }
    throw new Error(
      `${providerName} response was not valid JSON: ${toErrorMessage(error)}`
    );
  }
}

/**
 * Parses server-sent event data lines that contain JSON payloads.
 */
export function parseSseJsonData<T>(providerName: string, bodyText: string): T[] {
  const values: T[] = [];
  const blocks = bodyText.split(/\r?\n\r?\n/).map((block) => block.trim());

  for (const block of blocks) {
    if (!block) {
      continue;
    }

    const dataText = block
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice("data:".length).trim())
      .filter((line) => line && line !== "[DONE]")
      .join("\n");

    if (!dataText) {
      continue;
    }

    values.push(parseJsonBody<T>(providerName, dataText));
  }

  return values;
}

/**
 * Extracts a concise provider error message from common error JSON shapes.
 */
export function extractProviderErrorMessage(payload: unknown): string | undefined {
  const record = asRecord(payload);
  if (!record) {
    return undefined;
  }

  const direct = firstNonEmptyString(
    record.message,
    record.detail,
    record.msg,
    record.status_msg
  );
  const code = firstNonEmptyString(record.code, record.status, record.type);
  if (direct && code) {
    return `${code}: ${direct}`;
  }
  if (direct) {
    return direct;
  }

  const error = asRecord(record.error);
  if (error) {
    const errorMessage = firstNonEmptyString(
      error.message,
      error.detail,
      error.msg,
      error.status_msg
    );
    const errorCode = firstNonEmptyString(error.code, error.status, error.type);
    if (errorMessage && errorCode) {
      return `${errorCode}: ${errorMessage}`;
    }
    if (errorMessage) {
      return errorMessage;
    }
  } else if (typeof record.error === "string" && record.error.trim()) {
    return record.error.trim();
  }

  const output = asRecord(record.output);
  if (output) {
    const outputMessage = firstNonEmptyString(output.message, output.msg);
    const outputCode = firstNonEmptyString(output.code, output.status);
    if (outputMessage && outputCode) {
      return `${outputCode}: ${outputMessage}`;
    }
    if (outputMessage) {
      return outputMessage;
    }
  }

  const baseResponse = asRecord(record.base_resp);
  if (baseResponse) {
    const statusMessage = firstNonEmptyString(baseResponse.status_msg);
    const statusCode = firstNonEmptyString(baseResponse.status_code);
    if (statusMessage && statusCode) {
      return `${statusCode}: ${statusMessage}`;
    }
    if (statusMessage) {
      return statusMessage;
    }
  }

  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function firstNonEmptyString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }
  return undefined;
}

function trimBody(bodyText: string): string | undefined {
  const trimmed = bodyText.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed.length > 500 ? `${trimmed.slice(0, 500)}...` : trimmed;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
