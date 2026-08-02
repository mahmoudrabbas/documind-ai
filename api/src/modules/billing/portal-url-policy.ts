import { AppError } from "../../common/errors/AppError.js";
import { BILLING_PROVIDER_CONFIGURATION_INVALID } from "../../common/errors/errorCodes.js";

export function assertBillingPortalReturnUrl(returnUrl: string, allowedOrigin: string): void {
  try {
    const actual = new URL(returnUrl);
    const allowed = new URL(allowedOrigin);
    if (actual.protocol !== "https:" && actual.hostname !== "localhost") throw new Error("insecure");
    if (actual.origin !== allowed.origin) throw new Error("origin");
  } catch {
    throw new AppError(500, BILLING_PROVIDER_CONFIGURATION_INVALID, "Billing portal return URL configuration is invalid");
  }
}
