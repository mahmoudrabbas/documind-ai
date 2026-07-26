import mongoose from "mongoose";
import { AppError } from "../../common/errors/AppError.js";
import {
  DEPARTMENT_DUPLICATE,
  DOCUMENT_CATEGORY_DUPLICATE,
  DOCUMENT_CLASSIFICATION_DUPLICATE,
  MALFORMED_OBJECT_ID,
  TAXONOMY_RECORD_ALREADY_ACTIVE,
  TAXONOMY_RECORD_ARCHIVED,
  TAXONOMY_RECORD_NOT_FOUND,
  TAXONOMY_VERSION_CONFLICT,
} from "../../common/errors/errorCodes.js";
import { Permission, type PermissionValue } from "../permissions/permissions.catalog.js";
import { authorizeTenantOperation } from "../permissions/permissions.operation.js";
import { normalizeTaxonomyName } from "./documentTaxonomy.normalization.js";
import { MongoDocumentTaxonomyRepository } from "./documentTaxonomy.repository.mongo.js";
import type {
  DocumentTaxonomyRepository,
  TaxonomyKind,
  TaxonomyOperationContext,
  TaxonomyPagination,
  TaxonomyRecord,
  TaxonomyView,
} from "./documentTaxonomy.types.js";
import {
  validateCreateTaxonomyInput,
  validateTaxonomyId,
  validateTaxonomyListInput,
  validateTaxonomyStatusChange,
  validateUpdateTaxonomyInput,
} from "./documentTaxonomy.validator.js";
import { getAuditWriter } from "../../common/observability/index.js";
import type { AuditAction } from "../../common/observability/auditEvents.js";
import { requestClassificationPropagation } from "../document-access/documentTaxonomyPropagation.service.js";

export interface TaxonomyAuthorizationPort {
  authorize(context: TaxonomyOperationContext, permission: PermissionValue): Promise<void>;
}

export interface DocumentTaxonomyService {
  list(kind: TaxonomyKind, input: unknown, context: TaxonomyOperationContext): Promise<{
    records: TaxonomyView[];
    pagination: TaxonomyPagination;
  }>;
  get(kind: TaxonomyKind, idInput: unknown, context: TaxonomyOperationContext): Promise<TaxonomyView>;
  create(kind: TaxonomyKind, input: unknown, context: TaxonomyOperationContext): Promise<TaxonomyView>;
  update(
    kind: TaxonomyKind,
    idInput: unknown,
    input: unknown,
    context: TaxonomyOperationContext,
  ): Promise<TaxonomyView>;
  archive(
    kind: TaxonomyKind,
    idInput: unknown,
    input: unknown,
    context: TaxonomyOperationContext,
  ): Promise<TaxonomyView>;
  restore(
    kind: TaxonomyKind,
    idInput: unknown,
    input: unknown,
    context: TaxonomyOperationContext,
  ): Promise<TaxonomyView>;
}

