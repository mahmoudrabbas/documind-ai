"use client";

import { useEffect, useMemo, useRef } from "react";
import { useCopilot } from "@/providers/copilot-provider";
import { useI18n } from "@/providers/i18n-provider";
import { Button } from "@/components/ui/Button";
import type { GuideSuggestion } from "@/lib/copilot/guide-triggers";
import { getTriggerRule } from "@/lib/copilot/guide-triggers";

interface GuideSuggestionCardProps {
  suggestion: GuideSuggestion;
  onStart: (flowId: string) => void;
  onDismiss: () => void;
}

/**
 * Proactive help card shown above the launcher FAB when a behavioral trigger
 * fires (zero search results, failed upload, …). Auto-hides after the rule's
 * cooldown so it never nags; starting the guide hands off to the existing
 * overlay via `startGuide`.
 */
export function GuideSuggestionCard({
  suggestion,
  onStart,
  onDismiss,
}: GuideSuggestionCardProps) {
  const { flows } = useCopilot();
  const { t } = useI18n();
  const timerRef = useRef<number | null>(null);

  const rule = useMemo(() => getTriggerRule(suggestion.event), [suggestion.event]);
  const flowTitle = useMemo(
    () => flows.find((flow) => flow.flowId === suggestion.flowId)?.title,
    [flows, suggestion.flowId],
  );

  useEffect(() => {
    if (rule && rule.cooldownMs > 0) {
      timerRef.current = window.setTimeout(onDismiss, rule.cooldownMs);
    }
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, [rule, onDismiss]);

  return (
    <div
      role="status"
      className="fixed bottom-24 end-5 z-50 flex w-72 flex-col gap-3 rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-4 shadow-modal"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <span className="material-symbols-outlined text-[20px]">help</span>
        </span>
        <div className="min-w-0">
          <p className="text-label-md font-bold text-on-surface">
            {t("copilot.trigger.title")}
          </p>
          <p className="mt-0.5 text-body-sm text-on-surface-variant">
            {flowTitle ?? suggestion.flowId}
          </p>
        </div>
      </div>
      <div className="flex gap-2">
        <Button
          variant="primary"
          size="sm"
          className="flex-1"
          onClick={() => onStart(suggestion.flowId)}
        >
          {t("copilot.trigger.start")}
        </Button>
        <Button variant="outline" size="sm" onClick={onDismiss}>
          {t("copilot.trigger.dismiss")}
        </Button>
      </div>
    </div>
  );
}