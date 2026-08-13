"use client";

import { useState } from "react";
import { useAuth } from "@/providers/auth-provider";
import { useI18n } from "@/providers/i18n-provider";
import { codeLabel } from "@/lib/i18n/code-label";

export function SessionSecurity() {
  const { user, revokeOtherSessions } = useAuth();
  const { t } = useI18n();
  const [isRevoking, setIsRevoking] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  async function handleRevokeOtherSessions() {
    setIsRevoking(true);
    setMessage(null);
    try {
      await revokeOtherSessions();
      setMessage({
        type: "success",
        text: t("auth.sessionsRevokedSuccess"),
      });
    } catch {
      setMessage({
        type: "error",
        text: t("auth.sessionsRevokeError"),
      });
    } finally {
      setIsRevoking(false);
      setShowConfirm(false);
    }
  }

  return (
    <div className="rounded-xl border border-outline-variant bg-surface p-6">
      <h3 className="text-title-md font-semibold text-on-surface">
        {t("auth.sessionSecurityTitle")}
      </h3>
      <p className="mt-2 text-body-md text-on-surface-variant">
        {t("auth.sessionSecurityDescription")}
      </p>

      {user && (
        <div className="mt-4 rounded-lg bg-surface-container-low p-4">
          <p className="text-label-md text-on-surface-variant">
            {t("auth.currentSession")}
          </p>
          <p className="mt-1 text-body-md font-medium text-on-surface">
            {user.email}
          </p>
          <p className="text-body-sm text-on-surface-variant">
            {t("auth.currentSessionRole", {
              role: codeLabel(t, "audit.actorRole", user.role),
            })}
          </p>
        </div>
      )}

      {message && (
        <div
          role="status"
          className={`mt-4 rounded-lg p-3 text-sm ${
            message.type === "success"
              ? "border border-green-200 bg-green-50 text-green-800"
              : "border border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {message.text}
        </div>
      )}

      {!showConfirm ? (
        <button
          type="button"
          onClick={() => setShowConfirm(true)}
          className="mt-4 rounded-lg border border-outline-variant px-4 py-2 text-label-md text-on-surface transition-colors hover:bg-surface-container-low"
        >
          {t("auth.signOutOtherSessions")}
        </button>
      ) : (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-body-sm font-medium text-amber-800">
            {t("auth.revokeSessionsConfirm")}
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={handleRevokeOtherSessions}
              disabled={isRevoking}
              className="rounded-lg bg-red-600 px-4 py-2 text-label-md text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isRevoking
                ? t("auth.revokingSessions")
                : t("auth.revokeSessionsConfirmAction")}
            </button>
            <button
              type="button"
              onClick={() => setShowConfirm(false)}
              disabled={isRevoking}
              className="rounded-lg border border-outline-variant px-4 py-2 text-label-md text-on-surface transition-colors hover:bg-surface-container-low disabled:cursor-not-allowed disabled:opacity-60"
            >
              {t("common.cancel")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
