import type { NextFunction, Request, Response } from "express";
import mongoose from "mongoose";
import { AppError } from "../../common/errors/AppError.js";
import { BAD_REQUEST, MALFORMED_OBJECT_ID } from "../../common/errors/errorCodes.js";
import { requireAuthenticatedAuditActor } from "../../common/observability/auditActor.js";
import {
  assignRole,
  changeRoleStatus,
  cloneRole,
  createRole,
  deleteRole,
  getRole,
  getRoleUsage,
  listRoles,
  migrateRoleUsers,
  removeRoleAssignment,
  updateRole,
  type RoleOperationContext,
} from "./roles.service.js";
import { validateDeleteRoleInput } from "./roles.validator.js";

function context(req: Request): RoleOperationContext {
  if (!req.auth || !req.tenantId) throw new AppError(401, "UNAUTHORIZED", "Authentication required");
  const actor = requireAuthenticatedAuditActor({
    tenantId: req.tenantId,
    actorId: req.auth.userId,
    actorEmail: req.auth.email,
    actorRole: req.auth.role,
  });
  return {
    tenantId: actor.tenantId,
    actorId: actor.actorId,
    actorEmail: actor.actorEmail,
    actorRole: actor.actorRole,
    traceId: req.traceId,
    requestId: req.requestId,
  };
}

function roleId(req: Request): string {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  if (!id) throw new AppError(400, BAD_REQUEST, "Missing role id parameter");
  if (!mongoose.isObjectIdOrHexString(id)) throw new AppError(400, MALFORMED_OBJECT_ID, "Malformed identifier");
  return id;
}

function handler(operation: (req: Request) => Promise<unknown>, status = 200, message?: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await operation(req);
      res.status(status).json({ success: true, ...(message ? { message } : {}), data });
    } catch (error) { next(error); }
  };
}

export const listRolesController = handler((req) => listRoles(context(req)));
export const getRoleController = handler((req) => getRole(context(req), roleId(req)));
export const getRoleUsageController = handler((req) => getRoleUsage(context(req), roleId(req)));
export const createRoleController = handler((req) => createRole(req.body, context(req)), 201, "Role created successfully");
export const updateRoleController = handler((req) => updateRole(req.body, context(req), roleId(req)), 200, "Role updated successfully");
export const cloneRoleController = handler((req) => cloneRole(req.body, context(req), roleId(req)), 201, "Role cloned successfully");
export const archiveRoleController = handler((req) => changeRoleStatus(req.body, context(req), roleId(req), "archived"), 200, "Role archived successfully");
export const reactivateRoleController = handler((req) => changeRoleStatus(req.body, context(req), roleId(req), "active"), 200, "Role reactivated successfully");
export const assignRoleController = handler((req) => assignRole(req.body, context(req), roleId(req)), 200, "Role assigned successfully");
export const removeRoleAssignmentController = handler((req) => removeRoleAssignment(req.body, context(req), roleId(req)), 200, "Role assignment removed successfully");
export const migrateRoleUsersController = handler((req) => migrateRoleUsers(req.body, context(req), roleId(req)), 200, "Role users migrated successfully");
export const deleteRoleController = handler((req) => {
  const id = roleId(req);
  const { version } = validateDeleteRoleInput(req.body);
  return deleteRole(context(req), id, version);
}, 200, "Role deleted successfully");
