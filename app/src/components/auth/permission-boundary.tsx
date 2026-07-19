"use client";

import type { ReactNode } from "react";
import { usePermissions } from "@/providers/permission-provider";
import type { PermissionValue } from "@/types/api/permissions.types";
import { useI18n } from "@/providers/i18n-provider";

export function PermissionStatus({
  kind,
  onRetry,
}: {
  kind: "loading" | "denied" | "failed";
  onRetry?: () => void;
}) {
  const { t } = useI18n();
  const copy = {
    loading: {
      title: t("permissions.loadingTitle"),
      message: t("permissions.loadingMessage"),
    },
    denied: {
      title: t("permissions.deniedTitle"),
      message: t("permissions.deniedMessage"),
    },
    failed: {
      title: t("permissions.failedTitle"),
      message: t("permissions.failedMessage"),
    },
  }[kind];

  return (
    <section
      className="mx-auto my-10 w-[min(100%-2rem,42rem)] rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-6 text-center shadow-sm"
      aria-busy={kind === "loading"}
      aria-live="polite"
    >
      <span
        className="material-symbols-outlined text-[32px] text-primary"
        aria-hidden="true"
      >
        {kind === "loading" ? "progress_activity" : "lock"}
      </span>
      <h1 className="mt-3 text-title-lg font-bold text-on-surface">
        {copy.title}
      </h1>
      <p className="mt-2 text-sm text-on-surface-variant">{copy.message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-5 min-h-10 rounded-lg bg-primary px-4 font-bold text-on-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          {t("common.retry")}
        </button>
      ) : null}
    </section>
  );
}

export function PermissionBoundary({
  permissions,
  children,
}: {
  permissions: readonly PermissionValue[];
  children: ReactNode;
}) {
  const context = usePermissions();

  if (context.status === "loading" || context.status === "idle") {
    return <PermissionStatus kind="loading" />;
  }
  if (context.status === "error") {
    return (
      <PermissionStatus
        kind="failed"
        onRetry={() => void context.refreshPermissions()}
      />
    );
  }
  if (
    context.status === "denied" ||
    !permissions.every((permission) => context.can(permission))
  ) {
    return <PermissionStatus kind="denied" />;
  }
  return children;
}

export function PermissionAction({
  permissions,
  children,
}: {
  permissions: readonly PermissionValue[];
  children: ReactNode;
}) {
  const context = usePermissions();
  if (
    context.status !== "ready" ||
    !permissions.every((permission) => context.can(permission))
  ) {
    return null;
  }
  return children;
}
