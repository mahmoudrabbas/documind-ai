import type { NextFunction, Request, Response } from "express";
import { AppError } from "../../common/errors/AppError.js";
import { requireAuthenticatedAuditActor } from "../../common/observability/auditActor.js";
import type { AuditOperationContext } from "../audit/audit.service.js";
import {
  createPackage,
  getOverview,
  getPackage,
  getSetting,
  getSystemHealth,
  getUsage,
  listAudit,
  listJobs,
  listPackages,
  listPlatformUsers,
  listSubscriptions,
  updatePackage,
  updateSetting,
  updateSubscription,
} from "./platform.service.js";
import {
  idSchema,
  listSchema,
  packageBodySchema,
  packageUpdateSchema,
  parse,
  settingsBodySchema,
  subscriptionUpdateSchema,
  tenantIdSchema,
} from "./platform.validator.js";

type Handler = (req: Request, res: Response) => Promise<unknown> | unknown;
const endpoint =
  (handler: Handler) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await handler(req, res);
      if (!res.headersSent) res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };
const auditContext = (req: Request): AuditOperationContext => {
  if (!req.auth || !req.tenantId) {
    throw new AppError(401, "UNAUTHORIZED", "Authentication required");
  }
  const resolved = requireAuthenticatedAuditActor({
    tenantId: req.tenantId,
    actorId: req.auth.userId,
    actorEmail: req.auth.email,
    actorRole: req.auth.role,
  });
  return {
    tenantId: resolved.tenantId,
    actorId: resolved.actorId,
    actorEmail: resolved.actorEmail,
    actorRole: resolved.actorRole,
    traceId: req.traceId,
    requestId: req.requestId,
  };
};

export const overviewController = endpoint((req) => getOverview(auditContext(req)));
export const packagesController = endpoint((req) => listPackages(auditContext(req)));
export const packageController = endpoint((req) =>
  getPackage(parse(idSchema, req.params).id, auditContext(req)),
);
/**
 * Map legacy `limits` to `entitlements` before validation, so old clients
 * sending only `limits` still work. If both are present, `entitlements` wins.
 */
function migrateLimits(body: Record<string, unknown>): Record<string, unknown> {
  if (body.entitlements || !body.limits) return body;
  const l = body.limits as Record<string, number>;
  return {
    ...body,
    entitlements: {
      employees: l.users,
      admins: 1,
      documents: l.documents,
      storageMb: l.storageMb,
      fileSizeMb: 10,
      queriesPerMonth: l.questionsPerMonth ?? l.queriesPerMonth,
      tokensPerMonth: 0,
      ocrPagesPerMonth: 0,
    },
  };
}

export const createPackageController = endpoint(async (req, res) => {
  const value = await createPackage(
    parse(packageBodySchema, migrateLimits(req.body)),
    auditContext(req),
  );
  res.status(201).json({ success: true, data: value });
});
export const updatePackageController = endpoint((req) =>
  updatePackage(
    parse(idSchema, req.params).id,
    parse(packageUpdateSchema, migrateLimits(req.body)),
    auditContext(req),
  ),
);
export const subscriptionsController = endpoint((req) => listSubscriptions(auditContext(req)));
export const updateSubscriptionController = endpoint((req) =>
  updateSubscription(
    parse(tenantIdSchema, req.params).tenantId,
    parse(subscriptionUpdateSchema, req.body),
    auditContext(req),
  ),
);
export const platformUsersController = endpoint((req) =>
  listPlatformUsers(parse(listSchema, req.query), auditContext(req)),
);
export const usageController = endpoint((req) => getUsage(auditContext(req)));
export const jobsController = endpoint((req) =>
  listJobs(parse(listSchema, req.query), auditContext(req)),
);
export const healthController = endpoint((req) => getSystemHealth(auditContext(req)));
export const auditController = endpoint((req) =>
  listAudit(parse(listSchema, req.query), auditContext(req)),
);
export const aiConfigurationController = endpoint((req) =>
  getSetting("ai_configuration", auditContext(req)),
);
export const updateAiConfigurationController = endpoint((req) =>
  updateSetting(
    "ai_configuration",
    parse(settingsBodySchema, req.body),
    auditContext(req),
  ),
);
export const settingsController = endpoint((req) => getSetting("global_settings", auditContext(req)));
export const updateSettingsController = endpoint((req) =>
  updateSetting(
    "global_settings",
    parse(settingsBodySchema, req.body),
    auditContext(req),
  ),
);
