import type { SubscriptionStatus } from "../../db/models/subscription.model.js";

export interface SubscriptionAccessInput {
  status: SubscriptionStatus; now: Date; periodEnd: Date | null; trialEnd: Date | null;
  cancelAtPeriodEnd: boolean; pastDueSince: Date | null; pastDueGraceDays: number;
}
export interface SubscriptionAccessDecision { eligible: boolean; inGracePeriod: boolean; accessEndsAt: Date | null; reason: string }

export function evaluateSubscriptionAccess(input: SubscriptionAccessInput): SubscriptionAccessDecision {
  if (input.status === "TRIALING") {
    const eligible = !input.trialEnd || input.trialEnd.getTime() > input.now.getTime();
    return { eligible, inGracePeriod: false, accessEndsAt: input.trialEnd, reason: eligible ? "TRIAL_ACTIVE" : "TRIAL_EXPIRED" };
  }
  if (input.status === "ACTIVE") {
    if (input.cancelAtPeriodEnd && input.periodEnd && input.periodEnd.getTime() <= input.now.getTime()) return denied("CANCELLATION_EFFECTIVE", input.periodEnd);
    return { eligible: true, inGracePeriod: false, accessEndsAt: input.cancelAtPeriodEnd ? input.periodEnd : null, reason: input.cancelAtPeriodEnd ? "CANCELS_AT_PERIOD_END" : "ACTIVE" };
  }
  if (input.status === "CANCEL_AT_PERIOD_END") {
    const eligible = Boolean(input.periodEnd && input.periodEnd.getTime() > input.now.getTime());
    return eligible ? { eligible: true, inGracePeriod: false, accessEndsAt: input.periodEnd, reason: "CANCELS_AT_PERIOD_END" } : denied("CANCELLATION_EFFECTIVE", input.periodEnd);
  }
  if (input.status === "PAST_DUE") {
    if (!input.pastDueSince) return denied("PAST_DUE_DATE_UNKNOWN", null);
    const graceEndsAt = new Date(input.pastDueSince.getTime() + input.pastDueGraceDays * 86_400_000);
    const eligible = graceEndsAt.getTime() > input.now.getTime();
    return eligible ? { eligible: true, inGracePeriod: true, accessEndsAt: graceEndsAt, reason: "PAST_DUE_GRACE" } : denied("PAST_DUE_GRACE_EXPIRED", graceEndsAt);
  }
  return denied(`STATUS_${input.status}`, null);
}
function denied(reason: string, accessEndsAt: Date | null): SubscriptionAccessDecision { return { eligible: false, inGracePeriod: false, accessEndsAt, reason }; }
