import mongoose from "mongoose";
import { AppError } from "../common/errors/AppError.js";
import { DOCUMENT_POLICY_MIGRATION_CHECKPOINT_INVALID, DOCUMENT_POLICY_MIGRATION_INVALID_OPTIONS } from "../common/errors/errorCodes.js";
import { MIGRATION_BATCH_MAX, MIGRATION_LIMIT_MAX, type BackfillOptions } from "./document-policy-backfill.contracts.js";

export function parseDocumentPolicyBackfillOptions(arguments_: readonly string[]): BackfillOptions {
  const values = new Map<string, string>();
  let apply = false;
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--apply") { apply = true; continue; }
    const [name, inline] = argument.split("=", 2);
    if (!["--tenant-id", "--batch-size", "--limit", "--after-id", "--checkpoint"].includes(name)) invalid(`Unknown option: ${name}`);
    const value = inline ?? arguments_[++index];
    if (!value || value.startsWith("--") || values.has(name)) invalid(`${name} requires one value`);
    values.set(name, value);
  }
  const tenantId = values.get("--tenant-id");
  if (!tenantId || !mongoose.isObjectIdOrHexString(tenantId)) invalid("--tenant-id is required and must be an ObjectId");
  const afterId = values.get("--after-id");
  if (afterId && !mongoose.isObjectIdOrHexString(afterId)) invalid("--after-id must be an ObjectId");
  const checkpoint = values.get("--checkpoint");
  if (checkpoint && !mongoose.isObjectIdOrHexString(checkpoint)) throw new AppError(400, DOCUMENT_POLICY_MIGRATION_CHECKPOINT_INVALID, "Checkpoint must be an ObjectId");
  if (afterId && checkpoint) invalid("Use either --after-id or --checkpoint");
  const batchSize = integer(values.get("--batch-size") ?? "50", "--batch-size", MIGRATION_BATCH_MAX);
  const limit = integer(values.get("--limit") ?? String(MIGRATION_LIMIT_MAX), "--limit", MIGRATION_LIMIT_MAX);
  return { apply, tenantId, batchSize, limit, ...(afterId ? { afterId } : {}), ...(checkpoint ? { checkpoint } : {}) };
}

function integer(value: string, name: string, maximum: number): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) invalid(`${name} must be between 1 and ${maximum}`);
  return parsed;
}
function invalid(message: string): never {
  throw new AppError(400, DOCUMENT_POLICY_MIGRATION_INVALID_OPTIONS, message);
}
