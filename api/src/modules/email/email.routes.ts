import { Router } from "express";
import {
  listEmails,
  getEmailStatus,
  resendEmail,
  cancelEmail
} from "./email.controller.js";
import { authenticate } from "../../common/middlewares/authenticate.middleware.js";
import { tenantScoping } from "../../common/middlewares/tenantScoping.middleware.js";
import { requirePermission } from "../permissions/permissions.middleware.js";
import { Permission } from "../permissions/permissions.catalog.js";

const router = Router();

// Requires valid user/tenant and specifically the permission to manage emails
router.use(authenticate, tenantScoping);

router.get("/", requirePermission(Permission.COMPANY_SETTINGS_READ), listEmails);
router.get("/:messageId", requirePermission(Permission.COMPANY_SETTINGS_READ), getEmailStatus);
router.post("/:messageId/resend", requirePermission(Permission.COMPANY_SETTINGS_UPDATE), resendEmail);
router.post("/:messageId/cancel", requirePermission(Permission.COMPANY_SETTINGS_UPDATE), cancelEmail);

export default router;
