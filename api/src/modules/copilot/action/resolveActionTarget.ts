import { AppError } from "../../../common/errors/AppError.js";
import { NOT_FOUND } from "../../../common/errors/errorCodes.js";
import DocumentModel from "../../../db/models/document.model.js";
import UserModel from "../../../db/models/user.model.js";

export interface ActionTarget {
  type: "document" | "user";
  id: string;
  label: string;
}

const DOCUMENT_TARGET_TOOLS = new Set([
  "document.get",
  "document.updateMetadata",
  "document.archive",
  "document.restore",
  "document.softDelete",
  "document.permanentDelete",
]);

const USER_TARGET_TOOLS = new Set([
  "user.resendInvitation",
  "user.revokeInvitation",
  "user.delete",
]);

export function getTargetIdField(toolName: string): "documentId" | "targetUserId" | null {
  if (DOCUMENT_TARGET_TOOLS.has(toolName)) return "documentId";
  if (USER_TARGET_TOOLS.has(toolName)) return "targetUserId";
  return null;
}

/**
 * Resolves the concrete target of an action plan from the tool input. Returns
 * null for tools that have no single target (e.g. search, list, invite, settings).
 * Throws TARGET_NOT_FOUND when the tool input carries a target id that does not
 * exist in the tenant — the plan must never carry a fabricated empty target.
 */
