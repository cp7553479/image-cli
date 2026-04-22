import type { AspectRatio, NormalizedSize, SizePreset, SupportedAspectRatio } from "./types.js";
import { SUPPORTED_ASPECT_RATIOS } from "./types.js";

type Dimensions = {
  width: number;
  height: number;
};

export const SIZE_PRESETS: Record<SizePreset, Record<SupportedAspectRatio, Dimensions>> = {
  "2k": {
    "1:1": { width: 2048, height: 2048 },
    "4:3": { width: 2304, height: 1728 },
    "3:4": { width: 1728, height: 2304 },
    "16:9": { width: 2848, height: 1600 },
    "9:16": { width: 1600, height: 2848 },
    "3:2": { width: 2496, height: 1664 },
    "2:3": { width: 1664, height: 2496 },
    "21:9": { width: 3136, height: 1344 }
  },
  "4k": {
    "1:1": { width: 4096, height: 4096 },
    "4:3": { width: 4096, height: 3072 },
    "3:4": { width: 3072, height: 4096 },
    "16:9": { width: 4096, height: 2304 },
    "9:16": { width: 2304, height: 4096 },
    "3:2": { width: 4096, height: 2736 },
    "2:3": { width: 2736, height: 4096 },
    "21:9": { width: 4096, height: 1752 }
  }
};

const PRESET_NAMES = Object.keys(SIZE_PRESETS) as SizePreset[];
const EXPLICIT_SIZE_PATTERN = /^(\d+)x(\d+)$/i;

export function parseAspectRatio(value: string): SupportedAspectRatio {
  const normalized = value.trim() as SupportedAspectRatio;
  if (!SUPPORTED_ASPECT_RATIOS.includes(normalized)) {
    throw new Error(
      `Unsupported aspect ratio "${value}". Supported values: ${SUPPORTED_ASPECT_RATIOS.join(", ")}`
    );
  }
  return normalized;
}

export function normalizeSize(
  rawSize?: string,
  rawAspect?: string
): NormalizedSize | undefined {
  if (!rawSize) {
    return undefined;
  }

  const trimmedSize = rawSize.trim().toLowerCase();
  const explicitAspect = rawAspect ? parseAspectRatio(rawAspect) : undefined;
  const preset = PRESET_NAMES.find((candidate) => candidate === trimmedSize);
  if (preset) {
    const aspectRatio = explicitAspect ?? "1:1";
    const dimensions = SIZE_PRESETS[preset][aspectRatio];
    return {
      source: "preset",
      preset,
      width: dimensions.width,
      height: dimensions.height,
      aspectRatio,
      raw: rawSize
    };
  }

  const explicitMatch = trimmedSize.match(EXPLICIT_SIZE_PATTERN);
  if (!explicitMatch) {
    if (trimmedSize.includes("x")) {
      throw new Error(`Invalid size "${rawSize}". Expected positive WIDTHxHEIGHT.`);
    }
    throw new Error(
      `Unsupported size "${rawSize}". Use one of ${PRESET_NAMES.join(", ")} or WIDTHxHEIGHT.`
    );
  }

  const width = Number(explicitMatch[1]);
  const height = Number(explicitMatch[2]);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error(`Invalid size "${rawSize}". Expected positive WIDTHxHEIGHT.`);
  }

  const derivedAspectRatio = simplifyAspectRatio(width, height);
  if (explicitAspect && explicitAspect !== derivedAspectRatio) {
    throw new Error(
      `Explicit size ${rawSize} conflicts with --aspect ${explicitAspect}. Derived ratio is ${derivedAspectRatio}.`
    );
  }

  return {
    source: "explicit",
    width,
    height,
    aspectRatio: derivedAspectRatio,
    raw: rawSize
  };
}

function simplifyAspectRatio(width: number, height: number): AspectRatio {
  const divisor = gcd(width, height);
  return `${width / divisor}:${height / divisor}`;
}

function gcd(left: number, right: number): number {
  let a = left;
  let b = right;
  while (b !== 0) {
    const next = a % b;
    a = b;
    b = next;
  }
  return a;
}
