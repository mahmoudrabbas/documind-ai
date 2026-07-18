import mongoose from "mongoose";
import { isBaseRole, type BaseRole } from "../auth/baseRoles.js";
import { AppError } from "../errors/AppError.js";
import { PERMISSION_REQUIRED } from "../errors/errorCodes.js";
import type { AuditActorKind } from "./auditEvents.js";

export interface AuthenticatedAuditActor {
  tenantId: string;
  actorId: string;
  actorEmail: string;
  actorRole: BaseRole;
  actorKind: Extract<AuditActorKind, "USER">;
}

export function requireAuthenticatedAuditActor(input: {
  tenantId: unknown;
  actorId: unknown;
  actorEmail: unknown;
  actorRole: unknown;
}): AuthenticatedAuditActor {
  const actorEmail =
    typeof input.actorEmail === "string"
      ? input.actorEmail.trim().toLowerCase()
      : "";

  if (
    typeof input.tenantId !== "string" ||
    !mongoose.isObjectIdOrHexString(input.tenantId) ||
    typeof input.actorId !== "string" ||
    !mongoose.isObjectIdOrHexString(input.actorId) ||
    !isBaseRole(input.actorRole) ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(actorEmail) ||
    actorEmail.length > 254
  ) {
    throw new AppError(403, PERMISSION_REQUIRED, "Permission denied");
  }

  return {
    tenantId: input.tenantId,
    actorId: input.actorId,
    actorEmail,
    actorRole: input.actorRole,
    actorKind: "USER",
  };
}
