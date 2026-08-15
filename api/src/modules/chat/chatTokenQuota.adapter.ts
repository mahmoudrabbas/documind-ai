import type {
  ChatTokenQuotaPort,
  ChatTokenQuotaReserveResult,
} from "./chatWorkflowService.js";
import { getEntitlementService } from "../entitlement/entitlement.service.js";
import {
  commitTokenQuotaReservation,
  releaseTokenQuotaReservation,
  reserveTokenQuota,
} from "../entitlement/tokenQuotaReservation.repository.js";

const CHAT_TOKEN_RESERVATION_TTL_SECONDS = 5 * 60;
const MAX_RESERVATION_ATTEMPTS = 2;

export function createProductionChatTokenQuotaPort(): ChatTokenQuotaPort {
  const entitlementService = getEntitlementService();

  return {
    async reserve(input): Promise<ChatTokenQuotaReserveResult> {
      if (
        !Number.isInteger(input.maxAmount) ||
        input.maxAmount <= 0
      ) {
        throw new Error("Invalid Chat token reservation maximum");
      }

      for (
        let attempt = 0;
        attempt < MAX_RESERVATION_ATTEMPTS;
        attempt += 1
      ) {
        const [usage, limit, periodStart] = await Promise.all([
          entitlementService.getUsage(input.tenantId),
          entitlementService.getEffectiveLimit(
            input.tenantId,
            "tokensPerMonth",
          ),
          entitlementService.getCounterPeriodKey(input.tenantId),
        ]);

        const current = usage.tokensPerMonth ?? 0;
        const remaining = Math.max(0, limit - current);

        if (remaining <= 0) {
          let periodReset: string | null = null;
          try {
            periodReset =
              await entitlementService.getPeriodReset(input.tenantId);
          } catch {
            periodReset = null;
          }

          return {
            allowed: false,
            current,
            limit,
            remaining: 0,
            periodReset,
          };
        }

        const amount = Math.min(
          input.maxAmount,
          remaining,
        );

        if (amount <= 0) {
          let periodReset: string | null = null;
          try {
            periodReset =
              await entitlementService.getPeriodReset(input.tenantId);
          } catch {
            periodReset = null;
          }

          return {
            allowed: false,
            current,
            limit,
            remaining,
            periodReset,
          };
        }

        const reservation = await reserveTokenQuota({
          tenantId: input.tenantId,
          requestId: input.requestId,
          periodStart,
          amount,
          limit,
          ttlSeconds: CHAT_TOKEN_RESERVATION_TTL_SECONDS,
        });

        if (reservation) {
          let periodReset: string | null = null;

          try {
            periodReset =
              await entitlementService.getPeriodReset(input.tenantId);
          } catch {
            periodReset = null;
          }

          return {
            allowed: true,
            reservation: {
              reservationId: reservation.reservationId,
              reservedAmount: reservation.reservedAmount,
            },
            current,
            limit,
            remaining,
            periodReset,
          };
        }

        // Another concurrent request may have consumed/reserved quota
        // between the usage snapshot and the atomic reservation attempt.
        // Re-read once and try with the newly available remainder.
      }

      const [usage, limit] = await Promise.all([
        entitlementService.getUsage(input.tenantId),
        entitlementService.getEffectiveLimit(
          input.tenantId,
          "tokensPerMonth",
        ),
      ]);

      const current = usage.tokensPerMonth ?? 0;
      const remaining = Math.max(0, limit - current);

      let periodReset: string | null = null;
      try {
        periodReset =
          await entitlementService.getPeriodReset(input.tenantId);
      } catch {
        periodReset = null;
      }

      return {
        allowed: false,
        current,
        limit,
        remaining,
        periodReset,
      };
    },

    async commit(input): Promise<void> {
      const result = await commitTokenQuotaReservation({
        tenantId: input.tenantId,
        reservationId: input.reservationId,
        actualAmount: input.actualAmount,
      });

      if (!result?.committed) {
        throw new Error(
          "Unable to commit Chat token quota reservation",
        );
      }
    },

    async release(input): Promise<void> {
      const result = await releaseTokenQuotaReservation({
        tenantId: input.tenantId,
        reservationId: input.reservationId,
      });

      if (!result?.released) {
        throw new Error(
          "Unable to release Chat token quota reservation",
        );
      }
    },
  };
}
