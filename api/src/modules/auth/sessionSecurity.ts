import type { Filter } from "mongodb";

/**
 * A refresh session is active whenever it has not been explicitly revoked.
 * Expiry is deliberately not part of this persistence invariant: legacy rows
 * with missing or malformed expiry data must be revoked before migration can
 * complete and are never treated as harmless.
 */
export const ACTIVE_REFRESH_SESSION_FILTER: Filter<Record<string, unknown>> = {
  $or: [{ revokedAt: null }, { revokedAt: { $exists: false } }],
};

export const COMPLETED_ROLE_MIGRATION_STATE = "complete" as const;

