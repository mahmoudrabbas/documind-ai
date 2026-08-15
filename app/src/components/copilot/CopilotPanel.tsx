"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useCopilot } from "@/providers/copilot-provider";
import { useI18n } from "@/providers/i18n-provider";
import { useAuth } from "@/providers/auth-provider";
import { Button } from "@/components/ui/Button";
import { ActionPlanCard } from "./ActionPlanCard";
import { ActionResultCard } from "./ActionResultCard";
import { getCurrentStep } from "@/lib/copilot/guide-machine";
import {
  groupFlowsByCategory,
  partitionFlows,
} from "@/lib/copilot/flow-catalog";
import { usePermissions } from "@/providers/permission-provider";
import { Permission, type PermissionValue } from "@/types/api/permissions.types";
import {
  TOUR_FLOW_ID,
  dismissTourOffer,
  markTourCompleted,
  markTourStarted,
  shouldShowTourOffer,
} from "@/lib/copilot/tour";

/** Admin-facing chrome: someone who can manage others sees the full catalog. */
function isAdminView(can: (permission: PermissionValue) => boolean): boolean {
  return (
    can(Permission.USERS_READ) ||
    can(Permission.ROLES_READ) ||
    can(Permission.COMPANY_SETTINGS_READ)
  );
}

/**
 * Slide-in assistant drawer (guider.md §9). All copilot modes share the panel:
 *
 *   guide   → current step summary + link back to the spotlight overlay
 *   action  → ActionPlanCard (confirm/reject) or ActionResultCard
 *   clarify → clarification message + tappable flow / action suggestions
 *
 * The footer holds the free-text input that drives `sendMessage`.
 */
