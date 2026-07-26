import mongoose, { type ClientSession } from "mongoose";
import DocumentAccessPolicyModel from "../../db/models/documentAccessPolicy.model.js";
import DocumentModel from "../../db/models/document.model.js";
import { normalizeDocumentAccessPolicy } from "./documentAccess.policy.validator.js";
import type { DocumentAccessPolicy } from "./documentAccess.types.js";
import type {
  DocumentAccessPolicyRepository,
  DocumentPolicyActivationResult,
  DocumentPolicyPointer,
  DocumentPolicyWriteResult,
  InitialPolicyWrite,
  NextPolicyWrite,
} from "./documentAccess.persistence.types.js";

class TransactionOutcome extends Error {
  constructor(readonly outcome: "document_not_found" | "policy_not_found" | "stale") {
    super(outcome);
  }
}

export class MongoDocumentAccessPolicyRepository implements DocumentAccessPolicyRepository {
  async listFamilyHistory(tenantId: string, documentId: string, policyId: string, cursor: number | null, limit: number) {
    const boundedLimit = Math.max(1, Math.min(100, limit));
    const records = await DocumentAccessPolicyModel.find({ tenantId, documentId, policyId,
      ...(cursor === null ? {} : { policyVersion: { $lt: cursor } }) }).sort({ policyVersion: -1 }).limit(boundedLimit + 1).lean().exec();
    const hasMore = records.length > boundedLimit; const policies = records.slice(0, boundedLimit).map(toPolicy);
    return { policies, nextCursor: hasMore ? policies.at(-1)?.policyVersion ?? null : null };
  }
  async createInitial(
    tenantId: string,
    documentId: string,
    write: InitialPolicyWrite,
  ): Promise<DocumentPolicyWriteResult> {
    if (write.policy.policyVersion !== 1) return { outcome: "version_conflict" };
    return this.createAndActivate(tenantId, documentId, write.policy, null);
  }

  async createNextAndActivate(
    tenantId: string,
    documentId: string,
    write: NextPolicyWrite,
  ): Promise<DocumentPolicyWriteResult> {
    if (
      write.policy.policyId !== write.expectedActivePolicy.policyId ||
      write.policy.policyVersion !== write.expectedActivePolicy.policyVersion + 1
    ) {
      return { outcome: "version_conflict" };
    }
    return this.createAndActivate(
      tenantId,
      documentId,
      write.policy,
      write.expectedActivePolicy,
    );
  }

  async findExact(
    tenantId: string,
    documentId: string,
    policyId: string,
    policyVersion: number,
  ): Promise<DocumentAccessPolicy | null> {
    const record = await DocumentAccessPolicyModel.findOne({
      tenantId,
      documentId,
      policyId,
      policyVersion,
    }).lean().exec();
    return record ? toPolicy(record) : null;
  }

  async findActive(tenantId: string, documentId: string): Promise<DocumentAccessPolicy | null> {
    const document = await DocumentModel.findOne({ _id: documentId, tenantId })
      .select("activePolicyId activePolicyVersion")
      .lean()
      .exec();
    if (!document?.activePolicyId || !document.activePolicyVersion) return null;
    return this.findExact(
      tenantId,
      documentId,
      document.activePolicyId.toString(),
      document.activePolicyVersion,
    );
  }

  async findLatest(
    tenantId: string,
    documentId: string,
    policyId: string,
  ): Promise<DocumentAccessPolicy | null> {
    const record = await DocumentAccessPolicyModel.findOne({ tenantId, documentId, policyId })
      .sort({ policyVersion: -1 })
      .lean()
      .exec();
    return record ? toPolicy(record) : null;
  }

  async listHistory(
    tenantId: string,
    documentId: string,
    cursor: number | null,
    limit: number,
  ) {
    const boundedLimit = Math.max(1, Math.min(100, limit));
    const records = await DocumentAccessPolicyModel.find({
      tenantId,
      documentId,
      ...(cursor === null ? {} : { policyVersion: { $lt: cursor } }),
    })
      .sort({ policyVersion: -1, policyId: 1 })
      .limit(boundedLimit + 1)
      .lean()
      .exec();
    const hasMore = records.length > boundedLimit;
    const selected = records.slice(0, boundedLimit).map(toPolicy);
    return {
      policies: selected,
      nextCursor: hasMore ? selected[selected.length - 1]?.policyVersion ?? null : null,
    };
  }

  async activateExact(
    tenantId: string,
    documentId: string,
    target: DocumentPolicyPointer,
    expectedActivePolicy: DocumentPolicyPointer | null,
  ): Promise<DocumentPolicyActivationResult> {
    try {
      return await withTransaction(async (session) => {
        const documentExists = await DocumentModel.exists({ _id: documentId, tenantId }).session(session);
        if (!documentExists) throw new TransactionOutcome("document_not_found");
        const record = await DocumentAccessPolicyModel.findOne({
          tenantId,
          documentId,
          policyId: target.policyId,
          policyVersion: target.policyVersion,
        }).session(session).lean().exec();
        if (!record) throw new TransactionOutcome("policy_not_found");
        const changed = await updatePointer(
          tenantId,
          documentId,
          target,
          expectedActivePolicy,
          session,
        );
        if (!changed) throw new TransactionOutcome("stale");
        return { outcome: "activated" as const, policy: toPolicy(record) };
      });
    } catch (error) {
      if (error instanceof TransactionOutcome) return { outcome: error.outcome };
      throw error;
    }
  }

