import { PROVIDER_CATALOG, type BuiltInProviderId, type ProviderCatalogEntry } from "./catalog.js";

export type ProviderIdentity = Pick<ProviderCatalogEntry, "providerId" | "aliases">;

const CUSTOM_PROVIDER_PATTERN = /^[a-z0-9][a-z0-9_-]*$/i;

/**
 * Lists built-in provider ids from provider catalog metadata.
 */
export function listBuiltInProviderIds(): BuiltInProviderId[] {
  return PROVIDER_CATALOG.map((entry) => entry.providerId);
}

/**
 * Returns the configured aliases for one built-in provider.
 */
export function getBuiltInProviderAliases(providerId: BuiltInProviderId): string[] {
  return [...PROVIDER_CATALOG.find((entry) => entry.providerId === providerId)?.aliases ?? []];
}

/**
 * Resolves a provider id or provider alias through provider-owned identities.
 */
export function resolveProviderAlias(
  value: string,
  identities: readonly ProviderIdentity[] = PROVIDER_CATALOG
): string {
  const normalized = value.trim().toLowerCase();
  const match = identities.find((entry) =>
    entry.providerId.toLowerCase() === normalized ||
    entry.aliases.some((alias) => alias.toLowerCase() === normalized)
  );

  if (match) {
    return match.providerId;
  }

  if (CUSTOM_PROVIDER_PATTERN.test(normalized)) {
    return normalized;
  }

  throw new Error(
    `Unknown provider "${value}". Expected one of: ${formatProviderIdentityNames(identities)} or a custom provider id.`
  );
}

function formatProviderIdentityNames(identities: readonly ProviderIdentity[]): string {
  return identities
    .flatMap((entry) => [entry.providerId, ...entry.aliases])
    .join(", ");
}
