import { Types } from "mongoose";
import PackageModel from "../../db/models/package.model.js";
import SubscriptionModel from "../../db/models/subscription.model.js";
import CheckoutSessionModel from "../../db/models/checkoutSession.model.js";
import { AppError } from "../../common/errors/AppError.js";
import {
  NOT_FOUND,
  BAD_REQUEST,
} from "../../common/errors/errorCodes.js";
import { getAuditWriter } from "../../common/observability/index.js";
import type { PaymentProvider } from "../billing/ports/payment-provider.port.js";
import { Permission } from "../permissions/permissions.catalog.js";
import {
  authorizeTenantOperation,
  type OperationAuthorizationContext,
  type ResolvedOperationAuthorizationContext,
} from "../permissions/permissions.operation.js";

function writeAudit(
  action: string,
  resourceId: string,
  changes: Record<string, unknown>,
  tenantId: string,
  actor: ResolvedOperationAuthorizationContext,
): void {
  const writer = getAuditWriter();
  writer
    .write({
      action: action as never,
      resourceType: "Subscription" as never,
      resourceId,
      changes,
      tenantId,
      actorId: actor.actorId,
      actorEmail: actor.actorEmail,
      actorRole: actor.actorRole,
      actorKind: actor.actorKind,
    })
    .catch((err: unknown) => {
      console.error("Audit write failed (non-blocking):", err);
    });
}

function getProviderPriceId(
  pkg: { monthlyPrice: number; annualPrice: number; code: string },
  billingInterval: "monthly" | "annual",
): string {
  const price =
    billingInterval === "annual" ? pkg.annualPrice : pkg.monthlyPrice;
  if (price <= 0) {
    throw new AppError(
      400,
      BAD_REQUEST,
      `Package has no ${billingInterval} price configured`,
    );
  }
  return `price_${pkg.code}_${billingInterval}`;
}

export async function createCheckoutSession(
  tenantId: string,
  packageId: string,
  billingInterval: "monthly" | "annual",
  provider: PaymentProvider,
  successUrl: string,
  cancelUrl: string,
  inputContext: OperationAuthorizationContext,
) {
  const actor = await authorizeTenantOperation(
    inputContext,
    Permission.BILLING_MANAGE,
  );
  if (tenantId !== actor.tenantId) {
    throw new AppError(404, NOT_FOUND, "Subscription not found");
  }
  const pkg = await PackageModel.findById(packageId).lean().exec();
  if (!pkg) {
    throw new AppError(404, NOT_FOUND, "Package not found");
  }
  if (!pkg.active) {
    throw new AppError(400, BAD_REQUEST, "Package is not active");
  }

  const sub = await SubscriptionModel.findOne({ tenantId }).lean().exec();
  if (sub && sub.status === "CANCELED") {
    throw new AppError(400, BAD_REQUEST, "Tenant subscription is canceled");
  }

  let providerCustomerId = sub?.providerCustomerId ?? "";
  if (!providerCustomerId) {
    providerCustomerId = await provider.createCustomer({
      tenantId,
      email: actor.actorEmail,
      name: actor.actorEmail,
    });
  }

  const returnUrl = successUrl;
  const cancelUrlFinal = cancelUrl;

  const priceId = getProviderPriceId(pkg, billingInterval);

  const session = await provider.createCheckoutSession({
    customerId: providerCustomerId,
    priceId,
    successUrl: returnUrl,
    cancelUrl: cancelUrlFinal,
    metadata: {
      tenantId,
      packageId,
      packageVersion: String(pkg.version),
      billingInterval,
    },
  });

  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  const checkoutSession = await CheckoutSessionModel.create({
    tenantId: new Types.ObjectId(tenantId),
    packageId: new Types.ObjectId(packageId),
    packageVersion: pkg.version,
    billingInterval,
    providerSessionId: session.id,
    providerCustomerId,
    status: "pending",
    returnUrl,
    cancelUrl: cancelUrlFinal,
    metadata: new Map(Object.entries(session.metadata)),
    expiresAt,
  });

  if (providerCustomerId && !sub?.providerCustomerId) {
    await SubscriptionModel.updateOne(
      { tenantId },
      { $set: { providerCustomerId } },
    );
  }

  writeAudit(
    "CHECKOUT_SESSION_CREATED",
    String(checkoutSession._id),
    {
      tenantId,
      packageId,
      billingInterval,
      providerSessionId: session.id,
    },
    tenantId,
    actor,
  );

  return {
    checkoutId: String(checkoutSession._id),
    sessionUrl: session.url,
    providerSessionId: session.id,
  };
}

export async function getCheckoutStatus(
  checkoutId: string,
  tenantId: string,
  inputContext: OperationAuthorizationContext,
) {
  const actor = await authorizeTenantOperation(
    inputContext,
    Permission.BILLING_READ,
  );
  if (tenantId !== actor.tenantId) {
    throw new AppError(404, NOT_FOUND, "Checkout session not found");
  }
  const session = await CheckoutSessionModel.findOne({
    _id: checkoutId,
    tenantId,
  })
    .lean()
    .exec();
  if (!session) {
    throw new AppError(404, NOT_FOUND, "Checkout session not found");
  }
  return session;
}

export async function listCheckoutSessions(
  filter: { tenantId: string; status?: string; page: number; pageSize: number },
  inputContext: OperationAuthorizationContext,
) {
  const actor = await authorizeTenantOperation(
    inputContext,
    Permission.BILLING_READ,
  );
  if (filter.tenantId !== actor.tenantId) {
    throw new AppError(404, NOT_FOUND, "Checkout sessions not found");
  }
  const query: Record<string, unknown> = {};
  query.tenantId = new Types.ObjectId(actor.tenantId);
  if (filter.status) query.status = filter.status;

  const [sessions, totalRecords] = await Promise.all([
    CheckoutSessionModel.find(query)
      .sort({ createdAt: -1 })
      .skip((filter.page - 1) * filter.pageSize)
      .limit(filter.pageSize)
      .lean()
      .exec(),
    CheckoutSessionModel.countDocuments(query),
  ]);

  return {
    sessions,
    pagination: {
      page: filter.page,
      pageSize: filter.pageSize,
      totalRecords,
      totalPages: Math.ceil(totalRecords / filter.pageSize),
    },
  };
}

export async function getSubscriptionStatus(
  tenantId: string,
  inputContext: OperationAuthorizationContext,
) {
  const actor = await authorizeTenantOperation(
    inputContext,
    Permission.BILLING_READ,
  );
  if (tenantId !== actor.tenantId) {
    throw new AppError(404, NOT_FOUND, "Subscription not found");
  }
  const sub = await SubscriptionModel.findOne({ tenantId })
    .populate("packageId", "name code version monthlyPrice annualPrice currency")
    .lean()
    .exec();
  if (!sub) {
    throw new AppError(404, NOT_FOUND, "Subscription not found for tenant");
  }
  return sub;
}
