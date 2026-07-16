import mongoose from "mongoose";
import { PERMISSION_CONTRACT_VERSION } from "../modules/permissions/permissions.catalog.js";
import { normalizeRoleGrants } from "../modules/permissions/permissions.grants.js";
import { normalizeScopes } from "../modules/permissions/permissions.scope.js";
import type { PermissionGrant, PermissionScopes } from "../modules/permissions/permissions.types.js";

type RawDocument = Record<string, unknown> & { _id?: unknown };
type Filter = Record<string, unknown>;
type Update = { $set: Record<string, unknown>; $unset?: Record<string, ""> };

export interface RawMigrationCollection {
  find(filter: Filter, options?: { projection?: Record<string, number> }): {
    sort(sort: Record<string, 1 | -1>): { toArray(): Promise<RawDocument[]> };
    toArray(): Promise<RawDocument[]>;
  };
  updateOne(filter: Filter, update: Update): Promise<{ matchedCount: number; modifiedCount: number }>;
  updateMany?(filter: Filter, update: Update): Promise<{ matchedCount: number; modifiedCount: number }>;
}

export interface RoleMigrationOptions {
  apply?: boolean;
  tenantId?: string;
  afterId?: string;
}

export interface RoleMigrationReport {
  mode: "dry-run" | "apply";
  tenantFiltered: boolean;
  afterId: string | null;
  lastScannedId: string | null;
  rolesScanned: number;
  scannedRoleIds: string[];
  rolesWithAssignments: number;
  assignments: number;
  eligible: number;
  wouldUpdate: number;
  updated: number;
  updatedRoleIds: string[];
  alreadyMigrated: number;
  quarantined: number;
  quarantinedRoleIds: string[];
  malformed: number;
  actorless: number;
  crossTenantActor: number;
  skippedInvalidIdentity: number;
  skippedConcurrentChange: number;
  grantsCreated: number;
  legacyPermissionEntriesRemoved: number;
  explicitPermissionsGranted: 0;
}

export class RoleMigrationError extends Error {
  constructor(
    public readonly code: "ROLE_READ_FAILED" | "ROLE_WRITE_FAILED",
    public readonly resumeAfterId: string | null,
  ) {
    super(code);
    this.name = "RoleMigrationError";
  }
}

const SOURCE_FIELDS = [
  "name", "normalizedName", "baseRole", "permissions", "scopes", "grants",
  "contractVersion", "status", "version", "createdBy", "updatedBy",
  "migrationState", "migrationReason", "createdAt", "updatedAt",
] as const;

function hasOwn(document: RawDocument, field: string): boolean {
  return Object.prototype.hasOwnProperty.call(document, field);
}

function isObjectId(value: unknown): value is mongoose.Types.ObjectId {
  return value instanceof mongoose.Types.ObjectId;
}

function parseObjectId(value: string | undefined, option: string): mongoose.Types.ObjectId | undefined {
  if (value === undefined) return undefined;
  if (!mongoose.isObjectIdOrHexString(value)) throw new Error(`${option} must be a 24-character ObjectId`);
  return mongoose.Types.ObjectId.createFromHexString(value);
}

function isValidName(role: RawDocument): boolean {
  if (typeof role.name !== "string") return false;
  const name = role.name.trim();
  return name.length >= 2 && name.length <= 50 &&
    typeof role.normalizedName === "string" && role.normalizedName === name.toLowerCase();
}

function isValidBaseRole(value: unknown): value is "COMPANY_ADMIN" | "EMPLOYEE" {
  return value === "COMPANY_ADMIN" || value === "EMPLOYEE";
}

function isSafeStatus(value: unknown): value is "active" | "archived" {
  return value === "active" || value === "archived";
}

