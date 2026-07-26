import mongoose from "mongoose";
import { AppError } from "../../common/errors/AppError.js";
import {
  DOCUMENT_ACTIVE_POLICY_CONFLICT,
  DOCUMENT_POLICY_INHERITED_REFERENCE_INVALID,
  DOCUMENT_POLICY_INVALID,
  DOCUMENT_POLICY_NOT_FOUND,
  DOCUMENT_POLICY_SCOPE_MISMATCH,
  DOCUMENT_POLICY_STALE,
  DOCUMENT_POLICY_SUBJECT_INVALID,
  DOCUMENT_POLICY_TAXONOMY_REFERENCE_INVALID,
  DOCUMENT_POLICY_VERSION_CONFLICT,
} from "../../common/errors/errorCodes.js";
import { normalizeDocumentAccessPolicy } from "./documentAccess.policy.validator.js";
import type { DocumentAccessPolicy } from "./documentAccess.types.js";
import type {
  DocumentAccessPolicyRepository,
  DocumentPolicyAuthorizationPort,
  DocumentPolicyDocumentRecord,
  DocumentPolicyOperationContext,
  DocumentPolicyPointer,
  DocumentPolicyReferencePort,
} from "./documentAccess.persistence.types.js";

export interface DocumentPolicyService {
  getActive(documentId: string, context: DocumentPolicyOperationContext): Promise<DocumentAccessPolicy>;
  getExact(
    documentId: string,
    policyId: string,
    policyVersion: number,
    context: DocumentPolicyOperationContext,
  ): Promise<DocumentAccessPolicy>;
  listHistory(
    documentId: string,
    input: unknown,
    context: DocumentPolicyOperationContext,
  ): Promise<{ policies: DocumentAccessPolicy[]; nextCursor: number | null }>;
  createInitial(
    documentId: string,
    input: unknown,
    context: DocumentPolicyOperationContext,
  ): Promise<DocumentAccessPolicy>;
  createNext(
    documentId: string,
    input: unknown,
    context: DocumentPolicyOperationContext,
  ): Promise<DocumentAccessPolicy>;
}

interface PolicyContent {
  effectiveFrom?: unknown;
  effectiveUntil?: unknown;
  inherits?: unknown;
  rules: unknown;
  indexMetadata: unknown;
  reason?: unknown;
  expectedActivePolicy?: unknown;
}

