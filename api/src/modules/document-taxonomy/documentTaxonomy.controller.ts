import type { NextFunction, Request, Response } from "express";
import { AppError } from "../../common/errors/AppError.js";
import { requireAuthenticatedAuditActor } from "../../common/observability/auditActor.js";
import {
  documentTaxonomyService,
  type DocumentTaxonomyService,
} from "./documentTaxonomy.service.js";
import type { TaxonomyKind, TaxonomyOperationContext } from "./documentTaxonomy.types.js";

const entityNames = {
  category: { singular: "category", plural: "categories" },
  department: { singular: "department", plural: "departments" },
  classification: { singular: "classification", plural: "classifications" },
} as const;

export function createDocumentTaxonomyController(
  service: DocumentTaxonomyService = documentTaxonomyService,
) {
  return {
    list: (kind: TaxonomyKind) => handler(async (req) => {
      const result = await service.list(kind, req.query, context(req));
      return {
        [entityNames[kind].plural]: result.records,
        pagination: result.pagination,
      };
    }),
    get: (kind: TaxonomyKind) => handler(async (req) => ({
      [entityNames[kind].singular]: await service.get(kind, id(req), context(req)),
    })),
    create: (kind: TaxonomyKind) => handler(async (req) => ({
      [entityNames[kind].singular]: await service.create(kind, req.body, context(req)),
    }), 201, `${title(kind)} created successfully`),
    update: (kind: TaxonomyKind) => handler(async (req) => ({
      [entityNames[kind].singular]: await service.update(kind, id(req), req.body, context(req)),
    }), 200, `${title(kind)} updated successfully`),
    archive: (kind: TaxonomyKind) => handler(async (req) => ({
      [entityNames[kind].singular]: await service.archive(kind, id(req), req.body, context(req)),
    }), 200, `${title(kind)} archived successfully`),
    restore: (kind: TaxonomyKind) => handler(async (req) => ({
      [entityNames[kind].singular]: await service.restore(kind, id(req), req.body, context(req)),
    }), 200, `${title(kind)} restored successfully`),
  };
}

function handler(
  operation: (request: Request) => Promise<unknown>,
  status = 200,
  message?: string,
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await operation(req);
      res.status(status).json({ success: true, ...(message ? { message } : {}), data });
    } catch (error) {
      next(error);
    }
  };
}

function context(req: Request): TaxonomyOperationContext {
  if (!req.auth || !req.tenantId) {
    throw new AppError(401, "UNAUTHORIZED", "Authentication required");
  }
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

function id(req: Request): string {
  const value = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  if (!value) throw new AppError(400, "BAD_REQUEST", "Missing taxonomy id parameter");
  return value;
}

function title(kind: TaxonomyKind): string {
  return kind === "classification"
    ? "Document classification"
    : kind[0].toUpperCase() + kind.slice(1);
}
