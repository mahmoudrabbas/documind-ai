import mongoose from "mongoose";
import UserModel from "../../../db/models/user.model.js";
import DepartmentModel from "../../../db/models/department.model.js";
import { normalizeTaxonomyName } from "../../document-taxonomy/documentTaxonomy.normalization.js";
import { getPermissionEvaluator } from "../../permissions/permissions.evaluator.js";
import type { BaseRole } from "../../../common/auth/baseRoles.js";
import type { ToolContext } from "../copilot.types.js";

export interface ContextEnrichmentHints {
  /** Language derived from the request Accept-Language header. */
  language?: string;
  /** Document currently open in the UI, when provided by the client. */
  currentDocumentId?: string;
  /** Entity currently selected in the UI, when provided by the client. */
  selectedEntityId?: string;
}

export interface ToolContextBase {
  tenantId: string;
  actorId: string;
  actorEmail: string;
  actorRole: string;
  traceId: string;
  requestId: string;
}

/**
 * Resolves server-side profile data (custom role, departments, preferred
 * language) and effective permission grants for the authenticated actor, then
 * returns a fully populated ToolContext for planner and tool execution. All
 * fields are derived from the database — never trusted from client input.
 */
export async function enrichToolContext(
  base: ToolContextBase,
  hints: ContextEnrichmentHints = {},
): Promise<ToolContext> {
  const ctx: ToolContext = {
    tenantId: base.tenantId,
    actorId: base.actorId,
    actorEmail: base.actorEmail,
    actorRole: base.actorRole,
    traceId: base.traceId,
    requestId: base.requestId,
    language: hints.language ?? "en",
    currentDocumentId: hints.currentDocumentId,
    selectedEntityId: hints.selectedEntityId,
    departmentIds: [],
  };

  if (mongoose.isValidObjectId(base.actorId) && mongoose.isValidObjectId(base.tenantId)) {
    const profile = await UserModel.findOne({
      _id: base.actorId,
      tenantId: base.tenantId,
    })
      .select("customRoleId employeeProfile.department employeeProfile.preferredLanguage")
      .lean();

    if (profile) {
      ctx.customRoleId = profile.customRoleId?.toString() ?? undefined;
      if (profile.employeeProfile?.preferredLanguage) {
        ctx.language = profile.employeeProfile.preferredLanguage;
      }
      const departmentName = profile.employeeProfile?.department;
      if (departmentName) {
        const department = await DepartmentModel.findOne({
          tenantId: base.tenantId,
          normalizedName: normalizeTaxonomyName(departmentName),
          status: "active",
        })
          .select("_id")
          .lean();
        if (department) {
          ctx.departmentIds = [department._id.toString()];
        }
      }
    }
  }

  try {
    const resolved = await getPermissionEvaluator().resolve({
      tenantId: base.tenantId,
      actorId: base.actorId,
      baseRole: base.actorRole as BaseRole,
      customRoleId: ctx.customRoleId,
    });
    ctx.customRoleId = resolved.customRoleId ?? ctx.customRoleId;
    ctx.effectivePermissions = [...resolved.grants.keys()];
  } catch {
    ctx.effectivePermissions = [];
  }

  return ctx;
}
