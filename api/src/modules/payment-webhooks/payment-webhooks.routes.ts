import { Router } from "express";
import { webhookHandlerController } from "./payment-webhooks.controller.js";

const router = Router();

/**
 * @openapi
 * /webhooks/payment/stripe:
 *   post:
 *     summary: Stripe payment webhook
 *     description: Receives Stripe webhook events for subscription, invoice,
 *       and refund lifecycle changes. The endpoint is public and verifies
 *       authenticity using the Stripe-Signature header against the raw body.
 *       Handled events update subscriptions, invoices, and refunds. The
 *       endpoint always acknowledges receipt, even when processing fails, to
 *       avoid Stripe retrying events for client errors.
 *     tags: [Payment Webhooks]
 *     security: []
 *     parameters:
 *       - in: header
 *         name: Stripe-Signature
 *         required: true
 *         schema:
 *           type: string
 *         description: Stripe signature used to verify the webhook payload
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: Raw Stripe event payload as delivered by Stripe
 *     responses:
 *       200:
 *         description: Webhook acknowledged
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 received:
 *                   type: boolean
 *                   example: true
 *       400:
 *         description: Invalid signature or malformed JSON body
 */
router.post("/stripe", webhookHandlerController);

export default router;