  private async createAndActivate(
    tenantId: string,
    documentId: string,
    inputPolicy: DocumentAccessPolicy,
    expected: DocumentPolicyPointer | null,
  ): Promise<DocumentPolicyWriteResult> {
    const policy = normalizeDocumentAccessPolicy(inputPolicy);
    if (policy.tenantId !== tenantId || policy.documentId !== documentId) {
      return { outcome: "document_not_found" };
    }
    try {
      return await withTransaction(async (session) => {
        const documentExists = await DocumentModel.exists({ _id: documentId, tenantId }).session(session);
        if (!documentExists) throw new TransactionOutcome("document_not_found");
        const [created] = await DocumentAccessPolicyModel.create([toPersistence(policy)], { session });
        const changed = await updatePointer(
          tenantId,
          documentId,
          { policyId: policy.policyId, policyVersion: policy.policyVersion },
          expected,
          session,
        );
        if (!changed) throw new TransactionOutcome("stale");
        return { outcome: "created" as const, policy: toPolicy(created.toObject()) };
      });
    } catch (error) {
      if (error instanceof TransactionOutcome) {
        return {
          outcome: error.outcome === "policy_not_found" ? "document_not_found" : error.outcome,
        };
      }
      if (isDuplicateKeyError(error)) return { outcome: "version_conflict" };
      throw error;
    }
  }
}

async function updatePointer(
  tenantId: string,
  documentId: string,
  target: DocumentPolicyPointer,
  expected: DocumentPolicyPointer | null,
  session: ClientSession,
): Promise<boolean> {
  const expectedFilter = expected
    ? { activePolicyId: expected.policyId, activePolicyVersion: expected.policyVersion }
    : {
        $or: [
          { activePolicyId: { $exists: false } },
          { activePolicyId: null, activePolicyVersion: null },
        ],
      };
  const result = await DocumentModel.updateOne(
    { _id: documentId, tenantId, ...expectedFilter },
    {
      $set: {
        activePolicyId: target.policyId,
        activePolicyVersion: target.policyVersion,
        policyChangedAt: new Date(),
      },
    },
    { session, runValidators: true },
  );
  return result.modifiedCount === 1;
}

async function withTransaction<T>(operation: (session: ClientSession) => Promise<T>): Promise<T> {
  const session = await mongoose.startSession();
  let result: T | undefined;
  try {
    await session.withTransaction(async () => {
      result = await operation(session);
    });
    if (result === undefined) throw new Error("Document policy transaction did not complete");
    return result;
  } finally {
    await session.endSession();
  }
}

function toPersistence(policy: DocumentAccessPolicy): Record<string, unknown> {
  return {
    ...policy,
    effectiveFrom: new Date(policy.effectiveFrom),
    effectiveUntil: policy.effectiveUntil ? new Date(policy.effectiveUntil) : null,
    provenance: {
      ...policy.provenance,
      createdAt: new Date(policy.provenance.createdAt),
    },
    createdAt: new Date(policy.provenance.createdAt),
  };
}

function toPolicy(value: unknown): DocumentAccessPolicy {
  const record = value as Record<string, unknown>;
  const provenance = record.provenance as Record<string, unknown>;
  return normalizeDocumentAccessPolicy({
    ...record,
    tenantId: stringify(record.tenantId),
    documentId: stringify(record.documentId),
    policyId: stringify(record.policyId),
    effectiveFrom: dateString(record.effectiveFrom),
    effectiveUntil: record.effectiveUntil ? dateString(record.effectiveUntil) : null,
    inherits: record.inherits
      ? {
          ...(record.inherits as Record<string, unknown>),
          policyId: stringify((record.inherits as Record<string, unknown>).policyId),
        }
      : null,
    provenance: {
      ...provenance,
      createdBy: stringify(provenance.createdBy),
      createdAt: dateString(provenance.createdAt),
    },
    indexMetadata: normalizeMetadata(record.indexMetadata),
  });
}

function normalizeMetadata(value: unknown): Record<string, unknown> {
  const metadata = value as Record<string, unknown>;
  return {
    ...metadata,
    policyId: stringify(metadata.policyId),
    classificationId: metadata.classificationId ? stringify(metadata.classificationId) : null,
    categoryId: metadata.categoryId ? stringify(metadata.categoryId) : null,
    departmentId: metadata.departmentId ? stringify(metadata.departmentId) : null,
  };
}
function stringify(value: unknown): string {
  return typeof value === "string" ? value : (value as { toString(): string }).toString();
}
function dateString(value: unknown): string {
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
}
function isDuplicateKeyError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error &&
    (error as { code?: number }).code === 11000);
}
