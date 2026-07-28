import { Router } from "express";
import { authenticate } from "../../common/middlewares/authenticate.middleware.js";
import { tenantScoping } from "../../common/middlewares/tenantScoping.middleware.js";
import { requirePermission } from "../permissions/permissions.middleware.js";
import { Permission } from "../permissions/permissions.catalog.js";
import {
  submitFeedbackController,
  getMyFeedbackForMessageController,
  listFeedbackController,
  getFeedbackStatsController,
} from "./feedback.controller.js";
import { validateSubmitFeedback, validateListFeedbackQuery } from "./feedback.validator.js";

const router = Router();

router.use(authenticate, tenantScoping);

router.post("/", requirePermission(Permission.FEEDBACK_CREATE), validateSubmitFeedback, submitFeedbackController);
router.get("/mine/messages/:messageId", requirePermission(Permission.FEEDBACK_READ), getMyFeedbackForMessageController);
router.get("/", requirePermission(Permission.FEEDBACK_READ), validateListFeedbackQuery, listFeedbackController);
router.get("/stats", requirePermission(Permission.FEEDBACK_READ), getFeedbackStatsController);

export default router;
