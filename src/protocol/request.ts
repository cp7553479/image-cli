import type { ModelRef } from "./types.js";

export type ProviderCapabilities = {
  generate: boolean;
  edit: boolean;
  asyncTasks: boolean;
  streaming: boolean;
  background: boolean;
  multipleOutputs: boolean;
  transparentOutput: boolean;
};

export type ImageOutputFormat = "png" | "jpeg" | "webp";
export type ImageBackground = "auto" | "opaque" | "transparent";
export type ImageModeration = "auto" | "low";
export type ImageResponseFormat = "url" | "b64_json";
export type ImageStyle = "vivid" | "natural";
export type ImageInputFidelity = "low" | "high";

/**
 * 图片输入源：远程 URL 或本地文件路径。
 * provider 按自家协议决定是直传 URL、转 base64，还是上传 multipart 文件。
 */
export type ImageInput = { url: string } | { file: string };

export type GenerateRequest = {
  prompt: string;
  model: ModelRef;
  size?: string;
  n?: number;
  quality?: string;
  background?: ImageBackground;
  output_format?: ImageOutputFormat;
  output_compression?: number;
  moderation?: ImageModeration;
  response_format?: ImageResponseFormat;
  stream?: boolean;
  partial_images?: number;
  style?: ImageStyle;
  user?: string;
  extra?: Record<string, unknown>;
  outputDir?: string;
  json?: boolean;
  reference_images?: ImageInput[];
  mask?: ImageInput;
  input_fidelity?: ImageInputFidelity;
};
