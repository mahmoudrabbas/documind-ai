export const PLATFORM_TENANT_SLUG = "documind.ai";

export const LEGACY_PLATFORM_TENANT_SLUGS = [
  "__documind_platform__",
  "documind-ai",
] as const;

export function normalizeTenantSlugCandidate(value: string) {
  return value.toLowerCase().trim();
}

export function isPlatformTenantSlug(value: string | undefined | null) {
  if (!value) return false;
  return normalizeTenantSlugCandidate(value) === PLATFORM_TENANT_SLUG;
}

export function isLegacyPlatformTenantSlug(value: string | undefined | null) {
  if (!value) return false;
  const normalized = normalizeTenantSlugCandidate(value);
  return LEGACY_PLATFORM_TENANT_SLUGS.includes(
    normalized as (typeof LEGACY_PLATFORM_TENANT_SLUGS)[number],
  );
}

export function isReservedPlatformSlug(value: string | undefined | null) {
  return isPlatformTenantSlug(value) || isLegacyPlatformTenantSlug(value);
}

export function isBlockedCustomerTenantSlug(value: string | undefined | null) {
  if (!value) return false;
  return isReservedPlatformSlug(normalizeTenantSlugCandidate(value));
}

export function isSystemPlatformTenant(input: {
  slug?: string | null;
  isSystemTenant?: boolean | null;
}) {
  return Boolean(input.isSystemTenant) || isBlockedCustomerTenantSlug(input.slug);
}
