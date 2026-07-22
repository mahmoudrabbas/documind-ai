import mongoose from "mongoose";
import DocumentAccessPolicyModel from "../../db/models/documentAccessPolicy.model.js";
import DocumentPolicyIdempotencyModel from "../../db/models/documentPolicyIdempotency.model.js";
import DocumentModel from "../../db/models/document.model.js";
import type { DocumentAccessPolicy } from "./documentAccess.types.js";

export type ManagementApplyResult =
  | { outcome: "applied"; policyId: string; policyVersion: number }
  | { outcome: "replay"; policyId: string; policyVersion: number }
  | { outcome: "idempotency_conflict" }
  | { outcome: "version_conflict" };

class VersionConflict extends Error {}
class IdempotencyConflict extends Error {}

export async function applyManagedPolicy(input: {
  tenantId: string; documentId: string; actorId: string; idempotencyKey: string; requestFingerprint: string;
  expectedPolicyId: string; expectedPolicyVersion: number; policy: DocumentAccessPolicy;
}): Promise<ManagementApplyResult> {
  const identity = { tenantId: input.tenantId, documentId: input.documentId, actorId: input.actorId, operation: "policy_apply" as const, key: input.idempotencyKey };
  const existing = await DocumentPolicyIdempotencyModel.findOne(identity).lean().exec();
  if (existing) return existing.requestFingerprint === input.requestFingerprint
    ? { outcome: "replay", policyId: existing.policyId.toString(), policyVersion: existing.policyVersion }
    : { outcome: "idempotency_conflict" };
  const session = await mongoose.startSession();
  let replayed = false;
  try {
    await session.withTransaction(async () => {
      const raced = await DocumentPolicyIdempotencyModel.findOne(identity).session(session).lean().exec();
      if (raced) {
        if (raced.requestFingerprint !== input.requestFingerprint) throw new IdempotencyConflict();
        replayed = true;
        return;
      }
      const changed = await DocumentModel.updateOne({ _id: input.documentId, tenantId: input.tenantId,
        activePolicyId: input.expectedPolicyId, activePolicyVersion: input.expectedPolicyVersion },
      { $set: { activePolicyId: input.policy.policyId, activePolicyVersion: input.policy.policyVersion, policyChangedAt: new Date(input.policy.provenance.createdAt) } },
      { session, runValidators: true });
      if (changed.modifiedCount !== 1) throw new VersionConflict();
      const snapshot = new DocumentAccessPolicyModel({ ...input.policy,
        rules: input.policy.rules.map((rule) => ({ ...rule, subject: { ...rule.subject }, actions: [...rule.actions] })),
        effectiveFrom: new Date(input.policy.effectiveFrom), effectiveUntil: input.policy.effectiveUntil ? new Date(input.policy.effectiveUntil) : null,
        provenance: { ...input.policy.provenance, createdAt: new Date(input.policy.provenance.createdAt) }, createdAt: new Date(input.policy.provenance.createdAt) });
      await snapshot.save({ session });
      await DocumentPolicyIdempotencyModel.create([{ ...identity, requestFingerprint: input.requestFingerprint,
        policyId: input.policy.policyId, policyVersion: input.policy.policyVersion, createdAt: new Date(), expiresAt: new Date(Date.now() + 24 * 60 * 60_000) }], { session });
    });
    const replay = await DocumentPolicyIdempotencyModel.findOne(identity).lean().exec();
    return { outcome: replayed ? "replay" : "applied", policyId: replay?.policyId.toString() ?? input.policy.policyId, policyVersion: replay?.policyVersion ?? input.policy.policyVersion };
  } catch (error) {
    if (error instanceof VersionConflict) return { outcome: "version_conflict" };
    if (error instanceof IdempotencyConflict) return { outcome: "idempotency_conflict" };
    if (isDuplicate(error)) {
      const raced = await DocumentPolicyIdempotencyModel.findOne(identity).lean().exec();
      if (raced?.requestFingerprint === input.requestFingerprint) return { outcome: "replay", policyId: raced.policyId.toString(), policyVersion: raced.policyVersion };
      return { outcome: "idempotency_conflict" };
    }
    throw error;
  } finally { await session.endSession(); }
}
function isDuplicate(error: unknown) { return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: number }).code === 11000); }
