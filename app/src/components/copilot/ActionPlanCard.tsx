"use client";

import { useState } from "react";
import { useCopilot } from "@/providers/copilot-provider";
import { useI18n } from "@/providers/i18n-provider";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import type { ActionPlan } from "@/lib/copilot/copilot-types";

const RISK_STYLES: Record<ActionPlan["risk"], string> = {
  low: "bg-emerald-100 text-emerald-800",
  reversible: "bg-amber-100 text-amber-800",
  destructive: "bg-red-100 text-red-800",
};

/**
 * Confirmation card for a proposed action (§12). The plan is held server-side
 * until the user approves (or rejects, optionally with a note).
 */
export function ActionPlanCard() {
  const { confirm, action } = useCopilot();
  const { t } = useI18n();
  const plan = action.plan;
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const isAwaiting = action.phase === "awaiting_confirmation";

  if (!plan) return null;

  const riskLabel =
    plan.risk === "low"
      ? t("copilot.action.plan.risk.low")
      : plan.risk === "reversible"
        ? t("copilot.action.plan.risk.reversible")
        : t("copilot.action.plan.risk.destructive");

  const handleDecision = async (decision: "approve" | "reject") => {
    setBusy(true);
    await confirm(decision, note.trim() || undefined);
    setBusy(false);
  };

  return (
    <div className="rounded-xl border border-outline-variant bg-surface-bright shadow-sm">
      <div className="flex items-center justify-between border-b border-outline-variant px-4 py-3">
        <h3 className="text-body-md font-bold text-on-surface">
          {t("copilot.action.plan.title")}
        </h3>
        <span
          className={cn(
            "rounded-full px-2.5 py-0.5 text-label-sm font-semibold",
            RISK_STYLES[plan.risk],
          )}
        >
          {riskLabel}
        </span>
      </div>

      <div className="space-y-3 px-4 py-4">
        <div>
          <p className="text-label-sm uppercase tracking-wide text-on-surface-variant">
            {t("copilot.action.plan.intent", { intent: plan.intent })}
          </p>
          <p className="mt-1 text-body-md text-on-surface">{plan.summary}</p>
        </div>

        {plan.target ? (
          <div className="flex items-center gap-2">
            <span className="text-label-sm text-on-surface-variant">
              {t("copilot.action.plan.targetLabel")}:
            </span>
            <span className="rounded-full bg-surface-container-high px-2.5 py-0.5 text-label-sm font-semibold text-on-surface">
              {plan.target.label}
            </span>
          </div>
        ) : null}

        {plan.undo ? (
          <p className="text-label-sm text-on-surface-variant">
            {t("copilot.action.plan.undoHint")} — {plan.undo.description}
          </p>
        ) : null}

        {isAwaiting ? (
          <p className="text-label-sm text-on-surface-variant">
            {t("copilot.action.plan.requiresConfirmation")}
          </p>
        ) : null}

        {busy ? (
          <p className="text-label-sm text-primary">
            {t("copilot.action.executing")}
          </p>
        ) : null}
      </div>

      <div className="space-y-2 border-t border-outline-variant px-4 py-3">
        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            className="flex-1"
            disabled={busy}
            onClick={() => handleDecision("approve")}
          >
            {t("copilot.action.plan.approve")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            disabled={busy}
            onClick={() => handleDecision("reject")}
          >
            {t("copilot.action.plan.reject")}
          </Button>
        </div>
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder={t("copilot.action.plan.notePlaceholder")}
          rows={2}
          className="w-full resize-none rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 text-body-md text-on-surface outline-none placeholder:text-on-surface-variant focus:border-primary"
        />
      </div>
    </div>
  );
}
