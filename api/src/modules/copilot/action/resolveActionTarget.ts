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
 * so the user sees guidance instead of a serialized schema dump.
 */
export function humanizeToolFailure(
  error: { code?: string; message?: string } | null | undefined,
  toolName: string,
): { code: string; message: string } {
  const rawMessage = error?.message ?? "Tool execution failed";
  const code = error?.code ?? "RUN_FAILED";
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
  return { code, message: rawMessage };
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
}): Promise<{ idField: "documentId" | "targetUserId"; id: string } | null> {
  const { toolName, utterance, tenantId } = opts;
  const idField = getTargetIdField(toolName);
  if (!idField) return null;

  if (idField === "documentId") {
    const name = extractDocumentNameFromUtterance(utterance);
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

  const identity = extractUserIdentityFromUtterance(utterance);
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
