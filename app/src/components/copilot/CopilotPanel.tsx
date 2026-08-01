"use client";

import { useState, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";
import type { CopilotSuggestion, PlanMode } from "@/types/api/copilot.types";
import type { StepStatus } from "@/types/api/copilot.types";
import { useCopilot } from "@/hooks/features/useCopilot";
import { GuideOverlay } from "./GuideOverlay";

function StepIcon({ status }: { status: StepStatus }) {
  if (status === "running") return <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />;
  if (status === "completed") return <span className="material-symbols-outlined text-primary text-[16px]">check_circle</span>;
  if (status === "failed") return <span className="material-symbols-outlined text-error text-[16px]">error</span>;
  if (status === "awaiting_confirmation") return <span className="material-symbols-outlined text-warning text-[16px]">warning</span>;
  if (status === "cancelled") return <span className="material-symbols-outlined text-on-surface-variant/50 text-[16px]">cancel</span>;
  return <span className="h-4 w-4 rounded-full border-2 border-outline-variant" />;
}

function StatusBadge({ status }: { status: StepStatus }) {
  const colors: Record<StepStatus, string> = {
    pending: "bg-surface-container-high text-on-surface-variant",
    running: "bg-primary-container text-primary",
    completed: "bg-primary/10 text-primary",
    failed: "bg-error/10 text-error",
    awaiting_confirmation: "bg-warning/10 text-warning",
    cancelled: "bg-surface-container-high text-on-surface-variant/50",
  };
  const labels: Record<StepStatus, string> = {
    pending: "Pending",
    running: "Running",
    completed: "Done",
    failed: "Failed",
    awaiting_confirmation: "Review needed",
    cancelled: "Cancelled",
  };
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium", colors[status])}>
      {labels[status]}
    </span>
  );
}