export function createDocumentPolicyService(dependencies: {
  repository: DocumentAccessPolicyRepository;
  references: DocumentPolicyReferencePort;
  authorization: DocumentPolicyAuthorizationPort;
  now?: () => string;
  newPolicyId?: () => string;
}): DocumentPolicyService {
  const { repository, references, authorization } = dependencies;
  const now = dependencies.now ?? (() => new Date().toISOString());
  const newPolicyId = dependencies.newPolicyId ?? (() => new mongoose.Types.ObjectId().toString());

  async function requireDocument(
    documentId: string,
    context: DocumentPolicyOperationContext,
  ): Promise<DocumentPolicyDocumentRecord> {
    assertId(documentId);
    const document = await references.findDocument(context.tenantId, documentId);
    if (!document) throw notFound("Document policy not found");
    return document;
  }

  async function getActive(
    documentId: string,
    context: DocumentPolicyOperationContext,
  ): Promise<DocumentAccessPolicy> {
    await authorization.authorizeRead(context);
    await requireDocument(documentId, context);
    const policy = await repository.findActive(context.tenantId, documentId);
    if (!policy) throw notFound();
    return safePolicy(policy);
  }

  async function getExact(
    documentId: string,
    policyId: string,
    policyVersion: number,
    context: DocumentPolicyOperationContext,
  ): Promise<DocumentAccessPolicy> {
    await authorization.authorizeRead(context);
    await requireDocument(documentId, context);
    assertId(policyId);
    assertPositive(policyVersion, "policyVersion");
    const policy = await repository.findExact(
      context.tenantId,
      documentId,
      policyId,
      policyVersion,
    );
    if (!policy) throw notFound();
    return safePolicy(policy);
  }

  async function listHistory(
    documentId: string,
    input: unknown,
    context: DocumentPolicyOperationContext,
  ) {
    await authorization.authorizeRead(context);
    await requireDocument(documentId, context);
    const value = optionalRecord(input);
    const limit = value.limit === undefined ? 20 : assertBoundedLimit(value.limit);
    const cursor = value.cursor == null ? null : assertPositive(value.cursor, "cursor");
    const page = await repository.listHistory(context.tenantId, documentId, cursor, limit);
    return { policies: page.policies.map(safePolicy), nextCursor: page.nextCursor };
  }

  async function createInitial(
    documentId: string,
    input: unknown,
    context: DocumentPolicyOperationContext,
  ): Promise<DocumentAccessPolicy> {
    await authorization.authorizeMutation(context);
    const document = await requireDocument(documentId, context);
    if (document.activePolicy) throw activeConflict();
    const content = policyContent(input);
    const createdAt = now();
    const policyId = newPolicyId();
    const policy = normalizeDocumentAccessPolicy({
      contractVersion: 1,
      tenantId: context.tenantId,
      documentId: document.id,
      policyId,
      policyVersion: 1,
      status: "active",
      effectiveFrom: content.effectiveFrom ?? createdAt,
      effectiveUntil: content.effectiveUntil ?? null,
      inherits: content.inherits ?? null,
      rules: content.rules,
      provenance: {
        createdBy: context.actorId,
        createdAt,
        ...(content.reason === undefined ? {} : { reason: content.reason }),
      },
      indexMetadata: withIdentity(content.indexMetadata, policyId, 1),
    });
    await validateReferences(policy, context.tenantId);
    const result = await repository.createInitial(context.tenantId, documentId, {
      policy,
      expectedActivePolicy: null,
    });
    if (result.outcome === "created") return safePolicy(result.policy);
    if (result.outcome === "stale") throw activeConflict();
    if (result.outcome === "version_conflict") throw versionConflict();
    throw notFound();
  }

  async function createNext(
    documentId: string,
    input: unknown,
    context: DocumentPolicyOperationContext,
  ): Promise<DocumentAccessPolicy> {
    await authorization.authorizeMutation(context);
    const document = await requireDocument(documentId, context);
    const content = policyContent(input);
    const expected = pointer(content.expectedActivePolicy);
    if (!document.activePolicy || !samePointer(document.activePolicy, expected)) throw stale();
    const latest = await repository.findLatest(
      context.tenantId,
      documentId,
      expected.policyId,
    );
    if (!latest || latest.policyVersion !== expected.policyVersion) throw stale();
    const createdAt = now();
    const nextVersion = expected.policyVersion + 1;
    if (!Number.isSafeInteger(nextVersion)) throw versionConflict();
    const policy = normalizeDocumentAccessPolicy({
      contractVersion: 1,
      tenantId: context.tenantId,
      documentId: document.id,
      policyId: expected.policyId,
      policyVersion: nextVersion,
      status: "active",
      effectiveFrom: content.effectiveFrom ?? createdAt,
      effectiveUntil: content.effectiveUntil ?? null,
      inherits: content.inherits ?? null,
      rules: content.rules,
      provenance: {
        createdBy: context.actorId,
        createdAt,
        ...(content.reason === undefined ? {} : { reason: content.reason }),
      },
      indexMetadata: withIdentity(content.indexMetadata, expected.policyId, nextVersion),
    });
    await validateReferences(policy, context.tenantId);
    const result = await repository.createNextAndActivate(context.tenantId, documentId, {
      policy,
      expectedActivePolicy: expected,
    });
    if (result.outcome === "created") return safePolicy(result.policy);
    if (result.outcome === "stale") throw stale();
    if (result.outcome === "version_conflict") throw versionConflict();
    throw notFound();
  }

  async function validateReferences(policy: DocumentAccessPolicy, tenantId: string): Promise<void> {
    for (const rule of policy.rules) {
      const { type, id } = rule.subject;
      if (type === "user") {
        const user = await references.findUser(tenantId, id!);
        if (!user || user.status !== "active" || user.role === "SUPER_ADMIN") throw subjectInvalid();
      } else if (type === "custom_role") {
        const role = await references.findRole(tenantId, id!);
        if (!role || role.status !== "active" || role.migrationState !== "complete") {
          throw subjectInvalid();
        }
      } else if (type === "department") {
        await requireActiveTaxonomy(tenantId, "department", id!, true);
      }
    }
    const metadata = policy.indexMetadata;
    if (metadata.categoryId) await requireActiveTaxonomy(tenantId, "category", metadata.categoryId);
    if (metadata.classificationId) {
      await requireActiveTaxonomy(tenantId, "classification", metadata.classificationId);
    }
    if (metadata.departmentId) {
      await requireActiveTaxonomy(tenantId, "department", metadata.departmentId);
    }
    if (policy.inherits) await validateInheritance(policy, tenantId);
  }

  async function requireActiveTaxonomy(
    tenantId: string,
    kind: "category" | "department" | "classification",
    id: string,
    subject = false,
  ): Promise<void> {
    const record = await references.findTaxonomy(tenantId, kind, id);
    if (!record || record.status !== "active") {
      if (subject) throw subjectInvalid();
      throw taxonomyInvalid();
    }
  }

  async function validateInheritance(policy: DocumentAccessPolicy, tenantId: string): Promise<void> {
    const seen = new Set([`${policy.policyId}:${policy.policyVersion}`]);
    let reference = policy.inherits;
    while (reference) {
      const key = `${reference.policyId}:${reference.policyVersion}`;
      if (
        seen.has(key) ||
        reference.policyId !== policy.policyId ||
        reference.policyVersion >= policy.policyVersion
      ) {
        throw inheritedInvalid();
      }
      seen.add(key);
      const inherited = await repository.findExact(
        tenantId,
        policy.documentId,
        reference.policyId,
        reference.policyVersion,
      );
      if (!inherited || inherited.tenantId !== tenantId || inherited.documentId !== policy.documentId) {
        throw inheritedInvalid();
      }
      reference = inherited.inherits ?? null;
    }
  }

  return { getActive, getExact, listHistory, createInitial, createNext };
}

