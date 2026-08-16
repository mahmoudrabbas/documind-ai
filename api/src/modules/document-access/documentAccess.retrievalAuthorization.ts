import mongoose from "mongoose";
import DocumentModel from "../../db/models/document.model.js";
import { getPermissionEvaluator } from "../permissions/permissions.evaluator.js";
import { Permission } from "../permissions/permissions.catalog.js";
import { PermissionEvaluatorDocumentCapabilityAdapter } from "./documentAccess.capability.js";
import { InMemoryDocumentAccessPolicyEvaluator } from "./documentAccess.evaluator.inMemory.js";
import { MongoDocumentAccessPolicyRepository } from "./documentAccess.policy.repository.mongo.js";
import { createDocumentRetrievalAccessFilter } from "./documentAccess.filters.js";
import type { DocumentRetrievalAccessFilter } from "./documentAccess.filters.js";
import type { DocumentAccessPolicy } from "./documentAccess.types.js";
import type { DocumentAccessActorContext } from "./documentAccess.types.js";
import {
  EXCLUDED_SEARCH_STATUSES,
  RETRIEVABLE_DOCUMENT_STATUSES,
} from "../retrieval/retrievalEligibility.js";

/**
 * Typed, fail-closed outcome of canonical retrieval authorization resolution.
 * A denied corpus is never expressed as "no restriction"; it is deny_all with
 * a machine-readable reason.
 */
export type RetrievalAuthorizationDenialReason =
  | "ACTOR_INVALID"
  | "PERMISSION_REQUIRED"
  | "RESOLVER_FAILED"
  | "NO_AUTHORIZED_DOCUMENTS";

export interface DocumentRetrievalAuthorizationResult {
  readonly filter: DocumentRetrievalAccessFilter;
  /** Present exactly when mode === "deny_all". */
  readonly denialReason?: RetrievalAuthorizationDenialReason;
  /** Number of canonical tenant documents considered before policy evaluation. */
  readonly resolvedDocumentCount: number;
}

/** Canonical tenant document projection used for allowlist resolution. */
export interface CanonicalRetrievalDocument {
  readonly documentId: string;
  readonly ownerId: string | null;
  readonly categoryId: string | null;
  readonly departmentId: string | null;
  readonly classificationId: string | null;
  readonly classification: string | null;
  readonly category: string | null;
  readonly activePolicyId: string | null;
  readonly activePolicyVersion: number | null;
  /** Candidate docs are lifecycle-filtered upstream; retained for the evaluator. */
  readonly lifecycleStatus?: "processed";
}

export interface RetrievalAuthorizationDeps {
  readonly resolveActor: (
    context: { tenantId: string; actorId: string },
  ) => Promise<DocumentAccessActorContext>;
  /** Returns the live permission grant map; a missing map entry means no grant. */
  readonly resolveUseInAiGrant: (
    actor: DocumentAccessActorContext,
  ) => Promise<{ scope: unknown } | null>;
  readonly findCandidateDocuments: (
    tenantId: string,
  ) => Promise<readonly CanonicalRetrievalDocument[]>;
  readonly findExactPolicy: (
    tenantId: string,
    documentId: string,
    policyId: string,
    policyVersion: number,
  ) => Promise<DocumentAccessPolicy | null>;
  readonly evaluate: (
    input: Parameters<InMemoryDocumentAccessPolicyEvaluator["evaluate"]>[0],
  ) => Promise<{ allowed: boolean }>;
}

/** Policy documents are resolved in bounded batches; allowlist is never truncated. */
const POLICY_BATCH_SIZE = 100;
const POLICY_BATCH_CONCURRENCY = 4;

function denyAll(
  tenantId: string,
  actorId: string,
  reason: RetrievalAuthorizationDenialReason,
  resolvedDocumentCount = 0,
): DocumentRetrievalAuthorizationResult {
  return {
    filter: createDocumentRetrievalAccessFilter({
      tenantId,
      actorId,
      mode: "deny_all",
    }),
    denialReason: reason,
    resolvedDocumentCount,
  };
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index]!);
    }
  });
  await Promise.all(runners);
  return results;
}

function canonicalDocumentFromRecord(record: {
  _id: { toString(): string } | unknown;
  owner?: unknown;
  categoryId?: unknown;
  departmentId?: unknown;
  classificationId?: unknown;
  classification?: unknown;
  category?: unknown;
  activePolicyId?: unknown;
  activePolicyVersion?: unknown;
}): CanonicalRetrievalDocument {
  const id = (value: unknown): string | null =>
    value === null || value === undefined
      ? null
      : value.toString();
  return {
    documentId: (record._id as { toString(): string }).toString(),
    ownerId: id(record.owner),
    categoryId: id(record.categoryId),
    departmentId: id(record.departmentId),
    classificationId: id(record.classificationId),
    classification: id(record.classification),
    category: id(record.category),
    activePolicyId: id(record.activePolicyId),
    activePolicyVersion:
      typeof record.activePolicyVersion === "number"
        ? record.activePolicyVersion
        : null,
    lifecycleStatus: "processed",
  };
}

/**
 * Resolves the live, fail-closed document-ID allowlist for RAG retrieval.
 *
 * Authorization decisions use ONLY canonical document fields and exact active
 * policy snapshots evaluated by the production in-memory evaluator. Chunk and
 * embedding taxonomy metadata never participate in this decision.
 */
