import { Router } from "express";
import { authenticate } from "../../common/middlewares/authenticate.middleware.js";
import { tenantScoping } from "../../common/middlewares/tenantScoping.middleware.js";
import { authorize } from "../../common/middlewares/authorize.middleware.js";
import { requirePermission } from "../permissions/permissions.middleware.js";
import { Permission } from "../permissions/permissions.catalog.js";
import { createRetrievalController } from "./retrieval.controller.js";
import type { HybridRetrievalService } from "./retrieval.service.js";

/**
 * Creates retrieval routes bound to a HybridRetrievalService instance.
 *
 * Routes:
 *   GET  /retrieval/debug   — SUPER_ADMIN-only debug endpoint
 *   POST /retrieval/search  — Authenticated hybrid search
 */
export function createRetrievalRoutes(
  service: HybridRetrievalService,
): Router {
  const router = Router();
  const controller = createRetrievalController(service);

  // Debug endpoint — SUPER_ADMIN only
  router.get(
    "/debug",
    authenticate,
    tenantScoping,
    authorize("SUPER_ADMIN"),
    controller.debugSearch,
  );

  // Hybrid search — any authenticated user with DOCUMENTS_READ
  router.post(
    "/search",
    authenticate,
    tenantScoping,
    requirePermission(Permission.DOCUMENTS_READ),
    controller.hybridSearch,
  );

  return router;
}
