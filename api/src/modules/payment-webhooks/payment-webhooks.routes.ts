import { Router } from "express";
import { webhookHandlerController } from "./payment-webhooks.controller.js";
import { rejectForbiddenOrigin } from "../../common/security/webhookAuth.js";

const router = Router();

// Origin defense-in-depth alongside Stripe signature verification.
router.use(rejectForbiddenOrigin());

router.post("/stripe", webhookHandlerController);

export default router;
