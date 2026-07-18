export const PLATFORM_TENANT_SLUG = "documind.ai";

export const LEGACY_PLATFORM_TENANT_SLUGS = [
  "__documind_platform__",
  "documind-ai",
] as const;

function normalizeSlugCandidate(value: string) {
  return value.toLowerCase().trim();
}

export function isPlatformTenantSlug(value: string | undefined | null) {
  if (!value) return false;
  return normalizeSlugCandidate(value) === PLATFORM_TENANT_SLUG;
}

export function isLegacyPlatformTenantSlug(value: string | undefined | null) {
  if (!value) return false;
  const normalized = normalizeSlugCandidate(value);
  return LEGACY_PLATFORM_TENANT_SLUGS.includes(
    normalized as (typeof LEGACY_PLATFORM_TENANT_SLUGS)[number],
  );
}

export function isReservedPlatformSlug(value: string | undefined | null) {
  return isPlatformTenantSlug(value) || isLegacyPlatformTenantSlug(value);
}
