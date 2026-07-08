/**
 * English translation dictionary.
 *
 * Keys are dot-namespaced (`namespace.key`) so they stay flat and
 * grep-friendly. Values may contain `{{param}}` placeholders for
 * runtime interpolation.
 */

import type { TranslationDictionary } from "../i18n.types";

const en: TranslationDictionary = {
  /* ── common ────────────────────────────────────────────── */
  "common.loading": "Loading…",
  "common.error": "Something went wrong",
  "common.retry": "Retry",
  "common.cancel": "Cancel",
  "common.save": "Save",
  "common.delete": "Delete",
  "common.confirm": "Confirm",
  "common.back": "Back",
  "common.next": "Next",
  "common.close": "Close",
  "common.search": "Search",
  "common.noResults": "No results found",
  "common.welcome": "Welcome, {{name}}!",

  /* ── auth ──────────────────────────────────────────────── */
  "auth.signIn": "Sign in",
  "auth.signOut": "Sign out",
  "auth.signingIn": "Signing in…",
  "auth.secureSignIn": "Secure sign in",
  "auth.accessWorkspace": "Access your company workspace.",
  "auth.companySlug": "Company slug",
  "auth.companySlugPlaceholder": "acme-consulting",
  "auth.companySlugHelp": "Use your company workspace slug.",
  "auth.companySlugRequired": "Company slug is required.",
  "auth.email": "Email address",
  "auth.emailPlaceholder": "admin@company.com",
  "auth.emailRequired": "Email is required.",
  "auth.emailInvalid": "Enter a valid email address.",
  "auth.password": "Password",
  "auth.passwordPlaceholder": "••••••••",
  "auth.passwordRequired": "Password is required.",
  "auth.sessionNote":
    "Your session uses an in-memory access token and a secure httpOnly refresh cookie.",
  "auth.errorGeneric": "Could not sign in. Please try again.",
  "auth.errorEmailNotVerified":
    "Please verify your email before signing in.",
  "auth.errorInvalidCredentials": "Invalid company, email, or password.",
  "auth.errorAccountNotActive": "Account is not active.",
  "auth.errorTenantNotActive": "Tenant is not active.",

  /* ── nav ───────────────────────────────────────────────── */
  "nav.home": "Home",
  "nav.chat": "Chat",
  "nav.documents": "Documents",
  "nav.settings": "Settings",
  "nav.language": "Language",

  /* ── landing ───────────────────────────────────────────── */
  "landing.appName": "DocuMind AI",
  "landing.tagline": "Private AI Workspace",
  "landing.badge": "Secure company knowledge",
  "landing.heroTitle":
    "Sign in to your private company knowledge assistant.",
  "landing.heroDescription":
    "Access tenant-isolated documents, review cited answers, and work with verified internal knowledge through a secure AI workspace.",
  "landing.verifiedRetrieval": "Verified retrieval",
  "landing.answersFromApprovedFiles": "Answers from approved files",
  "landing.protected": "Protected",
  "landing.queryLabel": "Query",
  "landing.queryExample":
    "\u201CFind the latest leave carry-over policy.\u201D",
  "landing.sourceFile": "HR_Policy_2024.pdf",
  "landing.sourceDescription":
    "Verified answer returned with source citation.",
  "landing.sourcePage": "Page 14",
  "landing.trustTenantTitle": "Tenant isolated",
  "landing.trustTenantDesc":
    "Every workspace is separated by company boundary.",
  "landing.trustVerifiedTitle": "Verified access",
  "landing.trustVerifiedDesc":
    "Only activated users can access company knowledge.",
  "landing.trustPrivateTitle": "Private answers",
  "landing.trustPrivateDesc":
    "Responses are grounded in approved internal documents.",
};

export default en;