function policyContent(input: unknown): PolicyContent {
  const value = optionalRecord(input);
  for (const key of ["tenantId", "documentId", "policyId", "policyVersion", "contractVersion", "status", "provenance"]) {
    if (key in value) throw invalid("Authoritative policy identity fields are not accepted");
  }
  if (!("rules" in value) || !("indexMetadata" in value)) {
    throw invalid("rules and indexMetadata are required");
  }
  return value as unknown as PolicyContent;
}

function withIdentity(value: unknown, policyId: string, policyVersion: number): Record<string, unknown> {
  const metadata = optionalRecord(value);
  if ("policyId" in metadata || "policyVersion" in metadata) {
    throw invalid("Index metadata identity is server controlled");
  }
  return { ...metadata, policyId, policyVersion };
}

function pointer(value: unknown): DocumentPolicyPointer {
  const input = optionalRecord(value);
  if (typeof input.policyId !== "string") throw stale();
  assertId(input.policyId);
  return {
    policyId: input.policyId,
    policyVersion: assertPositive(input.policyVersion, "expectedActivePolicy.policyVersion"),
  };
}
function samePointer(left: DocumentPolicyPointer, right: DocumentPolicyPointer): boolean {
  return left.policyId === right.policyId && left.policyVersion === right.policyVersion;
}
function optionalRecord(value: unknown): Record<string, unknown> {
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid("Invalid input");
  return value as Record<string, unknown>;
}
function assertBoundedLimit(value: unknown): number {
  const number = assertPositive(value, "limit");
  if (number > 100) throw invalid("limit must not exceed 100");
  return number;
}
function assertPositive(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) throw invalid(`${field} must be positive`);
  return Number(value);
}
function assertId(value: string): void {
  if (!mongoose.isObjectIdOrHexString(value)) throw notFound();
}
function safePolicy(policy: DocumentAccessPolicy): DocumentAccessPolicy {
  return normalizeDocumentAccessPolicy(policy);
}
function invalid(message: string): AppError {
  return new AppError(400, DOCUMENT_POLICY_INVALID, message);
}
function notFound(message = "Document policy not found"): AppError {
  return new AppError(404, DOCUMENT_POLICY_NOT_FOUND, message);
}
function stale(): AppError {
  return new AppError(409, DOCUMENT_POLICY_STALE, "Document policy was modified by another request");
}
function versionConflict(): AppError {
  return new AppError(409, DOCUMENT_POLICY_VERSION_CONFLICT, "Document policy version already exists");
}
function activeConflict(): AppError {
  return new AppError(409, DOCUMENT_ACTIVE_POLICY_CONFLICT, "Document already has an active policy");
}
function inheritedInvalid(): AppError {
  return new AppError(400, DOCUMENT_POLICY_INHERITED_REFERENCE_INVALID, "Inherited policy reference is invalid");
}
function subjectInvalid(): AppError {
  return new AppError(400, DOCUMENT_POLICY_SUBJECT_INVALID, "Policy subject is invalid");
}
function taxonomyInvalid(): AppError {
  return new AppError(400, DOCUMENT_POLICY_TAXONOMY_REFERENCE_INVALID, "Policy taxonomy reference is invalid");
}

/** Stable scope error reserved for adapters that detect a non-hidden authoritative mismatch. */
export function documentPolicyScopeMismatch(): AppError {
  return new AppError(400, DOCUMENT_POLICY_SCOPE_MISMATCH, "Policy tenant or document does not match");
}
