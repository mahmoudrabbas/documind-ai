import mongoose from "mongoose";
import type { RawMigrationCollection } from "./migrate-roles-phase1.service.js";

export interface UserEmployeeMigrationOptions {
  apply?: boolean;
  tenantId?: string;
  afterId?: string;
}

export interface UserEmployeeMigrationReport {
  mode: "dry-run" | "apply";
  tenantFiltered: boolean;
  afterId: string | null;
  lastScannedId: string | null;
  usersScanned: number;
  scannedUserIds: string[];
  wouldUpdate: number;
  updated: number;
  updatedUserIds: string[];
  invalidCustomRolesCleared: number;
  skippedInvalidIdentity: number;
  skippedConcurrentChange: number;
  refreshCollectionAvailable: boolean;
  refreshRecordsRevoked: number;
  reauthenticationRequired: boolean;
}

export class UserMigrationError extends Error {
  constructor(
    public readonly code: "REFRESH_COLLECTION_REQUIRED" | "USER_TRANSITION_FAILED" | "SESSION_REVOCATION_FAILED" | "USER_COMPLETION_FAILED",
    public readonly resumeAfterId: string | null,
  ) {
    super(code);
    this.name = "UserMigrationError";
  }
}

function isObjectId(value: unknown): value is mongoose.Types.ObjectId {
  return value instanceof mongoose.Types.ObjectId;
}

function parseObjectId(value: string | undefined, option: string): mongoose.Types.ObjectId | undefined {
  if (value === undefined) return undefined;
  if (!mongoose.isObjectIdOrHexString(value)) throw new Error(`${option} must be a 24-character ObjectId`);
  return mongoose.Types.ObjectId.createFromHexString(value);
}

export async function migrateLegacyUsersToEmployee(
  users: RawMigrationCollection,
  roles: RawMigrationCollection,
  refreshTokens: RawMigrationCollection | undefined,
  options: UserEmployeeMigrationOptions = {},
): Promise<UserEmployeeMigrationReport> {
  void roles;
  const tenantId = parseObjectId(options.tenantId, "--tenant-id");
  const afterId = parseObjectId(options.afterId, "--after-id");
  const documents = await users.find({
    $or: [
      { role: "USER" },
      { role: "EMPLOYEE", roleMigrationState: "pending-session-revocation" },
    ],
    ...(tenantId ? { tenantId } : {}),
    ...(afterId ? { _id: { $gt: afterId } } : {}),
  }).sort({ _id: 1 }).toArray();
  const report: UserEmployeeMigrationReport = {
    mode: options.apply === true ? "apply" : "dry-run",
    tenantFiltered: tenantId !== undefined,
    afterId: afterId?.toHexString() ?? null,
    lastScannedId: null,
    usersScanned: documents.length,
    scannedUserIds: [], wouldUpdate: 0, updated: 0, updatedUserIds: [],
    invalidCustomRolesCleared: 0, skippedInvalidIdentity: 0,
    skippedConcurrentChange: 0, refreshCollectionAvailable: refreshTokens !== undefined,
    refreshRecordsRevoked: 0, reauthenticationRequired: documents.length > 0,
  };

  if (options.apply && !refreshTokens?.updateMany) {
    throw new UserMigrationError("REFRESH_COLLECTION_REQUIRED", options.afterId ?? null);
  }

  for (const user of documents) {
    if (!isObjectId(user._id) || !isObjectId(user.tenantId)) {
      report.skippedInvalidIdentity += 1;
      continue;
    }
    const userId = user._id.toHexString();
    report.scannedUserIds.push(userId);
    report.lastScannedId = userId;

    const hadCustomRole = user.customRoleId !== undefined && user.customRoleId !== null;
    if (hadCustomRole) {
      report.invalidCustomRolesCleared += 1;
    }
    report.wouldUpdate += 1;
    if (!options.apply) continue;

    if (user.role === "USER") {
      const customRoleCondition = Object.prototype.hasOwnProperty.call(user, "customRoleId")
        ? { customRoleId: user.customRoleId }
        : { customRoleId: { $exists: false } };
      let transition;
      try {
        transition = await users.updateOne(
          { _id: user._id, tenantId: user.tenantId, role: "USER", ...customRoleCondition },
          { $set: {
            role: "EMPLOYEE",
            customRoleId: null,
            permissionBaseline: "legacy-none",
            roleMigrationState: "pending-session-revocation",
          } },
        );
      } catch {
        throw new UserMigrationError("USER_TRANSITION_FAILED", previousId(report.scannedUserIds));
      }
      if (transition.matchedCount !== 1 || transition.modifiedCount !== 1) {
        report.skippedConcurrentChange += 1;
        continue;
      }
    }

    try {
      const revoked = await refreshTokens!.updateMany!(
        {
          tenantId: user.tenantId,
          userId: user._id,
          $or: [{ revokedAt: null }, { revokedAt: { $exists: false } }],
        },
        { $set: { revokedAt: new Date() } },
      );
      report.refreshRecordsRevoked += revoked.modifiedCount;
    } catch {
      throw new UserMigrationError("SESSION_REVOCATION_FAILED", previousId(report.scannedUserIds));
    }

    let completion;
    try {
      completion = await users.updateOne(
        {
          _id: user._id,
          tenantId: user.tenantId,
          role: "EMPLOYEE",
          permissionBaseline: "legacy-none",
          roleMigrationState: "pending-session-revocation",
        },
        { $set: { roleMigrationState: "complete" } },
      );
    } catch {
      throw new UserMigrationError("USER_COMPLETION_FAILED", previousId(report.scannedUserIds));
    }
    if (completion.matchedCount !== 1 || completion.modifiedCount !== 1) {
      report.skippedConcurrentChange += 1;
      continue;
    }
    report.updated += 1;
    report.updatedUserIds.push(userId);
  }

  return report;
}

function previousId(scannedIds: string[]): string | null {
  return scannedIds.length > 1 ? scannedIds.at(-2) ?? null : null;
}
