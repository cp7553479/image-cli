import type { ModelRef, NormalizedSize } from "./types.js";

export type ProviderCapabilities = {
  generate: boolean;
  edit: boolean;
  inputImages: boolean;
  asyncTasks: boolean;
  streaming: boolean;
  background: boolean;
  negativePrompt: boolean;
  multipleOutputs: boolean;
  transparentOutput: boolean;
};

export type GenerateRequest = {
  prompt: string;
  model: ModelRef;
  size?: string;
  normalizedSize?: NormalizedSize;
  aspectRatio?: string;
  count?: number;
  images?: string[];
  quality?: string;
  outputFormat?: "png" | "jpeg" | "webp";
  background?: "auto" | "opaque" | "transparent";
  negativePrompt?: string;
  seed?: number;
  stream?: boolean;
  outputDir?: string;
  json?: boolean;
  extra?: Record<string, unknown>;
};
