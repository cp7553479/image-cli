import type { ProviderCapabilities } from "../protocol/request.js";

export type PluginRuntime = "node" | "python" | "executable";

export type ProviderPluginManifest = {
  providerId: string;
  entry: string;
  runtime?: PluginRuntime;
  description?: string;
  aliases?: string[];
  capabilities?: Partial<ProviderCapabilities>;
};

export type PluginAction = "build-generate" | "parse-generate" | "classify-failure";