export function createDocumentTaxonomyService(dependencies: {
  repository: DocumentTaxonomyRepository;
  authorization: TaxonomyAuthorizationPort;
  propagation?: { requestClassification(input: { tenantId: string; classificationId: string; taxonomyVersion: number; actorId: string }): Promise<void> };
  audit?: (input: { context: TaxonomyOperationContext; kind: TaxonomyKind; operation: "created" | "updated" | "archived" | "restored"; resourceId: string }) => Promise<void>;
}): DocumentTaxonomyService {
  const { repository, authorization } = dependencies;

  async function authorizeRead(context: TaxonomyOperationContext): Promise<void> {
    await authorization.authorize(context, Permission.COMPANY_SETTINGS_READ);
  }

  async function authorizeMutation(context: TaxonomyOperationContext): Promise<void> {
    await authorization.authorize(context, Permission.COMPANY_SETTINGS_UPDATE);
  }

  async function list(
    kind: TaxonomyKind,
    input: unknown,
    context: TaxonomyOperationContext,
  ) {
    await authorizeRead(context);
    const query = validateTaxonomyListInput(input);
    const result = await repository.list(context.tenantId, kind, query);
    return {
      records: result.records.map(toView),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        totalRecords: result.totalRecords,
        totalPages: Math.ceil(result.totalRecords / query.pageSize),
      },
    };
  }

  async function get(
    kind: TaxonomyKind,
    idInput: unknown,
    context: TaxonomyOperationContext,
  ): Promise<TaxonomyView> {
    await authorizeRead(context);
    const id = validatedId(idInput);
    const record = await repository.findByTenantAndId(context.tenantId, kind, id);
    if (!record) throw notFound();
    return toView(record);
  }

  async function create(
    kind: TaxonomyKind,
    input: unknown,
    context: TaxonomyOperationContext,
  ): Promise<TaxonomyView> {
    await authorizeMutation(context);
    const payload = validateCreateTaxonomyInput(kind, input);
    const normalizedName = normalizeTaxonomyName(payload.name);
    if (await repository.existsByNormalizedName(context.tenantId, kind, normalizedName)) {
      throw duplicate(kind);
    }
    try {
      const created = await repository.create(context.tenantId, kind, {
        name: payload.name,
        normalizedName,
        description: payload.description ?? null,
        createdBy: context.actorId,
        updatedBy: context.actorId,
        ...(kind === "classification" && payload.level ? { level: payload.level } : {}),
      });
      await dependencies.audit?.({ context, kind, operation: "created", resourceId: created.id });
      return toView(created);
    } catch (error) {
      if (isDuplicateKeyError(error)) throw duplicate(kind);
      throw error;
    }
  }

  async function update(
    kind: TaxonomyKind,
    idInput: unknown,
    input: unknown,
    context: TaxonomyOperationContext,
  ): Promise<TaxonomyView> {
    await authorizeMutation(context);
    const id = validatedId(idInput);
    const payload = validateUpdateTaxonomyInput(kind, input);
    const existing = await requireRecord(repository, context.tenantId, kind, id);
    if (existing.status === "archived") throw archived();
    if (existing.version !== payload.version) throw versionConflict();

    const normalizedName = payload.name === undefined
      ? undefined
      : normalizeTaxonomyName(payload.name);
    if (
      normalizedName &&
      await repository.existsByNormalizedName(context.tenantId, kind, normalizedName, id)
    ) {
      throw duplicate(kind);
    }
    try {
      const updated = await repository.update(context.tenantId, kind, id, {
        expectedVersion: payload.version,
        updatedBy: context.actorId,
        ...(payload.name === undefined
          ? {}
          : { name: payload.name, normalizedName: normalizedName! }),
        ...(payload.description === undefined ? {} : { description: payload.description }),
        ...(kind === "classification" && payload.level ? { level: payload.level } : {}),
      });
      if (!updated) throw versionConflict();
      await dependencies.audit?.({ context, kind, operation: "updated", resourceId: updated.id });
      if (kind === "classification" && existing.level !== updated.level) await dependencies.propagation?.requestClassification({ tenantId: context.tenantId,
        classificationId: updated.id, taxonomyVersion: updated.version, actorId: context.actorId });
      return toView(updated);
    } catch (error) {
      if (isDuplicateKeyError(error)) throw duplicate(kind);
      throw error;
    }
  }

  async function changeStatus(
    kind: TaxonomyKind,
    idInput: unknown,
    input: unknown,
    context: TaxonomyOperationContext,
    target: "active" | "archived",
  ): Promise<TaxonomyView> {
    await authorizeMutation(context);
    const id = validatedId(idInput);
    const { version } = validateTaxonomyStatusChange(input);
    const existing = await requireRecord(repository, context.tenantId, kind, id);
    if (existing.status === target) {
      throw target === "archived" ? archived() : alreadyActive();
    }
    if (existing.version !== version) throw versionConflict();
    const updated = await repository.changeStatus(
      context.tenantId,
      kind,
      id,
      version,
      target,
      context.actorId,
    );
    if (!updated) throw versionConflict();
    await dependencies.audit?.({ context, kind, operation: target === "archived" ? "archived" : "restored", resourceId: updated.id });
    if (kind === "classification") await dependencies.propagation?.requestClassification({ tenantId: context.tenantId,
      classificationId: updated.id, taxonomyVersion: updated.version, actorId: context.actorId });
    return toView(updated);
  }

  return {
    list,
    get,
    create,
    update,
    archive: (kind, id, input, context) => changeStatus(kind, id, input, context, "archived"),
    restore: (kind, id, input, context) => changeStatus(kind, id, input, context, "active"),
  };
}

