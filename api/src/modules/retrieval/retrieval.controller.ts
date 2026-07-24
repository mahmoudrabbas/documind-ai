import type { NextFunction, Request, Response } from "express";
import crypto from "node:crypto";
import { AppError } from "../../common/errors/AppError.js";
import { getAuditWriter } from "../../common/observability/index.js";
import type { HybridRetrievalService } from "./retrieval.service.js";
import type {
  AccessContext,
  RetrievalQuery,
} from "./retrieval.types.js";
import { validateDebugQueryInput } from "./retrieval.validator.js";

/**
 * Creates retrieval controller handlers bound to a HybridRetrievalService instance.
 */
export function createRetrievalController(
  service: HybridRetrievalService,
) {
  /**
   * GET /retrieval/debug?q=...&topK=10&...
   *
   * SUPER_ADMIN-only debug endpoint that runs a hybrid search and returns
   * full diagnostics: filter summary, latency breakdowns, candidate scores.
   */
  async function debugSearch(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const auth = req.auth;
      if (!auth || !auth.role) {
        void getAuditWriter().write({
          tenantId: "unknown",
          resourceType: "Retrieval",
          resourceId: crypto.randomUUID(),
          action: "RETRIEVAL_DENIAL",
          actorKind: "UNAUTHENTICATED",
          outcome: "DENIED",
          metadata: { denialReason: "Authentication required" },
        });
        throw new AppError(401, "UNAUTHORIZED", "Authentication required");
      }
      if (auth.role !== "SUPER_ADMIN") {
        void getAuditWriter().write({
          tenantId: auth.tenantId,
          resourceType: "Retrieval",
          resourceId: crypto.randomUUID(),
          action: "RETRIEVAL_DENIAL",
          actorId: auth.userId,
          actorRole: auth.role,
          actorKind: "USER",
          outcome: "DENIED",
          metadata: { denialReason: "Debug endpoint requires SUPER_ADMIN role" },
        });
        throw new AppError(
          403,
          "FORBIDDEN",
          "Debug endpoint requires SUPER_ADMIN role",
        );
      }

      const params = validateDebugQueryInput(req.query);

      const accessContext: AccessContext = {
        tenantId: req.tenantId ?? auth.tenantId,
        actorId: auth.userId,
        baseRole: auth.role,
      };

      const query: RetrievalQuery = {
        queryText: params.q,
        topK: params.topK,
      };

      // Build filter from validated query params
      const hasFilter =
        params.documentIds?.length ||
        params.categories?.length ||
        params.departments?.length ||
        params.classifications?.length ||
        params.dateFrom ||
        params.dateTo ||
        params.versionIds?.length;

      if (hasFilter) {
        query.filter = {};
        if (params.documentIds?.length) {
          query.filter.documentIds = params.documentIds;
        }
        if (params.categories?.length) {
          query.filter.categories = params.categories;
        }
        if (params.departments?.length) {
          query.filter.departments = params.departments;
        }
        if (params.classifications?.length) {
          query.filter.classifications = params.classifications;
        }
        if (params.dateFrom) {
          query.filter.dateFrom = params.dateFrom;
        }
        if (params.dateTo) {
          query.filter.dateTo = params.dateTo;
        }
        if (params.versionIds?.length) {
          query.filter.versionIds = params.versionIds;
        }
      }

      const result = await service.hybridSearch(query, accessContext);

      res.status(200).json({
        success: true,
        data: {
          query: params.q,
          candidates: result.candidates,
          totalCandidates: result.totalCandidates,
          filterSummary: result.filterSummary,
          diagnostics: result.diagnostics,
          evidenceBundle: result.evidenceBundle,
        },
        trace: {
          requestId: req.requestId,
          tenantId: accessContext.tenantId,
          resultCount: result.totalCandidates,
          query: params.q,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /retrieval/search
   *
   * Authenticated hybrid search endpoint (any role with DOCUMENTS_READ).
   */
  async function hybridSearch(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const auth = req.auth;
      if (!auth || !auth.role) {
        throw new AppError(401, "UNAUTHORIZED", "Authentication required");
      }

      const accessContext: AccessContext = {
        tenantId: req.tenantId ?? auth.tenantId,
        actorId: auth.userId,
        baseRole: auth.role,
      };

      // Body is already validated by middleware — cast from validated shape
      const body = req.body as {
        queryText: string;
        topK?: number;
        filter?: RetrievalQuery["filter"];
      };

      const query: RetrievalQuery = {
        queryText: body.queryText,
        topK: body.topK ?? 10,
        filter: body.filter,
      };

      const result = await service.hybridSearch(query, accessContext);

      res.status(200).json({
        success: true,
        data: {
          query: body.queryText,
          candidates: result.candidates,
          totalCandidates: result.totalCandidates,
          filterSummary: result.filterSummary,
          diagnostics: result.diagnostics,
          evidenceBundle: result.evidenceBundle,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  return { debugSearch, hybridSearch };
}
