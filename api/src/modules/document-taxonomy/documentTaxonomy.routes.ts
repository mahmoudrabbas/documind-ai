import { Router } from "express";
import { authenticate } from "../../common/middlewares/authenticate.middleware.js";
import { tenantScoping } from "../../common/middlewares/tenantScoping.middleware.js";
import { Permission } from "../permissions/permissions.catalog.js";
import { requirePermission } from "../permissions/permissions.middleware.js";
import { createDocumentTaxonomyController } from "./documentTaxonomy.controller.js";
import type { DocumentTaxonomyService } from "./documentTaxonomy.service.js";
import type { TaxonomyKind } from "./documentTaxonomy.types.js";

const routeDefinitions: ReadonlyArray<{ kind: TaxonomyKind; path: string }> = [
  { kind: "category", path: "categories" },
  { kind: "department", path: "departments" },
  { kind: "classification", path: "classifications" },
];

export function createDocumentTaxonomyRouter(service?: DocumentTaxonomyService) {
  const router = Router();
  const controller = createDocumentTaxonomyController(service);
  router.use(authenticate, tenantScoping);

  for (const definition of routeDefinitions) {
    const base = `/${definition.path}`;
    router.get(base, requirePermission(Permission.COMPANY_SETTINGS_READ), controller.list(definition.kind));
    router.post(base, requirePermission(Permission.COMPANY_SETTINGS_UPDATE), controller.create(definition.kind));
    router.get(`${base}/:id`, requirePermission(Permission.COMPANY_SETTINGS_READ), controller.get(definition.kind));
    router.patch(`${base}/:id`, requirePermission(Permission.COMPANY_SETTINGS_UPDATE), controller.update(definition.kind));
    router.post(`${base}/:id/archive`, requirePermission(Permission.COMPANY_SETTINGS_UPDATE), controller.archive(definition.kind));
    router.post(`${base}/:id/restore`, requirePermission(Permission.COMPANY_SETTINGS_UPDATE), controller.restore(definition.kind));
  }
  return router;
}

export default createDocumentTaxonomyRouter();