export function CopilotPanel() {
  const {
    open,
    setOpen,
    mode,
    loading,
    error,
    flows,
    guide,
    guideActions,
    action,
    clarify,
    sendMessage,
    startGuide,
    loadFlows,
  } = useCopilot();
  const { t, dir } = useI18n();
  const { user } = useAuth();
  const permissions = usePermissions();
  const [draft, setDraft] = useState("");
  const [offerHidden, setOfferHidden] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const showTourOffer =
    !offerHidden &&
    mode === null &&
    user !== null &&
    shouldShowTourOffer(user.id, user.createdAt);

  useEffect(() => {
    if (open) {
      void loadFlows();
      window.setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [open, loadFlows]);

  useEffect(() => {
    if (open && guide?.status === "running") setOpen(false);
  }, [guide?.status, open, setOpen]);

  useEffect(() => {
    if (guide?.status === "completed" && guide.session.flowId === TOUR_FLOW_ID && user) {
      markTourCompleted(user.id);
    }
  }, [guide?.status, guide?.session.flowId, user]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, setOpen]);

  const flowTitleById = useMemo(() => {
    const map = new Map<string, string>();
    for (const flow of flows) map.set(flow.flowId, flow.title);
    return map;
  }, [flows]);

  // Role-aware relevance: employees get a "Recommended for you" section on
  // top (audience employee/all, tagged server-side); admins see the full
  // catalog grouped by category as before.
  const adminView = useMemo(
    () => isAdminView(permissions.can),
    [permissions.can],
  );
  const { recommended: recommendedFlows, rest: otherFlows } =
    useMemo(() => partitionFlows(flows), [flows]);
  const flowGroups = useMemo(
    () => groupFlowsByCategory(adminView ? flows : otherFlows),
    [adminView, flows, otherFlows],
  );

  if (!open) return null;

  const currentStep = guide ? getCurrentStep(guide) : null;

  const handleSend = async () => {
    const utterance = draft.trim();
    if (!utterance || loading) return;
    setDraft("");
    await sendMessage(utterance);
  };

  return (
    <>
      <div
        className="fixed inset-0 z-60 bg-black/30 backdrop-blur-sm"
        onClick={() => setOpen(false)}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="copilot-panel-title"
        className={`fixed inset-y-0 z-70 flex w-full max-w-md flex-col border-s border-outline-variant/30 bg-surface-container-lowest shadow-modal ${
          dir === "rtl" ? "left-0 border-e" : "right-0"
        }`}
      >
        <div className="flex items-center justify-between border-b border-outline-variant/30 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <span
                className="material-symbols-outlined text-[22px]"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                auto_awesome
              </span>
            </span>
            <div>
              <h2
                id="copilot-panel-title"
                className="text-title-md font-bold text-on-surface"
              >
                {t("copilot.panel.title")}
              </h2>
              <p className="text-label-sm text-on-surface-variant">
                {t("copilot.panel.subtitle")}
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label={t("copilot.panel.close")}
            onClick={() => setOpen(false)}
            className="rounded-full p-2 text-on-surface-variant transition-colors hover:bg-surface-container-high"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {error ? (
            <div className="rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-body-md text-danger">
              {error}
            </div>
          ) : null}

          {mode === "guide" && guide ? (
            <div className="rounded-xl border border-outline-variant/30 bg-surface-container-low p-4">
              <p className="text-label-sm font-bold uppercase tracking-wider text-primary">
                {flowTitleById.get(guide.session.flowId) ?? guide.session.flowId}
              </p>
              {currentStep ? (
                <>
                  <p className="mt-1 text-body-md font-bold text-on-surface">
                    {currentStep.title}
                  </p>
                  <p className="mt-0.5 text-body-sm text-on-surface-variant">
                    {currentStep.instruction}
                  </p>
                  <p className="mt-2 text-label-sm text-on-surface-variant">
                    {t("copilot.guide.stepOf", {
                      current: String(currentStep.order),
                      total: String(guide.session.steps.length),
                    })}
                  </p>
                </>
              ) : null}
              <div className="mt-3 flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={guideActions.cancel}
                >
                  {t("copilot.guide.cancel")}
                </Button>
              </div>
            </div>
          ) : null}

          {mode === "action" &&
          (action.phase === "planning" ||
            action.phase === "awaiting_confirmation") ? (
            <ActionPlanCard />
          ) : null}
          {mode === "action" &&
          ["succeeded", "failed", "rejected", "expired"].includes(
            action.phase,
          ) ? (
            <ActionResultCard />
          ) : null}

          {mode === "clarify" && clarify ? (
            <div className="space-y-3">
              <div className="rounded-xl border border-outline-variant/30 bg-surface-container-low p-4">
                <p className="text-label-sm font-bold uppercase tracking-wider text-on-surface-variant">
                  {clarify.kind === "capability_unavailable"
                    ? t("copilot.clarify.capabilityUnavailableTitle")
                    : t("copilot.clarify.title")}
                </p>
                <p className="mt-1 text-body-md text-on-surface">
                  {clarify.message}
                </p>
              </div>

              {clarify.suggestedFlows.length > 0 ? (
                <div>
                  <p className="text-label-sm font-semibold text-on-surface-variant">
                    {t("copilot.clarify.flowsHeading")}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {clarify.suggestedFlows.map((flowId) => (
                      <button
                        key={flowId}
                        type="button"
                        onClick={() => void startGuide(flowId)}
                        className="rounded-full border border-outline-variant/40 bg-surface-bright px-3 py-1.5 text-label-md text-on-surface transition-colors hover:border-primary hover:text-primary"
                      >
                        {flowTitleById.get(flowId) ?? flowId}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {clarify.suggestedActions.length > 0 ? (
                <div>
                  <p className="text-label-sm font-semibold text-on-surface-variant">
                    {t("copilot.clarify.actionsHeading")}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {clarify.suggestedActions.map((action) => (
                      <button
                        key={action}
                        type="button"
                        onClick={() => void sendMessage(action)}
                        className="rounded-full border border-outline-variant/40 bg-surface-bright px-3 py-1.5 text-label-md text-on-surface transition-colors hover:border-primary hover:text-primary"
                      >
                        {action}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {showTourOffer ? (
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <span
                    className="material-symbols-outlined"
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  >
                    school
                  </span>
                </span>
                <div>
                  <p className="text-body-md font-bold text-on-surface">
                    {t("copilot.tour.title")}
                  </p>
                  <p className="mt-0.5 text-body-sm text-on-surface-variant">
                    {t("copilot.tour.body")}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  className="flex-1"
                  onClick={() => {
                    if (!user) return;
                    dismissTourOffer(user.id);
                    markTourStarted(user.id);
                    setOfferHidden(true);
                    void startGuide(TOUR_FLOW_ID);
                  }}
                >
                  {t("copilot.tour.startButton")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => {
                    if (!user) return;
                    dismissTourOffer(user.id);
                    setOfferHidden(true);
                  }}
                >
                  {t("copilot.tour.skipButton")}
                </Button>
              </div>
            </div>
          ) : null}

          {!mode ? (
            <div className="rounded-xl border border-dashed border-outline-variant/50 bg-surface-container-low/50 p-4 text-body-md text-on-surface-variant">
              {t("copilot.panel.placeholder")}
            </div>
          ) : null}

          {flows.length > 0 ? (
            <div>
              {!adminView && recommendedFlows.length > 0 ? (
                <div className="mb-4">
                  <p className="text-label-sm font-semibold text-primary">
                    {t("copilot.panel.recommendedTitle")}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {recommendedFlows.map((flow) => (
                      <button
                        key={flow.flowId}
                        type="button"
                        disabled={!flow.available}
                        onClick={() => void startGuide(flow.flowId)}
                        className="rounded-full border border-primary/40 bg-primary/10 px-3 py-1.5 text-label-md text-primary transition-colors hover:border-primary hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {flow.title}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              <p className="text-label-sm font-semibold text-on-surface-variant">
                {adminView
                  ? t("copilot.panel.flowsTitle")
                  : t("copilot.panel.allGuidesTitle")}
              </p>
              <div className="mt-2 space-y-4">
                {flowGroups.map(({ category, flows: categoryFlows }) => (
                  <div key={category}>
                    <p className="text-label-sm font-bold uppercase tracking-wider text-on-surface-variant">
                      {t(`copilot.category.${category}`)}
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-2">
                      {categoryFlows.map((flow) => (
                        <button
                          key={flow.flowId}
                          type="button"
                          disabled={!flow.available}
                          onClick={() => void startGuide(flow.flowId)}
                          className="rounded-full border border-outline-variant/40 bg-surface-bright px-3 py-1.5 text-label-md text-on-surface transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {flow.title}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="border-t border-outline-variant/30 px-5 py-4">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void handleSend();
                }
              }}
              placeholder={t("copilot.panel.placeholder")}
              rows={2}
              className="flex-1 resize-none rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-body-md text-on-surface outline-none placeholder:text-on-surface-variant focus:border-primary"
            />
            <Button
              variant="primary"
              size="md"
              isLoading={loading}
              disabled={!draft.trim() || loading}
              onClick={() => void handleSend()}
              aria-label={t("copilot.panel.send")}
            >
              <span className="material-symbols-outlined text-[20px]">
                send
              </span>
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
