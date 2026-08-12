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
  background?: string;
  output_format?: string;
  output_compression?: number;
  moderation?: string;
  response_format?: string;
  stream?: boolean;
  partial_images?: number;
  style?: string;
  user?: string;
  extra?: Record<string, unknown>;
  outputDir?: string;
  json?: boolean;
  reference_images?: ImageInput[];
  mask?: ImageInput;
  input_fidelity?: string;
};
