import type { NextFunction, Request, Response } from "express";
import { AppError } from "../../common/errors/AppError.js";
import { UNAUTHORIZED } from "../../common/errors/errorCodes.js";
import { config } from "../../config/index.js";
import { assertBillingPortalReturnUrl } from "../billing/portal-url-policy.js";
import { logger } from "../../common/logger/logger.js";
import {
  createCheckoutSession,
  getCheckoutStatus,
  listCheckoutSessions,
  getSubscriptionStatus,
  createBillingPortalSession,
  synchronizeCheckoutSession,
} from "./checkout.service.js";
import {
  createCheckoutSchema,
  checkoutIdSchema,
  listCheckoutSchema,
  providerSessionIdSchema,
  parse,
} from "./checkout.validator.js";
import { getPaymentProvider } from "./payment-provider-loader.js";
import { requireAuthenticatedAuditActor } from "../../common/observability/auditActor.js";
import type { OperationAuthorizationContext } from "../permissions/permissions.operation.js";
import { FakePaymentProvider } from "../billing/ports/fakes/fake-payment-provider.js";

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

  const successUrl = config.STRIPE_SUCCESS_URL
    ? `${config.STRIPE_SUCCESS_URL}?session_id={CHECKOUT_SESSION_ID}`
    : `${config.APP_FRONTEND_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = config.STRIPE_CANCEL_URL || `${config.APP_FRONTEND_URL}/checkout/cancel`;

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
    try {
      const fakeSession = provider.sessions.find(
        (session) => session.id === result.providerSessionId,
      );
      if (!fakeSession) throw new Error("Fake Checkout Session was not found");
      const now = new Date();
      provider.attachSubscriptionToSession(result.providerSessionId, {
        id: `sub_fake_${result.providerSessionId}`,
        customerId: fakeSession.customerId,
        status: "active",
        metadata: { ...fakeSession.subscriptionMetadata },
        priceId: fakeSession.priceId,
        currentPeriodStart: now,
        currentPeriodEnd: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
        cancelAtPeriodEnd: false,
      });
      await synchronizeCheckoutSession(
        result.providerSessionId,
        tenantId,
        provider,
        operationContext(req),
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

export const synchronizeCheckoutSessionController = endpoint(async (req) => {
  const tenantId = tenant(req);
  const params = parse(providerSessionIdSchema, req.params);
  const provider = await getPaymentProvider();
  return synchronizeCheckoutSession(
    params.sessionId,
    tenantId,
    provider,
    operationContext(req),
  );
});

export const listCheckoutSessionsController = endpoint((req) => {
  const tenantId = tenant(req);
  const query = parse(listCheckoutSchema, req.query);
  return listCheckoutSessions({ ...query, tenantId }, operationContext(req));
});

export const subscriptionStatusController = endpoint((req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  const tenantId = tenant(req);
  return getSubscriptionStatus(tenantId, operationContext(req));
});

export const createBillingPortalController = endpoint(async (req) => {
  const tenantId = tenant(req);
  const provider = await getPaymentProvider();
  const returnUrl = config.STRIPE_BILLING_PORTAL_RETURN_URL || `${config.APP_FRONTEND_URL}/checkout`;
  assertBillingPortalReturnUrl(returnUrl, config.BILLING_PORTAL_ALLOWED_ORIGIN);
  return createBillingPortalSession(
    tenantId,
    operationContext(req),
    provider,
    returnUrl,
  );
});
