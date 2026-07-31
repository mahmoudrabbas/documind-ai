import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api-client";
import {
  mapEntitlementError,
  SUBSCRIPTION_INACTIVE,
} from "@/lib/entitlement-errors";
import dictionaries from "@/lib/i18n/translations";
import { t } from "@/lib/i18n/i18n.utils";
import type { TranslationDictionary } from "@/lib/i18n/i18n.types";

function entitlementExceeded(
  details?: Record<string, unknown>,
): ApiError {
  return new ApiError({
    status: 429,
    code: "ENTITLEMENT_EXCEEDED",
    message: "Quota exceeded for tokensPerMonth: 150/100",
    details,
  });
}

describe("mapEntitlementError", () => {
  it("maps 403 SUBSCRIPTION_INACTIVE to a subscription-inactive denial", () => {
    expect(
      mapEntitlementError(
        new ApiError({
          status: 403,
          code: SUBSCRIPTION_INACTIVE,
          message: "Subscription is not active",
        }),
      ),
    ).toEqual({ kind: "subscription-inactive" });
  });

  it("maps 429 ENTITLEMENT_EXCEEDED to a quota-exceeded denial with details", () => {
    const denial = mapEntitlementError(
      entitlementExceeded({
        dimension: "tokensPerMonth",
        current: 150,
        limit: 100,
        remaining: 0,
        periodReset: "2026-08-01T00:00:00.000Z",
        canUpgrade: true,
      }),
    );
    expect(denial).toEqual({
      kind: "quota-exceeded",
      dimension: "tokensPerMonth",
      current: 150,
      limit: 100,
      remaining: 0,
      periodReset: "2026-08-01T00:00:00.000Z",
      canUpgrade: true,
    });
  });

  it("maps a 429 without details defensively", () => {
    expect(mapEntitlementError(entitlementExceeded())).toEqual({
      kind: "quota-exceeded",
      dimension: "quota",
      current: 0,
      limit: 0,
      remaining: 0,
      periodReset: null,
      canUpgrade: false,
    });
  });

  it("returns null for non-entitlement errors", () => {
    expect(
      mapEntitlementError(
        new ApiError({ status: 403, code: "PERMISSION_REQUIRED", message: "x" }),
      ),
    ).toBeNull();
    expect(
      mapEntitlementError(
        new ApiError({ status: 500, message: "internal" }),
      ),
    ).toBeNull();
    expect(mapEntitlementError(new Error("not an ApiError"))).toBeNull();
    expect(mapEntitlementError(null)).toBeNull();
    expect(mapEntitlementError(undefined)).toBeNull();
  });
});

describe("entitlement denial i18n keys", () => {
  const DENIAL_KEYS = [
    "entitlement.denial.subscriptionInactiveTitle",
    "entitlement.denial.subscriptionInactiveDescription",
    "entitlement.denial.reactivateCta",
    "entitlement.denial.reactivateHint",
    "entitlement.denial.quotaTitle",
    "entitlement.denial.quotaDescription",
  ];

  it.each(["en", "ar"] as const)(
    "defines every denial key with a non-empty value in %s",
    (locale) => {
      const dict: TranslationDictionary = dictionaries[locale];
      for (const key of DENIAL_KEYS) {
        const value = dict[key];
        expect(value, `"${key}" in "${locale}"`).toBeTruthy();
        expect(value.trim(), `"${key}" in "${locale}"`).not.toBe("");
      }
    },
  );

  it("interpolates the dimension placeholder into the quota title", () => {
    const rendered = t(dictionaries.en, "entitlement.denial.quotaTitle", {
      dimension: "Tokens Per Month",
    });
    expect(rendered).toBe("You've reached your Tokens Per Month limit");
    expect(rendered).not.toContain("{{");
  });

  it("keeps the subscription-inactive copy coherent in both locales", () => {
    const enTitle = t(
      dictionaries.en,
      "entitlement.denial.subscriptionInactiveTitle",
    );
    const arTitle = t(
      dictionaries.ar,
      "entitlement.denial.subscriptionInactiveTitle",
    );
    expect(enTitle).toBe("Subscription Inactive");
    expect(arTitle).not.toBe(enTitle);
    expect(arTitle.length).toBeGreaterThan(0);
  });
});
