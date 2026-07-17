import { Router } from "express";
import { webhookHandlerController } from "./payment-webhooks.controller.js";

const router = Router();

router.post("/stripe", webhookHandlerController);

export default router;