function isValidVersion(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 1;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeLegacyScopes(value: unknown): PermissionScopes {
  if (value === undefined || value === null) return normalizeScopes();
  if (!isPlainObject(value)) throw new Error("MALFORMED_LEGACY_SCOPES");
  const allowed = new Set(["selfOnly", "departmentIds", "documentCategories", "documentClassifications"]);
  if (Object.keys(value).some((key) => !allowed.has(key))) throw new Error("MALFORMED_LEGACY_SCOPES");
  if (value.selfOnly !== undefined && typeof value.selfOnly !== "boolean") throw new Error("MALFORMED_LEGACY_SCOPES");
  for (const field of ["departmentIds", "documentCategories", "documentClassifications"] as const) {
    if (value[field] !== undefined && (!Array.isArray(value[field]) || value[field].some((item) => typeof item !== "string"))) {
      throw new Error("MALFORMED_LEGACY_SCOPES");
    }
  }
  return normalizeScopes(value as Partial<PermissionScopes>);
}

function convertGrants(role: RawDocument): {
  grants: PermissionGrant[];
  removed: number;
  malformedReason?: string;
} {
  if (hasOwn(role, "grants")) {
    try {
      return { grants: normalizeRoleGrants(role.grants, { requireCanonical: true }), removed: 0 };
    } catch {
      return { grants: [], removed: 0, malformedReason: "MALFORMED_GRANTS" };
    }
  }
  if (hasOwn(role, "permissions") && (!Array.isArray(role.permissions) || role.permissions.some((item) => typeof item !== "string"))) {
    return { grants: [], removed: 0, malformedReason: "MALFORMED_LEGACY_PERMISSIONS" };
  }

  let scopes: PermissionScopes;
  try {
    scopes = normalizeLegacyScopes(role.scopes);
  } catch {
    return { grants: [], removed: 0, malformedReason: "MALFORMED_LEGACY_SCOPES" };
  }
  const permissions = (role.permissions as string[] | undefined) ?? [];
  const grants: PermissionGrant[] = [];
  let removed = 0;
  for (const permission of permissions) {
    try {
      grants.push(...normalizeRoleGrants([{ permission, scopes }]));
    } catch {
      // Dropping an incompatible scoped permission is safer than broadening it to an unscoped grant.
      removed += 1;
    }
  }
  const normalized = normalizeRoleGrants(grants);
  removed += grants.length - normalized.length;
  return { grants: normalized, removed };
}

async function actorTenantState(
  users: RawMigrationCollection,
  actorId: unknown,
  tenantId: mongoose.Types.ObjectId,
): Promise<"valid" | "invalid" | "cross-tenant"> {
  if (!isObjectId(actorId)) return "invalid";
  const matches = await users.find({ _id: actorId }, { projection: { _id: 1, tenantId: 1 } }).toArray();
  if (matches.length === 0) return "invalid";
  return matches.some((user) => isObjectId(user.tenantId) && user.tenantId.equals(tenantId)) ? "valid" : "cross-tenant";
}

async function fallbackActor(
  users: RawMigrationCollection,
  tenantId: mongoose.Types.ObjectId,
  assignedUsers: RawDocument[],
): Promise<mongoose.Types.ObjectId | undefined> {
  const assigned = assignedUsers.map((user) => user._id).filter(isObjectId)
    .sort((left, right) => left.toHexString().localeCompare(right.toHexString()))[0];
  if (assigned) return assigned;
  return (await users.find({ tenantId }, { projection: { _id: 1 } }).toArray())
    .map((user) => user._id).filter(isObjectId)
    .sort((left, right) => left.toHexString().localeCompare(right.toHexString()))[0];
}

function sourceFilter(role: RawDocument): Filter {
  return {
    _id: role._id,
    tenantId: role.tenantId,
    $and: SOURCE_FIELDS.map((field) => hasOwn(role, field)
      ? { [field]: role[field] }
      : { [field]: { $exists: false } }),
  };
}

function isComplete(role: RawDocument, grants: PermissionGrant[], actorsValid: boolean): boolean {
  return actorsValid && role.contractVersion === PERMISSION_CONTRACT_VERSION &&
    role.migrationState === "complete" && isValidName(role) && isValidBaseRole(role.baseRole) &&
    isSafeStatus(role.status) && isValidVersion(role.version) &&
    JSON.stringify(role.grants) === JSON.stringify(grants) &&
    !hasOwn(role, "permissions") && !hasOwn(role, "scopes");
}

function isCompletedQuarantine(
  role: RawDocument,
  grants: PermissionGrant[],
  createdState: "valid" | "invalid" | "cross-tenant",
  updatedState: "valid" | "invalid" | "cross-tenant",
): boolean {
  const provenanceSafe = (role.createdBy === null || createdState === "valid") &&
    (role.updatedBy === null || updatedState === "valid");
  return role.migrationState === "quarantined" && role.status === "archived" &&
    role.contractVersion === PERMISSION_CONTRACT_VERSION && grants.length === 0 &&
    JSON.stringify(role.grants) === "[]" && typeof role.migrationReason === "string" &&
    role.migrationReason.length > 0 && isValidName(role) && isValidBaseRole(role.baseRole) &&
    isValidVersion(role.version) &&
    provenanceSafe && role.createdAt instanceof Date && role.updatedAt instanceof Date &&
    !hasOwn(role, "permissions") && !hasOwn(role, "scopes");
}

export async function migrateRolesPhase1(
  roles: RawMigrationCollection,
  users: RawMigrationCollection,
  options: RoleMigrationOptions = {},
): Promise<RoleMigrationReport> {
  const tenantId = parseObjectId(options.tenantId, "--tenant-id");
  const afterId = parseObjectId(options.afterId, "--after-id");
  const roleFilter: Filter = {
    ...(tenantId ? { tenantId } : {}),
    ...(afterId ? { _id: { $gt: afterId } } : {}),
  };
  let roleDocuments: RawDocument[];
  try {
    roleDocuments = await roles.find(roleFilter).sort({ _id: 1 }).toArray();
  } catch {
    throw new RoleMigrationError("ROLE_READ_FAILED", options.afterId ?? null);
  }
  const report: RoleMigrationReport = {
    mode: options.apply === true ? "apply" : "dry-run",
    tenantFiltered: tenantId !== undefined,
    afterId: afterId?.toHexString() ?? null,
    lastScannedId: null,
    rolesScanned: roleDocuments.length,
    scannedRoleIds: [], rolesWithAssignments: 0, assignments: 0, eligible: 0,
    wouldUpdate: 0, updated: 0, updatedRoleIds: [], alreadyMigrated: 0,
    quarantined: 0, quarantinedRoleIds: [], malformed: 0, actorless: 0,
    crossTenantActor: 0, skippedInvalidIdentity: 0, skippedConcurrentChange: 0,
    grantsCreated: 0, legacyPermissionEntriesRemoved: 0, explicitPermissionsGranted: 0,
  };

  for (const role of roleDocuments) {
    if (!isObjectId(role._id)) {
      report.skippedInvalidIdentity += 1;
      continue;
    }
    const roleId = role._id.toHexString();
    report.scannedRoleIds.push(roleId);
    report.lastScannedId = roleId;
    if (!isObjectId(role.tenantId)) {
      report.skippedInvalidIdentity += 1;
      continue;
    }

    const assignedUsers = await users.find(
      { tenantId: role.tenantId, customRoleId: role._id },
      { projection: { _id: 1 } },
    ).toArray();
    report.assignments += assignedUsers.length;
    if (assignedUsers.length > 0) report.rolesWithAssignments += 1;

    const converted = convertGrants(role);
    const createdState = hasOwn(role, "createdBy")
      ? await actorTenantState(users, role.createdBy, role.tenantId) : "invalid";
    const updatedState = hasOwn(role, "updatedBy")
      ? await actorTenantState(users, role.updatedBy, role.tenantId) : "invalid";
    if (isCompletedQuarantine(role, converted.grants, createdState, updatedState)) {
      report.alreadyMigrated += 1;
      continue;
    }
    const crossTenant = createdState === "cross-tenant" || updatedState === "cross-tenant";
    const actor = await fallbackActor(users, role.tenantId, assignedUsers);
    const createdBy = createdState === "valid" ? role.createdBy : actor;
    const updatedBy = updatedState === "valid" ? role.updatedBy : actor;
    const coreMalformed = !isValidName(role) || !isValidBaseRole(role.baseRole) ||
      !isSafeStatus(role.status) || !isValidVersion(role.version);
    const actorless = !createdBy || !updatedBy;
    const quarantineReason = converted.malformedReason ??
      (coreMalformed ? "MALFORMED_LEGACY_ROLE" : undefined) ??
      (crossTenant ? "CROSS_TENANT_PROVENANCE" : undefined) ??
      (actorless ? "ACTORLESS_PROVENANCE" : undefined);
    const actorsValid = createdState === "valid" && updatedState === "valid";

    if (!quarantineReason && isComplete(role, converted.grants, actorsValid)) {
      report.alreadyMigrated += 1;
      continue;
    }

    const quarantined = quarantineReason !== undefined;
    const safeName = isValidName(role) ? (role.name as string).trim() : `Quarantined ${roleId.slice(-12)}`;
    const values: Record<string, unknown> = {
      name: safeName,
      normalizedName: safeName.toLowerCase(),
      baseRole: isValidBaseRole(role.baseRole) ? role.baseRole : "EMPLOYEE",
      grants: quarantined ? [] : converted.grants,
      contractVersion: PERMISSION_CONTRACT_VERSION,
      status: quarantined ? "archived" : role.status,
      version: isValidVersion(role.version) ? role.version : 1,
      createdBy: quarantined ? (createdState === "valid" ? role.createdBy : null) : createdBy,
      updatedBy: quarantined ? (updatedState === "valid" ? role.updatedBy : null) : updatedBy,
      migrationState: quarantined ? "quarantined" : "complete",
      createdAt: role.createdAt instanceof Date ? role.createdAt : new Date(),
      updatedAt: role.updatedAt instanceof Date ? role.updatedAt : new Date(),
      ...(quarantined ? { migrationReason: quarantineReason } : {}),
    };
    report.eligible += 1;
    report.wouldUpdate += 1;
    report.grantsCreated += quarantined ? 0 : converted.grants.length;
    report.legacyPermissionEntriesRemoved += converted.removed;
    if (quarantined) {
      report.quarantined += 1;
      report.quarantinedRoleIds.push(roleId);
      if (converted.malformedReason || coreMalformed) report.malformed += 1;
      if (actorless) report.actorless += 1;
      if (crossTenant) report.crossTenantActor += 1;
    }
    if (!options.apply) continue;

    let result;
    try {
      result = await roles.updateOne(sourceFilter(role), {
        $set: values,
        $unset: {
          ...(hasOwn(role, "permissions") ? { permissions: "" as const } : {}),
          ...(hasOwn(role, "scopes") ? { scopes: "" as const } : {}),
          ...(!quarantined && hasOwn(role, "migrationReason") ? { migrationReason: "" as const } : {}),
        },
      });
    } catch {
      throw new RoleMigrationError("ROLE_WRITE_FAILED", previousScannedId(report.scannedRoleIds));
    }
    if (result.matchedCount === 1 && result.modifiedCount === 1) {
      report.updated += 1;
      report.updatedRoleIds.push(roleId);
    } else {
      report.skippedConcurrentChange += 1;
    }
  }

  return report;
}

function previousScannedId(scannedIds: string[]): string | null {
  return scannedIds.length > 1 ? scannedIds.at(-2) ?? null : null;
}
