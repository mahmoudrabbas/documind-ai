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
import { permittedActions, ACTION_CATALOG } from "@/lib/copilot/action-catalog";
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

/** Resolves a question labelKey through the dictionary, falling back to the
 * server-provided English label when the key is missing or resolves to itself. */
function questionLabel(
  labelKey: string,
  fallback: string,
  t: (key: string) => string,
): string {
  const localized = t(labelKey);
  return localized !== labelKey && localized.trim().length > 0
    ? localized
    : fallback;
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
    draft,
    transcript,
    sendMessage,
    startGuide,
    runAction,
    sectionFilter,
    answerDraft,
    cancelDraft,
    loadFlows,
  } = useCopilot();
  const { t, dir } = useI18n();
  const { user } = useAuth();
  const permissions = usePermissions();
  const [input, setInput] = useState("");
  const [offerHidden, setOfferHidden] = useState(false);
  const [view, setView] = useState<"guide" | "action">("guide");
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

  // Auto-switch the active tab when a mode activates so the user always sees
  // the relevant content without manual tab switching. A sidebar section
  // filter opens onto the tab that carries its chips: flows → Guides,
  // tools-only → Actions.
  useEffect(() => {
    if (mode === "guide") setView("guide");
    else if (mode === "action" || mode === "action_input") setView("action");
    else if (sectionFilter?.flows.length) setView("guide");
    else if (sectionFilter?.tools.length) setView("action");
  }, [mode, sectionFilter]);

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
  // catalog grouped by category as before. A sidebar section filter narrows
  // both the flow chips and the action chips to that section.
  const adminView = useMemo(
    () => isAdminView(permissions.can),
    [permissions.can],
  );
  const sectionFlowIds = sectionFilter?.flows.length
    ? sectionFilter.flows
    : null;
  const visibleFlows = useMemo(
    () =>
      sectionFlowIds
        ? flows.filter((flow) => sectionFlowIds.includes(flow.flowId))
        : flows,
    [flows, sectionFlowIds],
  );
  const { recommended: recommendedFlows, rest: otherFlows } =
    useMemo(() => partitionFlows(visibleFlows), [visibleFlows]);
  const flowGroups = useMemo(
    () => groupFlowsByCategory(adminView ? visibleFlows : otherFlows),
    [adminView, visibleFlows, otherFlows],
  );

  const sectionToolIds = sectionFilter?.tools.length
    ? sectionFilter.tools
    : null;
  const availableActions = useMemo(() => {
    const permitted = permittedActions(permissions.can);
    if (!sectionToolIds) return permitted;
    return permitted.filter((action) => sectionToolIds.includes(action.toolName));
  }, [permissions.can, sectionToolIds]);

  if (!open) return null;

  const currentStep = guide ? getCurrentStep(guide) : null;

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    if (mode === "action_input") {
      await answerDraft(text);
      return;
    }
    await sendMessage(text);
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

          <div className="flex rounded-xl border border-outline-variant/30 bg-surface-container-low p-0.5">
            <button
              type="button"
              onClick={() => setView("guide")}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-label-md font-medium transition-colors ${
                view === "guide"
                  ? "bg-primary/15 text-primary"
                  : "text-on-surface-variant hover:bg-surface-container-high"
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">menu_book</span>
              {t("copilot.tabs.guides")}
            </button>
            <button
              type="button"
              onClick={() => setView("action")}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-label-md font-medium transition-colors ${
                view === "action"
                  ? "bg-primary/15 text-primary"
                  : "text-on-surface-variant hover:bg-surface-container-high"
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">bolt</span>
              {t("copilot.tabs.actions")}
            </button>
          </div>

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
          ["succeeded", "failed", "rejected"].includes(
            action.phase,
          ) ? (
            <ActionResultCard />
          ) : null}

          {mode === "action_input" && draft ? (
            <div className="space-y-3">
              {transcript.length > 0 ? (
                <div className="space-y-2" role="log" aria-live="polite" aria-label="Conversation">
                  {transcript.map((entry, index) => (
                    <div
                      key={`${entry.role}-${index}`}
                      className={`flex ${
                        entry.role === "user" ? "justify-end" : "justify-start"
                      }`}
                    >
                      <div
                        className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-body-sm ${
                          entry.role === "user"
                            ? "rounded-ee-sm bg-primary/15 text-on-surface"
                            : "rounded-es-sm bg-surface-container-high text-on-surface"
                        }`}
                      >
                        {entry.text}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              {draft.question ? (
                <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
                  <p className="text-body-md font-semibold text-on-surface">
                    {questionLabel(draft.question.labelKey, draft.question.label, t)}
                  </p>
                  {draft.questionsRemaining > 0 ? (
                    <p className="mt-1 text-label-sm text-on-surface-variant">
                      {t("copilot.action.input.progress", {
                        remaining: String(draft.questionsRemaining),
                      })}
                    </p>
                  ) : null}
                  {draft.question.options && draft.question.options.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {draft.question.options.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          disabled={loading}
                          onClick={() => void answerDraft(option.value)}
                          className="rounded-full border border-primary/40 bg-primary/10 px-3 py-1.5 text-label-md text-primary transition-colors hover:border-primary hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <div className="mt-3">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={loading}
                      onClick={() => void cancelDraft()}
                    >
                      {t("copilot.action.cancel")}
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
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

              {clarify.recommendedFlowId ? (
                <div>
                  <p className="text-label-sm font-semibold text-primary">
                    {t("copilot.clarify.recommendedTitle")}
                  </p>
                  <Button
                    type="button"
                    variant="primary"
                    size="md"
                    className="mt-2 w-full justify-between"
                    onClick={() => void startGuide(clarify.recommendedFlowId!)}
                  >
                    <span>
                      {flowTitleById.get(clarify.recommendedFlowId) ??
                        clarify.recommendedFlowId}
                    </span>
                    <span
                      className="material-symbols-outlined text-[20px] rtl:rotate-180"
                      aria-hidden="true"
                    >
                      arrow_forward
                    </span>
                  </Button>
                </div>
              ) : null}

              {clarify.suggestedFlows.length > 0 &&
              clarify.suggestedFlows.some(
                (flowId) => flowId !== clarify.recommendedFlowId,
              ) ? (
                <div>
                  <p className="text-label-sm font-semibold text-on-surface-variant">
                    {clarify.recommendedFlowId
                      ? t("copilot.clarify.otherFlowsHeading")
                      : t("copilot.clarify.flowsHeading")}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {clarify.suggestedFlows
                      .filter(
                        (flowId) => flowId !== clarify.recommendedFlowId,
                      )
                      .map((flowId) => (
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
                    {clarify.suggestedActions.map((action) => {
                      const catalogEntry = ACTION_CATALOG.find((e) => e.toolName === action);
                      return (
                        <button
                          key={action}
                          type="button"
                          onClick={() => void sendMessage(action)}
                          className="rounded-full border border-outline-variant/40 bg-surface-bright px-3 py-1.5 text-label-md text-on-surface transition-colors hover:border-primary hover:text-primary"
                        >
                          {catalogEntry ? t(catalogEntry.labelKey) : action}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {showTourOffer && view === "guide" ? (
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

          {!mode && view === "guide" ? (
            <div className="rounded-xl border border-dashed border-outline-variant/50 bg-surface-container-low/50 p-4 text-body-md text-on-surface-variant">
              {t("copilot.panel.placeholder")}
            </div>
          ) : null}

          {flows.length > 0 && view === "guide" ? (
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

          {availableActions.length > 0 && !mode && view === "action" ? (
            <div>
              <p className="text-label-sm font-semibold text-on-surface-variant">
                {t("copilot.actions.title")}
              </p>
              <p className="mt-0.5 text-body-sm text-on-surface-variant">
                {t("copilot.actions.subtitle")}
              </p>
              <div className="mt-2 flex flex-wrap gap-2" role="listbox" aria-label={t("copilot.actions.title")}>
                {availableActions.map((action) => (
                  <button
                    key={action.toolName}
                    type="button"
                    onClick={() => void runAction(action.toolName)}
                    className={`rounded-full border px-3 py-1.5 text-label-md transition-colors ${
                      action.destructive
                        ? "border-danger/40 bg-danger/5 text-danger hover:border-danger hover:bg-danger/10"
                        : "border-outline-variant/40 bg-surface-bright text-on-surface hover:border-primary hover:text-primary"
                    }`}
                  >
                    {t(action.labelKey)}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="border-t border-outline-variant/30 px-5 py-4">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void handleSend();
                }
              }}
              placeholder={
                mode === "action_input"
                  ? t("copilot.action.input.placeholder")
                  : t("copilot.panel.placeholder")
              }
              rows={2}
              className="flex-1 resize-none rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-body-md text-on-surface outline-none placeholder:text-on-surface-variant focus:border-primary"
            />
            <Button
              variant="primary"
              size="md"
              isLoading={loading}
              disabled={!input.trim() || loading}
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
