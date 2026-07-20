import type { NextFunction, Request, Response } from "express";
import { AppError } from "../../common/errors/AppError.js";
import { UNAUTHORIZED } from "../../common/errors/errorCodes.js";
import { config } from "../../config/index.js";
import { logger } from "../../common/logger/logger.js";
import {
  createCheckoutSession,
  getCheckoutStatus,
  listCheckoutSessions,
  getSubscriptionStatus,
} from "./checkout.service.js";
import {
  createCheckoutSchema,
  checkoutIdSchema,
  listCheckoutSchema,
  parse,
} from "./checkout.validator.js";
import { getPaymentProvider } from "./payment-provider-loader.js";
import { requireAuthenticatedAuditActor } from "../../common/observability/auditActor.js";
import type { OperationAuthorizationContext } from "../permissions/permissions.operation.js";
import { FakePaymentProvider } from "../billing/ports/fakes/fake-payment-provider.js";
import { transitionSubscription } from "../billing/subscription.service.js";
import CheckoutSessionModel from "../../db/models/checkoutSession.model.js";
import SubscriptionModel from "../../db/models/subscription.model.js";

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

const actor = (req: Request) => {
  if (!req.auth)
    throw new AppError(401, UNAUTHORIZED, "Authentication required");
  return req.auth;
};

const tenant = (req: Request) => {
  if (!req.tenantId)
    throw new AppError(401, UNAUTHORIZED, "Tenant context required");
  return req.tenantId;
};

const operationContext = (req: Request): OperationAuthorizationContext => {
  const auth = actor(req);
  const resolved = requireAuthenticatedAuditActor({
    tenantId: tenant(req),
    actorId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.role,
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

export const createCheckoutController = endpoint(async (req, res) => {
  const tenantId = tenant(req);
  const body = parse(createCheckoutSchema, req.body);
  const provider = await getPaymentProvider();

  const frontendUrl = config.APP_FRONTEND_URL;
  const successUrl = `${frontendUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${frontendUrl}/checkout/cancel`;

  const result = await createCheckoutSession(
    tenantId,
    body.packageId,
    body.billingInterval,
    provider,
    successUrl,
    cancelUrl,
    operationContext(req),
  );

  if (provider instanceof FakePaymentProvider) {
    provider.markSessionComplete(result.providerSessionId);

    try {
      const sub = await SubscriptionModel.findOne({ tenantId }).exec();
      if (sub && ["INCOMPLETE", "TRIALING"].includes(sub.status)) {
        await transitionSubscription(tenantId, "ACTIVE", {
          triggeredBy: "provider_event",
          providerEventId: `fake_${result.providerSessionId}`,
        });
      }

      await CheckoutSessionModel.updateOne(
        { providerSessionId: result.providerSessionId },
        { $set: { status: "completed", completedAt: new Date() } },
      );
    } catch (err) {
      logger.warn({ err }, "Failed to auto-complete fake checkout session");
    }
  }

  res.status(201).json({ success: true, data: result });
});

export const checkoutStatusController = endpoint((req) => {
  const tenantId = tenant(req);
  const params = parse(checkoutIdSchema, req.params);
  return getCheckoutStatus(params.checkoutId, tenantId, operationContext(req));
});

export const listCheckoutSessionsController = endpoint((req) => {
  const tenantId = tenant(req);
  const query = parse(listCheckoutSchema, req.query);
  return listCheckoutSessions({ ...query, tenantId }, operationContext(req));
});

export const subscriptionStatusController = endpoint((req) => {
  const tenantId = tenant(req);
  return getSubscriptionStatus(tenantId, operationContext(req));
});
