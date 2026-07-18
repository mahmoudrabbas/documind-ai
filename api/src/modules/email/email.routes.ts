import { Router } from "express";
import {
  listEmails,
  getEmailStatus,
  resendEmail,
  cancelEmail
} from "./email.controller.js";
import { authenticate } from "../../common/middlewares/authenticate.middleware.js";
import { authorize } from "../../common/middlewares/authorize.middleware.js";
import { tenantScoping } from "../../common/middlewares/tenantScoping.middleware.js";

const router = Router();

// Requires valid user/tenant and specifically the permission to manage emails
router.use(authenticate);
router.use(tenantScoping);
router.use(authorize("COMPANY_ADMIN"));

router.get("/", listEmails);
router.get("/:messageId", getEmailStatus);
router.post("/:messageId/resend", resendEmail);
router.post("/:messageId/cancel", cancelEmail);

export default router;
