import { Router } from "express";
import { authenticate } from "../../common/middlewares/authenticate.middleware.js";
import { authorize } from "../../common/middlewares/authorize.middleware.js";
import { getLogs, getLogById, exportLogs } from "./audit.controller.js";

const router = Router();

// Only SUPER_ADMIN and COMPANY_ADMIN can access audit logs
router.use(authenticate);
router.use(authorize("SUPER_ADMIN", "COMPANY_ADMIN"));

router.get("/logs", getLogs);
router.get("/export", exportLogs);
router.get("/logs/:id", getLogById);

export default router;
