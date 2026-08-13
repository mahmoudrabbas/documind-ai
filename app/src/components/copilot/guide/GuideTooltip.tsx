"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { useI18n } from "@/providers/i18n-provider";
import { cn } from "@/lib/utils";
import type { GuideStep } from "@/lib/copilot/copilot-types";
import {
  cancelSpeech,
  getVoicePreference,
  isSpeechSupported,
  setVoicePreference,
  speakText,
} from "@/lib/copilot/speech";
import type { Locale } from "@/lib/i18n/i18n.types";

interface GuideTooltipProps {
  step: GuideStep;
  currentIndex: number;
  totalSteps: number;
  dir: "ltr" | "rtl";
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  onCancel: () => void;
}

/**
 * Tooltip card for the current guide step: title, instruction, step counter,
 * progress bar, and Back / Next / Skip / Cancel controls. Content is passed in
 * already-localized by the parent.
 *
 * Voice mode (opt-in): a speaker toggle reads the current step aloud and
 * re-reads automatically whenever the step changes.
 */
export function GuideTooltip({
  step,
  currentIndex,
  totalSteps,
  dir,
  onNext,
  onBack,
  onSkip,
  onCancel,
}: GuideTooltipProps) {
  const { t, locale } = useI18n();
  const [voiceOn, setVoiceOn] = useState(() => getVoicePreference());
  const isFirst = currentIndex === 0;
  const isLast = currentIndex === totalSteps - 1;
  const progress = totalSteps > 0 ? ((currentIndex + 1) / totalSteps) * 100 : 0;

  useEffect(() => {
    if (!voiceOn) return;
    speakText(`${step.title}. ${step.instruction}`, locale as Locale);
    return () => cancelSpeech();
  }, [voiceOn, currentIndex, step.title, step.instruction, locale]);

  const toggleVoice = () => {
    const next = !voiceOn;
    setVoicePreference(next);
    setVoiceOn(next);
    if (!next) cancelSpeech();
  };

  // The primary Next/Finish action only applies to manual steps (advance) and
  // route_change steps (navigates to the target route, handled by the parent).
  // Click / value_present steps complete by performing the guided interaction,
  // so Next would only skip ahead into a target that is not on the current
  // page; Skip remains available for users who want to move on.
  const canUseNext =
    step.completion.event === "manual" ||
    step.completion.event === "route_change";

  return (
    <div className="w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-outline-variant bg-surface-bright text-on-surface shadow-xl">
      <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-3">
        <span className="text-label-sm font-semibold uppercase tracking-wide text-on-surface-variant">
          {t("copilot.guide.stepOf", {
            current: String(step.order),
            total: String(totalSteps),
          })}
        </span>
        <div className="flex items-center gap-1">
          {isSpeechSupported() ? (
            <button
              type="button"
              aria-label={
                voiceOn
                  ? t("copilot.guide.voice.off")
                  : t("copilot.guide.voice.on")
              }
              aria-pressed={voiceOn}
              onClick={toggleVoice}
              className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors hover:bg-surface-container-high ${
                voiceOn ? "text-primary" : "text-on-surface-variant"
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">
                {voiceOn ? "volume_up" : "volume_off"}
              </span>
            </button>
          ) : null}
          <button
            type="button"
            aria-label={t("copilot.guide.cancel")}
            onClick={onCancel}
            className="flex h-7 w-7 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
      </div>

      <div className="px-4 pb-1">
        <div className="h-1 w-full overflow-hidden rounded-full bg-surface-container-high">
          <div
            className="h-full rounded-full bg-primary transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="px-4 py-3">
        <h3 className="text-body-lg font-bold text-primary">{step.title}</h3>
        <p className="mt-1 text-body-md leading-relaxed text-on-surface-variant">
          {step.instruction}
        </p>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-outline-variant bg-surface-container-low px-4 py-3">
        <Button
          variant="ghost"
          size="sm"
          disabled={isFirst}
          onClick={onBack}
          className={cn(dir === "rtl" && "flex-row-reverse")}
        >
          <span className="material-symbols-outlined text-[18px]">
            arrow_back
          </span>
          {t("copilot.guide.back")}
        </Button>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onSkip}>
            {t("copilot.guide.skip")}
          </Button>
          {canUseNext ? (
            <Button variant="primary" size="sm" onClick={onNext}>
              {isLast ? t("copilot.guide.finish") : t("copilot.guide.next")}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
