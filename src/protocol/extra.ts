export const RESERVED_EXTRA_KEYS = [
  "prompt",
  "model",
  "size",
  "normalizedSize",
  "aspectRatio",
  "count",
  "images",
  "quality",
  "outputFormat",
  "background",
  "negativePrompt",
  "seed",
  "stream",
  "outputDir",
  "json",
  "extra"
] as const;

const RESERVED_EXTRA_KEY_SET = new Set<string>(RESERVED_EXTRA_KEYS);

export function parseExtraObject(value?: string): Record<string, unknown> | undefined {
  if (value === undefined) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
      throw new Error("Expected JSON object.");
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`--extra must be a valid JSON object. ${message}`);
  }
}

export function assertNoReservedExtraKeys(extra?: Record<string, unknown>): void {
  if (!extra) {
    return;
  }

  const reservedKeys = Object.keys(extra).filter((key) =>
    RESERVED_EXTRA_KEY_SET.has(key)
  );
  if (reservedKeys.length > 0) {
    throw new Error(
      `--extra contains reserved protocol keys: ${reservedKeys.join(", ")}`
    );
  }
}
