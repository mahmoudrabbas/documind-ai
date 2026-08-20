"use client";

import { useCallback, useEffect, useState } from "react";
import { useCopilot } from "@/providers/copilot-provider";
import { useI18n } from "@/providers/i18n-provider";
import { GuideSuggestionCard } from "./GuideSuggestionCard";
import {
  dismissGuideTrigger,
  subscribeGuideTriggers,
  type GuideSuggestion,
} from "@/lib/copilot/guide-triggers";

/**
 * Floating launcher for the assistant (guider.md §9). A non-intrusive FAB that
 * toggles the slide-in CopilotPanel. The dead "Help Center" links in the nav
 * are wired to the same toggle so there is a single entry point.
 *
 * Also subscribes to behavioral guide triggers (§"behavioral triggers"): when
 * the user hits a stuck situation (zero search results, failed upload, …) the
 * rule's flow is offered as a suggestion card above the FAB. The card is
 * suppressed while the panel or an overlay guide is active.
 */
export function CopilotLauncher() {
  const { open, setOpen, startGuide, guide } = useCopilot();
  const { t } = useI18n();
  const [suggestion, setSuggestion] = useState<GuideSuggestion | null>(null);

  const hide = useCallback(() => {
    setSuggestion(null);
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeGuideTriggers((next) => {
      setSuggestion(next);
    });
    return unsubscribe;
  }, []);

  // Halt the card while the panel is open or an overlay guide is running.
  const active = suggestion !== null && !open && guide?.status !== "running";

  const handleStart = useCallback(
    (flowId: string) => {
      hide();
      void startGuide(flowId);
    },
    [hide, startGuide],
  );

  const handleDismiss = useCallback(() => {
    if (suggestion) dismissGuideTrigger(suggestion.event);
    hide();
  }, [suggestion, hide]);

  return (
    <>
      {active ? (
        <GuideSuggestionCard
          suggestion={suggestion as GuideSuggestion}
          onStart={handleStart}
          onDismiss={handleDismiss}
        />
      ) : null}
      <button
        type="button"
        aria-label={t("copilot.launcher.label")}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="fixed bottom-6 end-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-on-primary shadow-lg transition-transform hover:scale-105 active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:bottom-5 sm:end-5"
      >
        <span
          className="material-symbols-outlined text-[28px]"
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          auto_awesome
        </span>
      </button>
    </>
  );
}
