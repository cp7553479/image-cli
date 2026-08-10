import type { CredentialEntry } from "../../config/types.js";
import type {
  BuiltInInterfaceAdapterId,
  InterfaceAdapterGenerateContext,
  ProviderAuthProfile,
  ProviderGenerateContext,
  ProviderProfile
} from "../types.js";

/**
 * BUILT_IN_INTERFACE_ADAPTER_IDS 的导出入口。
 */
export const BUILT_IN_INTERFACE_ADAPTER_IDS = [
  "native-image",
  "openai-compatible-chat",
  "gemini-generate-content"
] as const satisfies readonly BuiltInInterfaceAdapterId[];

/**
 * isBuiltInInterfaceAdapterId 的导出入口。
 */
export function isBuiltInInterfaceAdapterId(
  value: string
): value is BuiltInInterfaceAdapterId {
  return BUILT_IN_INTERFACE_ADAPTER_IDS.includes(
    value as BuiltInInterfaceAdapterId
  );
}

/**
 * normalizeProviderBaseUrl 的导出入口。
 */
export function normalizeProviderBaseUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("Provider baseUrl is required.");
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch (error) {
    throw new Error(
      `Provider baseUrl must be an absolute URL: ${toErrorMessage(error)}`
    );
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Provider baseUrl must use http or https.");
  }
  if (url.search || url.hash) {
    throw new Error("Provider baseUrl must not include query or hash.");
  }

  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  return url.toString().replace(/\/$/, "");
}

/**
 * defineProviderProfile 的导出入口。
 */
export function defineProviderProfile(profile: ProviderProfile): ProviderProfile {
  const providerId = requireNonBlank(profile.providerId, "providerId");
  const interfaceAdapter = requireNonBlank(
    profile.interfaceAdapter,
    "interfaceAdapter"
  );

  return {
    providerId,
    aliases: [...profile.aliases],
    baseUrl: normalizeProviderBaseUrl(profile.baseUrl),
    auth: cloneAuthProfile(profile.auth),
    capabilities: { ...profile.capabilities },
    interfaceAdapter
  };
}

/**
 * buildProviderAuthHeaders 的导出入口。
 */
export function buildProviderAuthHeaders(
  auth: ProviderAuthProfile,
  credential?: CredentialEntry
): Record<string, string> {
  if (auth.type === "none" || auth.type === "api-key-query") {
    return {};
  }

  const value = requireCredentialValue(credential, auth.type);
  if (auth.type === "api-key-header") {
    return {
      [requireNonBlank(auth.headerName, "auth.headerName")]: value
    };
  }

  const scheme = auth.scheme ?? "Bearer";
  const headerValue = scheme ? `${scheme} ${value}` : value;
  return {
    [auth.headerName ?? "Authorization"]: headerValue
  };
}

/**
 * applyProviderAuthToUrl 的导出入口。
 */
export function applyProviderAuthToUrl(
  url: string,
  auth: ProviderAuthProfile,
  credential?: CredentialEntry
): string {
  if (auth.type !== "api-key-query") {
    return url;
  }

  const parsed = new URL(url);
  parsed.searchParams.set(
    requireNonBlank(auth.queryName, "auth.queryName"),
    requireCredentialValue(credential, auth.type)
  );
  return parsed.toString();
}

/**
 * toInterfaceAdapterGenerateContext 的导出入口。
 */
export function toInterfaceAdapterGenerateContext(
  context: ProviderGenerateContext,
  profile: ProviderProfile
): InterfaceAdapterGenerateContext {
  if (context.request.model.providerId !== profile.providerId) {
    throw new Error(
      `Request provider "${context.request.model.providerId}" does not match profile "${profile.providerId}".`
    );
  }

  return {
    request: context.request,
    profile,
    credential: context.credential,
    timeoutMs: context.providerConfig.timeoutMs
  };
}

function cloneAuthProfile(auth: ProviderAuthProfile): ProviderAuthProfile {
  return { ...auth };
}

function requireCredentialValue(
  credential: CredentialEntry | undefined,
  authType: ProviderAuthProfile["type"]
): string {
  if (!credential?.value) {
    throw new Error(`Provider auth "${authType}" requires a credential.`);
  }
  return credential.value;
}

function requireNonBlank(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`Provider profile ${label} is required.`);
  }
  return trimmed;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
