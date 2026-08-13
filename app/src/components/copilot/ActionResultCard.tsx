"use client";

import { useCopilot } from "@/providers/copilot-provider";
import { useI18n } from "@/providers/i18n-provider";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import type { ActionResultStatus } from "@/lib/copilot/copilot-types";

const STATUS_META: Record<
  ActionResultStatus,
  { title: string; className: string; icon: string }
> = {
  completed: {
    title: "copilot.action.result.succeeded",
    className: "bg-emerald-100 text-emerald-800",
    icon: "check_circle",
  },
  failed: {
    title: "copilot.action.result.failed",
    className: "bg-red-100 text-red-800",
    icon: "error",
  },
  rejected: {
    title: "copilot.action.result.rejected",
    className: "bg-amber-100 text-amber-800",
    icon: "block",
  },
  expired: {
    title: "copilot.action.result.expired",
    className: "bg-neutral-100 text-neutral-600",
    icon: "timer_off",
  },
};

/**
 * Result card for a completed / failed / rejected action run (§13). Shows the
 * outcome message and, when the action is undoable, an Undo affordance.
 */
export function ActionResultCard() {
  const { action, dismissAction } = useCopilot();
  const { t } = useI18n();

  const result = action.result;
  if (!result) return null;

  const meta = STATUS_META[result.status];

  return (
    <div
      className={cn(
        "rounded-xl border border-outline-variant bg-surface-bright p-4 shadow-sm",
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
            meta.className,
          )}
        >
          <span className="material-symbols-outlined text-[20px]">
            {meta.icon}
          </span>
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-body-md font-bold text-on-surface">
            {t(meta.title)}
          </p>
          <p className="mt-0.5 text-body-md text-on-surface-variant">
            {result.message}
          </p>
          {result.undo ? (
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={dismissAction}
            >
              {result.undo.description} · {t("copilot.action.result.undo")}
            </Button>
          ) : null}
        </div>
        <button
          type="button"
          aria-label={t("copilot.action.result.dismiss")}
          onClick={dismissAction}
          className="flex h-7 w-7 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface"
        >
          <span className="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>
    </div>
  );
}