const productionRepository = new MongoDocumentTaxonomyRepository();
export const documentTaxonomyService = createDocumentTaxonomyService({
  repository: productionRepository,
  authorization: {
    async authorize(context, permission) {
      await authorizeTenantOperation(context, permission);
    },
  },
  propagation: { requestClassification: requestClassificationPropagation },
  audit: ({ context, kind, operation, resourceId }) => auditTaxonomy(context, kind, operation, resourceId),
});

async function requireRecord(
  repository: DocumentTaxonomyRepository,
  tenantId: string,
  kind: TaxonomyKind,
  id: string,
): Promise<TaxonomyRecord> {
  const record = await repository.findByTenantAndId(tenantId, kind, id);
  if (!record) throw notFound();
  return record;
}

function toView(record: TaxonomyRecord): TaxonomyView {
  return {
    id: record.id,
    name: record.name,
    description: record.description,
    status: record.status,
    version: record.version,
    createdBy: record.createdBy,
    updatedBy: record.updatedBy,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    ...(record.level ? { level: record.level } : {}),
  };
}

function validatedId(input: unknown): string {
  const id = typeof input === "string" ? input : validateTaxonomyId(input);
  if (!mongoose.isObjectIdOrHexString(id)) {
    throw new AppError(400, MALFORMED_OBJECT_ID, "Malformed identifier");
  }
  return id;
}

function duplicate(kind: TaxonomyKind): AppError {
  const codes = {
    category: DOCUMENT_CATEGORY_DUPLICATE,
    department: DEPARTMENT_DUPLICATE,
    classification: DOCUMENT_CLASSIFICATION_DUPLICATE,
  } as const;
  return new AppError(409, codes[kind], `A ${kind} with this name already exists in your tenant`);
}

function notFound(): AppError {
  return new AppError(404, TAXONOMY_RECORD_NOT_FOUND, "Taxonomy record not found");
}

function archived(): AppError {
  return new AppError(409, TAXONOMY_RECORD_ARCHIVED, "Taxonomy record is archived");
}

function alreadyActive(): AppError {
  return new AppError(409, TAXONOMY_RECORD_ALREADY_ACTIVE, "Taxonomy record is already active");
}

function versionConflict(): AppError {
  return new AppError(409, TAXONOMY_VERSION_CONFLICT, "Taxonomy record was modified by another request");
}

function isDuplicateKeyError(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: number }).code === 11000,
  );
}

async function auditTaxonomy(context: TaxonomyOperationContext, kind: TaxonomyKind,
  operation: "created" | "updated" | "archived" | "restored", resourceId: string) {
  const prefix = kind === "category" ? "DOCUMENT_CATEGORY" : kind === "department" ? "DOCUMENT_DEPARTMENT" : "DOCUMENT_CLASSIFICATION";
  const action = `${prefix}_${operation.toUpperCase()}` as AuditAction;
  await getAuditWriter().write({ action, resourceType: "DocumentTaxonomy", resourceId, tenantId: context.tenantId,
    actorId: context.actorId, metadata: { taxonomyEntityId: resourceId, taxonomyType: kind, operation } });
}