export async function resolveActionTarget(opts: {
  toolName: string;
  toolInput: Record<string, unknown>;
  tenantId: string;
}): Promise<ActionTarget | null> {
  const { toolName, toolInput, tenantId } = opts;

  const idField = getTargetIdField(toolName);
  if (!idField) return null;

  const targetId = toolInput[idField];
  if (typeof targetId !== "string" || targetId.trim().length === 0) {
    return null;
  }

  if (idField === "documentId") {
    const doc = await DocumentModel.findOne({
      _id: targetId,
      tenantId,
    })
      .select("_id fileName metadata")
      .lean()
      .exec();
    if (!doc) {
      throw new AppError(404, NOT_FOUND, `Target document not found: ${targetId}`);
    }
    const label = doc.metadata?.title ?? doc.fileName;
    return { type: "document", id: String(doc._id), label };
  }

  const user = await UserModel.findOne({
    _id: targetId,
    tenantId,
  })
    .select("_id name email")
    .lean()
    .exec();
  if (!user) {
    throw new AppError(404, NOT_FOUND, `Target user not found: ${targetId}`);
  }
  const label = user.name || user.email;
  return { type: "user", id: String(user._id), label };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Maps a raw tool failure to a human-readable error. Zod input-validation
 * failures for a missing target field (documentId/targetUserId) are rewritten
 * so the user sees guidance instead of a serialized schema dump. Known domain
 * errors (entitlement, missing documents, permission) get a friendly message
 * with actionable guidance, mirroring the manual UI copy.
 */
export function humanizeToolFailure(
  error: { code?: string; message?: string; details?: Record<string, unknown> } | null | undefined,
  toolName: string,
): { code: string; message: string } {
  const rawMessage = error?.message ?? "Tool execution failed";
  const code = error?.code ?? "RUN_FAILED";
  const details = error?.details ?? {};

  if (code === "ENTITLEMENT_EXCEEDED") {
    const limit =
      typeof details.limit === "number"
        ? details.limit
        : Number.parseInt(rawMessage.match(/(\d+)\/(\d+)/)?.[2] ?? "", 10) || 0;
    const canUpgrade = details.canUpgrade === true;
    const base =
      limit > 0
        ? `You've reached your plan's limit of ${limit} team ${limit === 1 ? "member" : "members"}.`
        : "You've reached your plan's team member limit.";
    return {
      code,
      message: canUpgrade
        ? `${base} Upgrade your plan to invite more people.`
        : `${base} Ask a company admin to upgrade your plan.`,
    };
  }

  if (code === "DOCUMENT_NOT_FOUND" || code === "NOT_FOUND") {
    const isUserTool = USER_TARGET_TOOLS.has(toolName);
    return {
      code,
      message: isUserTool
        ? "The user was not found. They may have been removed, or you may not have access. Try naming the user by email or full name."
        : 'The document was not found. It may have been deleted, or you may not have access to it. Try naming the document again, e.g. "Delete the file contract.pdf".',
    };
  }

  if (code === "DOCUMENT_NOT_SOFT_DELETED") {
    return {
      code,
      message:
        "The document is still active. It was moved to trash automatically — you can now delete it permanently.",
    };
  }

  if (code === "PERMISSION_DENIED" || code === "FORBIDDEN") {
    return {
      code,
      message:
        "You don't have permission to do this. Ask a company admin to grant you access or do it for you.",
    };
  }

  if (code === "EMAIL_ALREADY_EXISTS") {
    return {
      code,
      message:
        "A user with this email already exists in your company. Check the users list before inviting again.",
    };
  }

  if (code === "DUPLICATE_ROLE_NAME") {
    return {
      code,
      message:
        "A role with this name already exists in your tenant. Try a different role name.",
    };
  }

  if (code === "PRIVILEGE_ESCALATION" || code === "UNKNOWN_PERMISSION") {
    const hint =
      code === "PRIVILEGE_ESCALATION"
        ? "Some requested permissions can't be delegated to custom roles by a company admin. Remove those permissions and try again."
        : "One of the requested permissions doesn't exist or can't be granted. Remove it and try again.";
    const grantDetails = details.grants;
    if (Array.isArray(grantDetails) && grantDetails.length > 0) {
      const fields = (grantDetails as { field?: string; message?: string }[])
        .filter((item) => item?.message)
        .map((item) => item.message as string);
      if (fields.length > 0) return { code, message: `${hint} ${fields.join(" ")}` };
    }
    return { code, message: hint };
  }

  if (code === "VALIDATION_ERROR" && toolName === "roles.create") {
    const grantDetails = details.grants;
    if (Array.isArray(grantDetails) && grantDetails.length > 0) {
      const fields = (grantDetails as { field?: string; message?: string }[])
        .filter((item) => item?.message)
        .map((item) => item.message as string);
      if (fields.length > 0) {
        return {
          code,
          message: `The requested permissions couldn't be saved: ${fields.join(" ")}`,
        };
      }
    }
  }

  const idField = getTargetIdField(toolName);
  if (idField && rawMessage.includes(idField)) {
    return {
      code: "TARGET_NOT_FOUND",
      message:
        idField === "documentId"
          ? "No document was specified or the document could not be found. Try again and name the document, e.g. \"Delete the file contract.pdf\"."
          : "No user was specified or the user could not be found. Try again and name the user by email or name.",
    };
  }
  return { code, message: "Something went wrong while processing your request. Please try again." };
}

/** Resolve a likely resource name out of the utterance (quoted, "named X", file-like). */
export function extractDocumentNameFromUtterance(utterance: string): string | null {
  const quoted = utterance.match(/["“"]([^"“”]{1,120})["”]/);
  if (quoted) return quoted[1].trim();
  const named = utterance.match(/(?:named|called|باسم|تسمى|اسمه|بعنوان)\s+["“"]?([^"“”!?;,]{1,80})["”]?/i);
  if (named) return named[1].trim();
  const fileLike = utterance.match(/\b([\w\- ()]{1,100}\.(?:pdf|docx?|txt|png|jpe?g|ppt|pptx|xls|xlsx|csv))(?:\s|$)/i);
  if (fileLike) return fileLike[1].trim();
  return null;
}

/** Pull a likely user identity (email or quoted name) out of the utterance. */
export function extractUserIdentityFromUtterance(utterance: string): string | null {
  const email = utterance.match(/[\w.+-]+@[\w-]+\.[\w.]+/);
  if (email) return email[0];
  const quoted = utterance.match(/["“"]([^"“”]{1,80})["”]/);
  if (quoted) return quoted[1].trim();
  return null;
}

/**
 * Resolves a single-target tool's resource id from the utterance by matching
 * tenant-scoped documents (fileName/title) or users (email/name). Returns null
 * when the utterance names nothing, names an ambiguous match, or nothing
 * exists — never fabricates an id.
 */
export async function resolveTargetFromUtterance(opts: {
  toolName: string;
  utterance: string;
  tenantId: string;
  /** When true, the whole utterance is treated as the resource name (draft
   * answers to "Which document?"), skipping phrase-style extraction. */
  bareName?: boolean;
}): Promise<{ idField: "documentId" | "targetUserId"; id: string } | null> {
  const { toolName, utterance, tenantId, bareName = false } = opts;
  const idField = getTargetIdField(toolName);
  if (!idField) return null;

  if (idField === "documentId") {
    const name = bareName
      ? utterance.trim()
      : extractDocumentNameFromUtterance(utterance);
    if (!name) return null;
    const pattern = new RegExp(escapeRegExp(name), "i");
    const docs = await DocumentModel.find({
      tenantId,
      $or: [{ fileName: pattern }, { "metadata.title": pattern }],
    })
      .select("_id")
      .limit(2)
      .lean()
      .exec();
    if (docs.length === 1) {
      return { idField, id: String(docs[0]._id) };
    }
    return null;
  }

  const identity = bareName
    ? utterance.trim()
    : extractUserIdentityFromUtterance(utterance);
  if (!identity) return null;
  const pattern = new RegExp(escapeRegExp(identity), "i");
  const users = await UserModel.find({
    tenantId,
    $or: [{ email: pattern }, { name: pattern }],
  })
    .select("_id")
    .limit(2)
    .lean()
    .exec();
  if (users.length === 1) {
    return { idField, id: String(users[0]._id) };
  }
  return null;
}
