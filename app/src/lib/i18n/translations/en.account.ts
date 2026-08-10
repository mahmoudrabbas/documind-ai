/**
 * English translations — account, checkout, and public pages.
 *
 * Auth screens, the marketing landing page, checkout and company usage,
 * tenant settings, entitlement prompts, and shared domain widgets.
 *
 * Keys added here must have a matching entry in `ar.account.ts` — the
 * parity test in `__tests__/i18n.test.ts` enforces it.
 */

import type { TranslationDictionary } from "../i18n.types";

const enAccount: TranslationDictionary = {
  /* ── Checkout ──────────────────────────────────────────── */
  "account.checkout.title": "Choose a Subscription Plan",
  "account.checkout.description": "Upgrade your workspace limits and unlock advanced document intelligence features.",
  "account.checkout.currentPlan": "Current plan",
  "account.checkout.subscribe": "Subscribe Now",
  "account.checkout.changePlan": "Change Plan",
  "account.checkout.perMonth": "/ month",
  "account.checkout.loadingPlans": "Loading plans…",

  /* ── Billing ───────────────────────────────────────────── */
  "account.billing.title": "Billing & Subscription",
  "account.billing.description": "View current plan usage, active subscriptions, and billing history.",
  "account.billing.manageSubscription": "Manage Subscription",
  "account.billing.monthlyCost": "Monthly cost",

  /* ── Settings ──────────────────────────────────────────── */
  "account.settings.title": "Company Settings",
  "account.settings.description": "Configure company details, branding, and platform preferences.",
  "account.settings.companyName": "Company Name",
  "account.settings.slug": "Workspace Slug",
  "account.settings.saveChanges": "Save Changes",
};

export default enAccount;
