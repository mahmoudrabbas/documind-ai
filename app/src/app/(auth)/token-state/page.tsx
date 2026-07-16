"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AuthPageShell } from "@/components/auth/auth-page-shell";
import { useI18n } from "@/providers/i18n-provider";

type TokenState = "expired" | "used" | "invalid" | "revoked" | "unknown";

const TOKEN_STATE_CONFIG: Record<
  TokenState,
  {
    icon: string;
    titleKey: string;
    descriptionKey: string;
    actionLabel: string;
    actionHref: string;
  }
> = {
  expired: {
    icon: "schedule",
    titleKey: "auth.tokenExpiredTitle",
    descriptionKey: "auth.tokenExpiredDescription",
    actionLabel: "Request a new link",
    actionHref: "/forgot-password",
  },
  used: {
    icon: "check_circle",
    titleKey: "auth.tokenUsedTitle",
    descriptionKey: "auth.tokenUsedDescription",
    actionLabel: "Go to sign in",
    actionHref: "/login",
  },
  invalid: {
    icon: "error",
    titleKey: "auth.tokenInvalidTitle",
    descriptionKey: "auth.tokenInvalidDescription",
    actionLabel: "Go to sign in",
    actionHref: "/login",
  },
  revoked: {
    icon: "block",
    titleKey: "auth.tokenRevokedTitle",
    descriptionKey: "auth.tokenRevokedDescription",
    actionLabel: "Request a new link",
    actionHref: "/forgot-password",
  },
  unknown: {
    icon: "help",
    titleKey: "auth.tokenInvalidTitle",
    descriptionKey: "auth.tokenInvalidDescription",
    actionLabel: "Go to sign in",
    actionHref: "/login",
  },
};

export default function TokenStatePage() {
  const searchParams = useSearchParams();
  const { t, dir, locale } = useI18n();

  const rawState = searchParams.get("state");
  const state =
    rawState && rawState in TOKEN_STATE_CONFIG
      ? (rawState as TokenState)
      : "unknown";
  const config = TOKEN_STATE_CONFIG[state];

  return (
    <main
      key={locale}
      dir={dir}
      className="flex min-h-screen w-full items-center justify-center bg-surface-container-lowest p-lg"
    >
      <AuthPageShell labelledBy="token-state-title">
        <div className="flex flex-col items-center text-center">
          <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-secondary-container/50">
            <span
              className="material-symbols-outlined text-[40px] text-secondary"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              {config.icon}
            </span>
          </div>

          <h1
            id="token-state-title"
            className="text-title-lg font-bold text-on-surface"
          >
            {t(config.titleKey)}
          </h1>

          <p className="mt-3 max-w-sm text-body-md text-on-surface-variant">
            {t(config.descriptionKey)}
          </p>

          <Link
            href={config.actionHref}
            className="mt-8 rounded-lg bg-primary px-6 py-3 text-title-sm font-medium text-on-primary transition-all hover:opacity-90 active:scale-[0.98]"
          >
            {config.actionLabel}
          </Link>

          <Link
            href="/login"
            className="mt-4 text-body-sm font-medium text-on-secondary-container hover:underline"
          >
            Back to sign in
          </Link>
        </div>
      </AuthPageShell>
    </main>
  );
}
