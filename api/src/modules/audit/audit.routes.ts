import { Router } from "express";
import { authenticate } from "../../common/middlewares/authenticate.middleware.js";
import { tenantScoping } from "../../common/middlewares/tenantScoping.middleware.js";
import { requirePermission } from "../permissions/permissions.middleware.js";
import { Permission } from "../permissions/permissions.catalog.js";
import { getLogs, getLogById, exportLogs } from "./audit.controller.js";
import {
  validateAuditLogIdInput,
  validateAuditLogsInput,
  validateExportAuditLogsInput,
} from "./audit.validator.js";

const router = Router();
const validate = (
  source: "query" | "params",
  validator: (input: unknown) => unknown,
): import("express").RequestHandler =>
  (req, _res, next) => {
    try {
      validator(req[source]);
      next();
    } catch (error) {
      next(error);
    }
  };

router.use(authenticate, tenantScoping);
router.get("/logs", requirePermission(Permission.AUDIT_READ), validate("query", validateAuditLogsInput), getLogs);
router.get("/export", requirePermission(Permission.AUDIT_READ), validate("query", validateExportAuditLogsInput), exportLogs);
router.get("/logs/:id", requirePermission(Permission.AUDIT_READ), validate("params", validateAuditLogIdInput), getLogById);

export default router;
