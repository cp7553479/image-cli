export const SUPPORTED_ASPECT_RATIOS = [
  "1:1",
  "4:3",
  "3:4",
  "16:9",
  "9:16",
  "3:2",
  "2:3",
  "21:9"
] as const;

export type SupportedAspectRatio = (typeof SUPPORTED_ASPECT_RATIOS)[number];
export type AspectRatio = SupportedAspectRatio | `${number}:${number}`;

export type CanonicalProviderId =
  | "openai"
  | "gemini"
  | "seedream"
  | "qwen"
  | "minimax";

export type ModelRef = {
  providerId: CanonicalProviderId;
  providerAlias: string;
  modelId: string;
};

export type SizePreset = "2k" | "4k";

export type NormalizedSize = {
  source: "preset" | "explicit";
  preset?: SizePreset;
  width: number;
  height: number;
  aspectRatio: AspectRatio;
  raw: string;
};
