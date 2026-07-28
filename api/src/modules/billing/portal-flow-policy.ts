import { AppError } from "../../common/errors/AppError.js";
import { BILLING_PROVIDER_CONFIGURATION_INVALID } from "../../common/errors/errorCodes.js";
import { config } from "../../config/index.js";
import type { CreateBillingPortalSessionParams } from "./ports/payment-provider.port.js";

export function isBillingPortalFlowAvailable(providerName: string | null | undefined, flow: CreateBillingPortalSessionParams["flow"]): boolean {
  if (flow === "payment_method_update") return true;
  return providerName !== "stripe" || config.STRIPE_BILLING_PORTAL_GENERAL_CONFIGURATION_ID.trim().length > 0;
}

export function assertBillingPortalFlowAvailable(providerName: string | null | undefined, flow: CreateBillingPortalSessionParams["flow"]): void {
  if (!isBillingPortalFlowAvailable(providerName, flow)) {
    throw new AppError(503, BILLING_PROVIDER_CONFIGURATION_INVALID, "Billing provider configuration is invalid");
  }
}
