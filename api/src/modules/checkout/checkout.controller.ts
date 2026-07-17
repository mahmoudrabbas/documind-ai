import type { NextFunction, Request, Response } from "express";
import { AppError } from "../../common/errors/AppError.js";
import { UNAUTHORIZED } from "../../common/errors/errorCodes.js";
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

export const createCheckoutController = endpoint(async (req, res) => {
  const auth = actor(req);
  const tenantId = tenant(req);
  const body = parse(createCheckoutSchema, req.body);
  const provider = getPaymentProvider();

  const successUrl = `${req.protocol}://${req.get("host")}/checkout/success?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${req.protocol}://${req.get("host")}/checkout/cancel`;

  const result = await createCheckoutSession(
    tenantId,
    body.packageId,
    body.billingInterval,
    provider,
    successUrl,
    cancelUrl,
    auth,
  );

  res.status(201).json({ success: true, data: result });
});

export const checkoutStatusController = endpoint((req) => {
  const tenantId = tenant(req);
  const params = parse(checkoutIdSchema, req.params);
  return getCheckoutStatus(params.checkoutId, tenantId);
});

export const listCheckoutSessionsController = endpoint((req) => {
  const tenantId = tenant(req);
  const query = parse(listCheckoutSchema, req.query);
  return listCheckoutSessions({ ...query, tenantId });
});

export const subscriptionStatusController = endpoint((req) => {
  const tenantId = tenant(req);
  return getSubscriptionStatus(tenantId);
});