export async function resolveCanonicalRetrievalAuthorization(
  context: { tenantId: string; actorId: string; evaluatedAt?: string },
  deps: RetrievalAuthorizationDeps,
): Promise<DocumentRetrievalAuthorizationResult> {
  let actor: DocumentAccessActorContext;
  try {
    actor = await deps.resolveActor(context);
  } catch {
    return denyAll(context.tenantId, context.actorId, "ACTOR_INVALID");
  }

  let grant: { scope: unknown } | null;
  try {
    grant = await deps.resolveUseInAiGrant(actor);
  } catch {
    return denyAll(context.tenantId, context.actorId, "RESOLVER_FAILED");
  }
  if (!grant) {
    return denyAll(context.tenantId, context.actorId, "PERMISSION_REQUIRED");
  }

  let documents: readonly CanonicalRetrievalDocument[];
  try {
    documents = await deps.findCandidateDocuments(context.tenantId);
  } catch {
    return denyAll(context.tenantId, context.actorId, "RESOLVER_FAILED");
  }

  const evaluatedAt = context.evaluatedAt ?? new Date().toISOString();
  const authorizedDocumentIds = new Set<string>();
  const batches: CanonicalRetrievalDocument[][] = [];
  for (let index = 0; index < documents.length; index += POLICY_BATCH_SIZE) {
    batches.push(documents.slice(index, index + POLICY_BATCH_SIZE));
  }

  await mapWithConcurrency(batches, POLICY_BATCH_CONCURRENCY, async (batch) => {
    for (const document of batch) {
      try {
        if (!document.activePolicyId || !document.activePolicyVersion) continue;
        const policy = await deps.findExactPolicy(
          context.tenantId,
          document.documentId,
          document.activePolicyId,
          document.activePolicyVersion,
        );
        if (!policy) continue;
        if (
          (policy.indexMetadata.categoryId ?? null) !== document.categoryId ||
          (policy.indexMetadata.departmentId ?? null) !== document.departmentId ||
          (policy.indexMetadata.classificationId ?? null) !==
            document.classificationId
        ) {
          continue;
        }
        const inherited = policy.inherits
          ? await deps.findExactPolicy(
              context.tenantId,
              document.documentId,
              policy.inherits.policyId,
              policy.inherits.policyVersion,
            )
          : null;
        if (policy.inherits && !inherited) continue;
        const decision = await deps.evaluate({
          actor,
          resource: {
            tenantId: context.tenantId,
            documentId: document.documentId,
            ownerId: document.ownerId,
            categoryId: document.categoryId,
            departmentId: document.departmentId,
            classificationId: document.classificationId,
            classification: document.classification,
            legacyCategory: document.category,
            legacyDepartment: null,
            lifecycleStatus: document.lifecycleStatus ?? "processed",
            activePolicyId: document.activePolicyId,
            activePolicyVersion: document.activePolicyVersion,
          },
          action: "use_in_ai",
          policy,
          inheritedPolicy: inherited,
          evaluatedAt,
        });
        if (decision.allowed) authorizedDocumentIds.add(document.documentId);
      } catch {
        // Fail closed for this document: it is simply not in the allowlist.
      }
    }
  });

  if (authorizedDocumentIds.size === 0) {
    return denyAll(
      context.tenantId,
      context.actorId,
      "NO_AUTHORIZED_DOCUMENTS",
      documents.length,
    );
  }
  return {
    filter: createDocumentRetrievalAccessFilter({
      tenantId: context.tenantId,
      actorId: context.actorId,
      mode: "constrained",
      constraints: { allowedDocumentIds: [...authorizedDocumentIds].sort() },
    }),
    resolvedDocumentCount: documents.length,
  };
}

/** Production Mongo-backed dependency set for the canonical resolver. */
export function createDefaultRetrievalAuthorizationDeps(
  authorization: {
    resolveActor: (context: {
      tenantId: string;
      actorId: string;
    }) => Promise<DocumentAccessActorContext>;
  },
): RetrievalAuthorizationDeps {
  const policies = new MongoDocumentAccessPolicyRepository();
  return {
    resolveActor: authorization.resolveActor,
    resolveUseInAiGrant: async (actor) => {
      const resolved = await getPermissionEvaluator().resolve({
        tenantId: actor.tenantId,
        actorId: actor.actorId,
        baseRole: actor.baseRole,
        customRoleId: actor.customRoleId,
      });
      const grant = resolved.grants.get(Permission.DOCUMENTS_USE_IN_AI);
      return grant ? { scope: grant.scope } : null;
    },
    findCandidateDocuments: async (tenantId) => {
      if (!mongoose.isObjectIdOrHexString(tenantId)) return [];
      const records = await DocumentModel.find({
        tenantId: new mongoose.Types.ObjectId(tenantId),
        deletedAt: null,
        isArchived: false,
        status: { $in: [...RETRIEVABLE_DOCUMENT_STATUSES] },
        searchStatus: { $nin: [...EXCLUDED_SEARCH_STATUSES] },
      })
        .select(
          "owner category categoryId departmentId classificationId classification activePolicyId activePolicyVersion",
        )
        .lean()
        .exec();
      return records.map(canonicalDocumentFromRecord);
    },
    findExactPolicy: (tenantId, documentId, policyId, policyVersion) =>
      policies.findExact(tenantId, documentId, policyId, policyVersion),
    evaluate: (input) =>
      new InMemoryDocumentAccessPolicyEvaluator(
        new PermissionEvaluatorDocumentCapabilityAdapter(getPermissionEvaluator()),
      ).evaluate(input),
  };
}