function ConfirmationDialog({
  open,
  description,
  impact,
  onApprove,
  onReject,
  isExecuting,
}: {
  open: boolean;
  description: string;
  impact: string;
  onApprove: () => void;
  onReject: () => void;
  isExecuting: boolean;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/55 p-4"
      role="alertdialog"
      aria-modal="true"
      onClick={(e) => { if (e.target === e.currentTarget) onReject(); }}
      onKeyDown={(e) => { if (e.key === "Escape") onReject(); }}
    >
      <div className="w-full max-w-md rounded-2xl bg-surface-container-lowest p-6 shadow-modal">
        <div className="flex items-start gap-3">
          <span className="material-symbols-outlined text-warning text-2xl">warning</span>
          <div>
            <h3 className="text-title-lg font-bold text-on-surface">Confirm Action</h3>
            <p className="mt-2 text-sm text-on-surface-variant">{description}</p>
            {impact ? (
              <p className="mt-2 text-sm font-medium text-warning">{impact}</p>
            ) : null}
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onReject}
            disabled={isExecuting}
            className="inline-flex items-center justify-center rounded-md px-4 py-2 text-label-md font-medium text-on-surface-variant transition-colors hover:bg-surface-container-low"
          >
            Cancel
          </button>
          <button
            onClick={onApprove}
            disabled={isExecuting}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-label-md font-medium text-on-primary transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isExecuting ? (
              <span className="me-2 h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : null}
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

function SuggestionChip({
  suggestion,
  onClick,
}: {
  suggestion: CopilotSuggestion;
  onClick: (query: string) => void;
}) {
  return (
    <button
      onClick={() => onClick(suggestion.query)}
      className="flex w-full items-center gap-3 rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-3 text-left transition-colors hover:bg-surface-container-low"
    >
      <span className="material-symbols-outlined text-primary text-xl">{suggestion.icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-on-surface truncate">{suggestion.label}</p>
        <p className="text-xs text-on-surface-variant truncate">{suggestion.description}</p>
      </div>
    </button>
  );
}

export function CopilotPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const {
    plan,
    guideInstructions,
    guideActive,
    isGenerating,
    isExecuting,
    autoAdvancing,
    error,
    suggestions,
    executionSteps,
    confirmation,
    generatePlan,
    executeStep,
    confirmAction,
    cancelCurrentPlan,
    loadSuggestions,
    completeGuide,
    skipGuide,
  } = useCopilot();

  const [input, setInput] = useState("");
  const [mode, setMode] = useState<PlanMode>("action");

  useEffect(() => {
    if (open) {
      loadSuggestions();
    }
  }, [open, loadSuggestions]);

  const handleSubmit = useCallback(async () => {
    const query = input.trim();
    if (!query || isGenerating || isExecuting) return;
    setInput("");
    await generatePlan(query, mode);
  }, [input, isGenerating, isExecuting, generatePlan, mode]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  return (
    <>
      <div
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-surface-container-low shadow-modal transition-transform duration-300",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-outline-variant/30 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">smart_toy</span>
            <h2 className="text-title-md font-bold text-on-surface">AI Copilot</h2>
          </div>
          <div className="flex items-center gap-1">
            {plan ? (
              <button
                onClick={cancelCurrentPlan}
                className="rounded-full p-1.5 text-on-surface-variant transition-colors hover:bg-surface-container-high"
                aria-label="Cancel plan"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            ) : null}
            <button
              onClick={onClose}
              className="rounded-full p-1.5 text-on-surface-variant transition-colors hover:bg-surface-container-high"
              aria-label="Close copilot"
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {autoAdvancing ? (
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/10 px-3 py-2">
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <p className="text-sm text-primary">Auto-advancing through safe steps...</p>
            </div>
          ) : null}

          {error ? (
            <div className="mb-4 rounded-lg border border-error/30 bg-error/10 px-3 py-2">
              <p className="text-sm text-error">{error}</p>
            </div>
          ) : null}

          {!plan ? (
            <>
              <div className="mb-4 flex items-center gap-1 rounded-full bg-surface-container-high p-1">
                <button
                  onClick={() => setMode("guide")}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-label-md font-medium transition-colors",
                    mode === "guide" ? "bg-surface-container-lowest text-primary shadow-sm" : "text-on-surface-variant",
                  )}
                  aria-pressed={mode === "guide"}
                >
                  <span className="material-symbols-outlined text-base">explore</span>
                  Guide
                </button>
                <button
                  onClick={() => setMode("action")}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-label-md font-medium transition-colors",
                    mode === "action" ? "bg-surface-container-lowest text-primary shadow-sm" : "text-on-surface-variant",
                  )}
                  aria-pressed={mode === "action"}
                >
                  <span className="material-symbols-outlined text-base">smart_toy</span>
                  Action
                </button>
              </div>
              <p className="mb-4 text-sm text-on-surface-variant">
                {mode === "guide"
                  ? "Ask how to do something and I'll guide you step by step."
                  : "Ask me to help with anything — search documents, invite users, run imports, and more."}
              </p>
              {suggestions.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wider text-on-surface-variant/70">
                    Suggestions
                  </p>
                  {suggestions.map((s) => (
                    <SuggestionChip
                      key={s.label}
                      suggestion={s}
                      onClick={(query) => {
                        setInput(query);
                      }}
                    />
                  ))}
                </div>
              ) : null}
            </>
          ) : (
            <>
              <div className="mb-4">
                <p className="text-sm font-medium text-on-surface">{plan.summary}</p>
                <div className="mt-1 flex items-center gap-2">
                  <span className={cn(
                    "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
                    plan.status === "active" && "bg-primary-container text-primary",
                    plan.status === "completed" && "bg-primary/10 text-primary",
                    plan.status === "failed" && "bg-error/10 text-error",
                    plan.status === "cancelled" && "bg-surface-container-high text-on-surface-variant/50",
                  )}>
                    {plan.status === "active" ? "In progress" : plan.status === "completed" ? "Completed" : plan.status === "failed" ? "Failed" : "Cancelled"}
                  </span>
                  <span className="text-xs text-on-surface-variant">
                    {plan.steps.length} step{plan.steps.length !== 1 ? "s" : ""}
                  </span>
                </div>
              </div>

              {plan.mode === "guide" ? (
                <div className="mb-4 rounded-xl border border-primary/20 bg-primary/5 p-3">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary">explore</span>
                    <p className="text-sm font-medium text-primary">Guide Mode</p>
                  </div>
                  <p className="mt-1 text-xs text-on-surface-variant">
                    Follow the steps below. The copilot will guide you through each action.
                  </p>
                  <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-container-high">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-500"
                      style={{
                        width: `${(executionSteps.filter((s) => s.status === "completed" || s.status === "cancelled" || s.status === "failed").length / Math.max(executionSteps.length, 1)) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              ) : null}

              <div className="space-y-2">
                {plan.mode === "guide" && executionSteps.some((s) => s.status === "pending") ? (
                  <p className="mb-2 text-xs text-on-surface-variant/70">
                    Click a step when you&apos;re ready for it.
                  </p>
                ) : null}
                {executionSteps.map((step, index) => {
                  const isActive = step.status === "running" || step.status === "awaiting_confirmation";
                  const isClickable = plan.mode === "guide" && step.status === "pending";
                  return (
                    <div
                      key={step.stepIndex}
                      onClick={isClickable && !isExecuting ? () => executeStep(step.stepIndex) : undefined}
                      role={isClickable ? "button" : undefined}
                      tabIndex={isClickable ? 0 : undefined}
                      onKeyDown={isClickable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); executeStep(step.stepIndex); } } : undefined}
                      className={cn(
                        "flex items-start gap-3 rounded-xl border p-3 transition-all duration-200",
                        step.status === "completed" && "border-primary/20 bg-primary/5",
                        step.status === "failed" && "border-error/20 bg-error/5",
                        step.status === "awaiting_confirmation" && "border-warning/20 bg-warning/5",
                        step.status === "running" && "border-primary/30 bg-primary/[0.03]",
                        step.status === "cancelled" && "border-outline-variant/20 bg-surface-container-lowest/50",
                        !["completed", "failed", "awaiting_confirmation", "running", "cancelled"].includes(step.status) && "border-outline-variant/30",
                        isClickable && "cursor-pointer hover:border-primary/40 hover:bg-primary/[0.03]",
                        isActive && "ring-1 ring-primary/20",
                      )}
                    >
                      {/* Step number badge */}
                      {plan.mode === "guide" ? (
                        <span className={cn(
                          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                          step.status === "completed" ? "bg-primary text-on-primary" :
                          step.status === "running" ? "bg-primary-container text-primary" :
                          step.status === "failed" ? "bg-error/10 text-error" :
                          "bg-surface-container-high text-on-surface-variant",
                        )}>
                          {index + 1}
                        </span>
                      ) : (
                        <StepIcon status={step.status} />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className={cn(
                          "text-sm",
                          step.status === "cancelled" ? "text-on-surface-variant/50 line-through" : "text-on-surface",
                        )}>
                          {step.description}
                        </p>
                        {plan.mode === "guide" && step.status === "pending" ? (
                          <p className="mt-0.5 text-xs text-on-surface-variant/60">Click to complete</p>
                        ) : null}
                        {step.error ? (
                          <p className="mt-0.5 text-xs text-error">{step.error}</p>
                        ) : null}
                      </div>
                      {plan.mode !== "guide" ? <StatusBadge status={step.status} /> : null}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-outline-variant/30 p-4">
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={plan ? "Continue..." : "What would you like to do?"}
              rows={2}
              disabled={isGenerating || isExecuting}
              className="flex-1 resize-none rounded-xl border border-outline-variant/50 bg-surface-container-lowest p-3 text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
            />
            <button
              onClick={handleSubmit}
              disabled={!input.trim() || isGenerating || isExecuting}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-on-primary transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Send"
            >
              {isGenerating ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                <span className="material-symbols-outlined">arrow_upward</span>
              )}
            </button>
          </div>
          <p className="mt-2 text-[10px] text-on-surface-variant/50">
            Copilot can perform actions on your behalf. Review before approving.
          </p>
        </div>
      </div>

      <ConfirmationDialog
        open={confirmation !== null}
        description={confirmation?.description ?? ""}
        impact={confirmation?.impact ?? ""}
        onApprove={() => confirmAction("approve")}
        onReject={() => confirmAction("reject")}
        isExecuting={isExecuting}
      />

      {plan?.mode === "guide" && guideActive && guideInstructions.length > 0 ? (
        <GuideOverlay
          instructions={guideInstructions}
          onComplete={completeGuide}
          onSkip={skipGuide}
        />
      ) : null}
    </>
  );
}
