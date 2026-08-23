"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useI18n } from "@/providers/i18n-provider";
import { useCopilotSocket } from "@/hooks/features/useCopilotSocket";
import {
  answerActionDraft,
  cancelActionDraft,
  confirmAction,
  createActionPlan,
  getActionStatus,
  getGuideFlows,
  resolveGuideFlow as resolveGuideFlowApi,
  sendCopilotMessage,
} from "@/services/copilot.service";
import { ACTION_CATALOG } from "@/lib/copilot/action-catalog";
import { resolveQuestionLabel } from "@/lib/copilot/question-label";
import type { SectionQuickGuides } from "@/lib/copilot/nav-actions";
import type {
  ActionDraft,
  ActionPlan,
  ActionResultStatus,
  ClarifyPayload,
  CopilotLifecycleEvent,
  CopilotLifecyclePayload,
  GuideFlowMeta,
  GuideSession,
} from "@/lib/copilot/copilot-types";
import {
  createInitialGuideState,
  guideReducer,
  type GuideAction,
  type GuideMachineState,
} from "@/lib/copilot/guide-machine";
import {
  actionLifecycleReducer,
  createInitialActionLifecycleState,
  type ActionLifecycleState,
} from "@/lib/copilot/copilot-events";

/** Merge the top-level approvalId from a copilot response into the plan object. */
function mergeApprovalId(
  plan: ActionPlan,
  approvalId?: string,
): ActionPlan {
  return approvalId ? { ...plan, approvalId } : plan;
}

export type CopilotPanelMode =
  | "guide"
  | "action"
  | "action_input"
  | "clarify"
  | null;

/** Q&A bubbles shown while the assistant collects action parameters. */
export interface TranscriptEntry {
  role: "user" | "assistant";
  text: string;
  /** i18n key for assistant entries so they re-render on locale switch. */
  labelKey?: string;
}

/** Default action chips offered when the assistant needs clarification. */
const DEFAULT_CLARIFY_ACTIONS = [
  "document.search",
  "document.get",
  "user.invite",
];

export interface CopilotContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  mode: CopilotPanelMode;
  loading: boolean;
  error: string | null;

  /**
   * Restricts the panel chips to a sidebar section's quick guides — action
   * tools on the Actions tab and/or guide flows on the Guides tab. Null
   * shows the full permission-filtered catalog.
   */
  sectionFilter: SectionQuickGuides | null;
  /** Opens the panel filtered to the given section chips. */
  openSection: (guides: SectionQuickGuides) => void;

  flows: GuideFlowMeta[];

  guide: GuideMachineState | null;
  guideActions: {
    start: (session: GuideSession) => void;
    next: () => void;
    back: () => void;
    skip: () => void;
    cancel: () => void;
    stop: (reason?: string) => void;
    dispatch: (action: GuideAction) => void;
  };

  action: ActionLifecycleState;
  clarify: ClarifyPayload | null;

  /** Interactive action-input draft (mode "action_input"). */
  draft: ActionDraft | null;
  /** Q&A bubbles for the current action-input conversation. */
  transcript: TranscriptEntry[];

  sendMessage: (utterance: string) => Promise<void>;
  startGuide: (flowId: string) => Promise<void>;
  runAction: (toolName: string) => Promise<void>;
  confirm: (decision: "approve" | "reject", note?: string) => Promise<void>;
  answerDraft: (answer: string) => Promise<void>;
  cancelDraft: () => Promise<void>;
  dismissAction: () => void;
  loadFlows: () => Promise<void>;
}

const CopilotContext = createContext<CopilotContextValue | null>(null);

export function CopilotProvider({ children }: { children: ReactNode }) {
  const { locale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<CopilotPanelMode>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flows, setFlows] = useState<GuideFlowMeta[]>([]);
  const [clarify, setClarify] = useState<ClarifyPayload | null>(null);
  const [sectionFilter, setSectionFilter] = useState<SectionQuickGuides | null>(
    null,
  );

  const [guideState, dispatchGuide] = useReducer(
    (state: GuideMachineState | null, action: GuideAction) => {
      if (action.type === "setSession") {
        return guideReducer(createInitialGuideState(action.session), action);
      }
      return state ? guideReducer(state, action) : state;
    },
    null,
  );

  const [actionState, dispatchAction] = useReducer(
    actionLifecycleReducer,
    null,
    createInitialActionLifecycleState,
  );

  const actionStateRef = useRef(actionState);
  useEffect(() => {
    actionStateRef.current = actionState;
  }, [actionState]);

  const [draft, setDraft] = useState<ActionDraft | null>(null);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const draftRef = useRef(draft);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  // Terminal guide states clean up the panel so the assistant returns to its
  // launcher state instead of lingering in "guide" mode with a finished guide.
  // Starting a new guide replaces the state wholesale, so no explicit reset
  // of the machine is needed here.
  useEffect(() => {
    if (
      guideState &&
      (guideState.status === "completed" ||
        guideState.status === "cancelled" ||
        guideState.status === "stopped")
    ) {
      setMode(null);
    }
  }, [guideState]);

  // Live lifecycle events (§15) — enhancement-only; the REST call that created
  // the action already returned the same plan, and confirmAction returns the
  // authoritative status.
  const onLifecycle = useCallback(
    (event: CopilotLifecycleEvent, payload: CopilotLifecyclePayload) => {
      // Only forward events for the currently active run — stale events from a
      // previous run (e.g. after switching action chips) must be dropped.
      if (payload.runId && payload.runId !== actionStateRef.current.runId) {
        return;
      }
      dispatchAction({ event, payload });
    },
    [],
  );
  useCopilotSocket({ runId: actionState.runId, onLifecycle });

  const sendMessage = useCallback(
    async (utterance: string) => {
      setError(null);
      setLoading(true);
      try {
        const result = await sendCopilotMessage({
          utterance,
          locale: locale === "ar" ? "ar" : "en",
        });
        setMode(result.mode);
        if (result.guideSession) {
          setTranscript((entries) => [
            ...entries,
            { role: "user", text: utterance },
          ]);
          dispatchGuide({ type: "setSession", session: result.guideSession });
          setClarify(null);
        } else if (result.actionDraft) {
          // Interactive parameter collection: reset transcript for the new
          // draft session, keeping only the current user utterance and the
          // first assistant question.
          setDraft(result.actionDraft);
          setClarify(null);
          const initialEntries: TranscriptEntry[] = [
            { role: "user", text: utterance },
          ];
          if (result.actionDraft.question) {
            initialEntries.push({
              role: "assistant",
              text: resolveQuestionLabel(
                result.actionDraft.question.labelKey,
                result.actionDraft.question.label,
                t,
              ),
              labelKey: result.actionDraft.question.labelKey,
            });
          }
          setTranscript(initialEntries);
        } else if (result.result && result.actionPlan) {
          // A low-risk action executed directly — surface the result card.
          dispatchAction({
            event: "action.executed",
            payload: {
              runId: result.result.runId,
              status: result.result.status,
              result: result.result,
            },
          });
          setTranscript((entries) => [
            ...entries,
            { role: "assistant", text: result.result!.message },
          ]);
          setClarify(null);
        } else if (result.actionPlan) {
          const planWithApproval = mergeApprovalId(result.actionPlan, result.approvalId);
          dispatchAction({
            event: "action.plan.created",
            payload: { plan: planWithApproval, runId: planWithApproval.runId },
          });
          if (planWithApproval.requiresConfirmation) {
            dispatchAction({
              event: "action.awaiting_confirmation",
              payload: {
                runId: planWithApproval.runId,
                approvalId: planWithApproval.approvalId,
              },
            });
          }
          setClarify(null);
        } else if (result.clarify) {
          setClarify(result.clarify);
        } else if (result.mode === "clarify") {
          // The server omitted the payload (bare { mode: "clarify" }) — never
          // leave the panel blank; offer whatever flows are loaded instead.
          setClarify({
            message: t("copilot.clarify.defaultMessage"),
            suggestedFlows: flows.map((flow) => flow.flowId),
            suggestedActions: DEFAULT_CLARIFY_ACTIONS,
          });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to send message");
        setMode("clarify");
      } finally {
        setLoading(false);
      }
    },
    [locale, t, flows],
  );

  const startGuide = useCallback(
    async (flowId: string) => {
      setError(null);
      setLoading(true);
      try {
        const session = await resolveGuideFlowApi({
          flowId,
          locale: locale === "ar" ? "ar" : "en",
        });
        dispatchGuide({ type: "setSession", session });
        setClarify(null);
        setMode("guide");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to start guide");
      } finally {
        setLoading(false);
      }
    },
    [locale],
  );

  const runAction = useCallback(
    async (toolName: string) => {
      setError(null);
      setLoading(true);
      try {
        const catalogEntry = ACTION_CATALOG.find((e) => e.toolName === toolName);
        const utterance = catalogEntry ? t(catalogEntry.labelKey) : toolName;
        const result = await createActionPlan({ toolName, utterance });
        if (result.mode === "action_input") {
          setMode("action_input");
          setDraft(result.actionDraft);
          setClarify(null);
          const label = catalogEntry ? t(catalogEntry.labelKey) : toolName;
          setTranscript((entries) => [
            ...entries,
            { role: "user", text: label },
          ]);
          if (result.actionDraft.question) {
            setTranscript((entries) => [
              ...entries,
              {
                role: "assistant",
                text: resolveQuestionLabel(
                  result.actionDraft.question!.labelKey,
                  result.actionDraft.question!.label,
                  t,
                ),
                labelKey: result.actionDraft.question!.labelKey,
              },
            ]);
          }
        } else if (result.result && result.actionPlan) {
          // A low-risk action executed directly — surface the result card.
          setMode("action");
          dispatchAction({
            event: "action.executed",
            payload: {
              runId: result.result.runId,
              status: result.result.status,
              result: result.result,
            },
          });
          setClarify(null);
        } else {
          setMode("action");
          const plan = result.actionPlan;
          dispatchAction({
            event: "action.plan.created",
            payload: { plan, runId: plan.runId },
          });
          setClarify(null);
          if (plan.requiresConfirmation) {
            dispatchAction({
              event: "action.awaiting_confirmation",
              payload: {
                runId: plan.runId,
                approvalId: plan.approvalId,
              },
            });
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to start action");
        setMode(null);
      } finally {
        setLoading(false);
      }
    },
    [t],
  );

  const confirm = useCallback(
    async (decision: "approve" | "reject", note?: string) => {
      const plan = actionStateRef.current.plan;
      let approvalId = actionStateRef.current.approvalId;

      if (!plan) {
        setError(t("copilot.action.plan.confirm.noPlan"));
        setMode(null);
        return;
      }

      if (!approvalId) {
        try {
          const status = await getActionStatus(plan.runId);
          const approvals = (status.approvals ?? []) as Array<{
            id: string;
            status: string;
          }>;
          const pending = approvals.find((a) => a.status === "pending");
          if (pending?.id) approvalId = pending.id;
        } catch {
          // Status fetch errors fall through to the error below.
        }
      }

      if (!approvalId) {
        setError(t("copilot.action.plan.confirm.missingApproval"));
        return;
      }

      setError(null);
      try {
        const result = await confirmAction({
          runId: plan.runId,
          decision,
          approvalId,
          note,
          locale,
        });
        // The REST response carries the authoritative run status — never
        // infer from the decision; the tool may have failed after approval.
        const runStatus = result.run.status as ActionResultStatus;
        const isTerminal = runStatus === "completed";
        dispatchAction({
          event: isTerminal ? "action.executed" : "action.failed",
          payload: {
            runId: plan.runId,
            status: runStatus,
            result: {
              runId: plan.runId,
              status: runStatus,
              toolName: plan.toolName,
              output: null,
              message: isTerminal
                ? (result.run.resultMessage ?? t("copilot.action.result.succeeded"))
                : (result.run.error?.message ?? t("copilot.action.result.failed")),
            },
          },
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to confirm action";
        // Approval expiry: the backend marks the run as failed/rejected.
        // Show a specific message so the user knows to retry the action.
        if (message.includes("Approval expired") || message.includes("STATE_TRANSITION_INVALID")) {
          setError(t("copilot.action.plan.confirm.expired"));
        } else {
          setError(message);
        }
      }
    },
    [],
  );

  const answerDraft = useCallback(
    async (answer: string) => {
      const current = draftRef.current;
      if (!current) return;
      setError(null);
      setLoading(true);
      setTranscript((entries) => [...entries, { role: "user", text: answer }]);
      try {
        const result = await answerActionDraft(current.draftId, answer);
        if (!result.completed) {
          setDraft(result.draft);
          if (result.draft.message) {
            setTranscript((entries) => [
              ...entries,
              { role: "assistant", text: result.draft.message! },
            ]);
          } else if (result.draft.question) {
            setTranscript((entries) => [
              ...entries,
              {
                role: "assistant",
                text: resolveQuestionLabel(
                  result.draft.question!.labelKey,
                  result.draft.question!.label,
                  t,
                ),
                labelKey: result.draft.question!.labelKey,
              },
            ]);
          }
          return;
        }

        // The draft is complete — the action now runs end-to-end.
        setDraft(null);
        setMode("action");
        const { outcome } = result;
        if (outcome.result) {
          dispatchAction({
            event: "action.executed",
            payload: {
              runId: outcome.result.runId,
              status: outcome.result.status,
              result: outcome.result,
            },
          });
          setTranscript((entries) => [
            ...entries,
            { role: "assistant", text: outcome.result!.message },
          ]);
        } else {
          const planWithApproval = mergeApprovalId(outcome.plan, outcome.approvalId);
          dispatchAction({
            event: "action.plan.created",
            payload: { plan: planWithApproval, runId: planWithApproval.runId },
          });
          if (planWithApproval.requiresConfirmation) {
            dispatchAction({
              event: "action.awaiting_confirmation",
              payload: {
                runId: planWithApproval.runId,
                approvalId: planWithApproval.approvalId,
              },
            });
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "";
        setError(
          msg || "Failed to submit your answer",
        );
        // Only wipe the draft if the error indicates it's gone (404/410)
        // or the action failed after completion. Transient network errors
        // should not destroy the Q&A state — the server-side draft still
        // exists (15-min TTL) and the user can retry.
        if (
          msg.includes("not found") ||
          msg.includes("expired") ||
          msg.includes("already completed")
        ) {
          setDraft(null);
          setMode("clarify");
        }
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const cancelDraft = useCallback(async () => {
    const current = draftRef.current;
    if (!current) return;
    try {
      await cancelActionDraft(current.draftId);
    } catch {
      // Best-effort cleanup; the draft expires server-side regardless.
    }
    setDraft(null);
    setMode(null);
    setTranscript([]);
  }, []);

  const dismissAction = useCallback(() => {
    dispatchAction({ event: "copilot.classified", payload: {} });
    setMode(null);
  }, []);

  const openSection = useCallback((guides: SectionQuickGuides) => {
    setSectionFilter(guides);
    setMode(null);
    setDraft(null);
    setClarify(null);
    setError(null);
    setOpen(true);
  }, []);

  // A fresh open via the launcher (or any other surface) always shows the
  // full catalog; the section filter only lives for one sidebar-driven open.
  // Tracked via a ref so the reset only fires on an open→closed transition
  // (the mount-time effect run must not clobber a filter applied in the same
  // flush).
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !open) setSectionFilter(null);
    wasOpen.current = open;
  }, [open]);

  const loadFlows = useCallback(async () => {
    try {
      const result = await getGuideFlows(locale === "ar" ? "ar" : "en");
      setFlows(result);
    } catch {
      // Launcher works without the catalog; flows surface as chips when loaded.
    }
  }, [locale]);

  const guideActions = useMemo(
    () => ({
      start: (session: GuideSession) =>
        dispatchGuide({ type: "setSession", session }),
      next: () => dispatchGuide({ type: "next" }),
      back: () => dispatchGuide({ type: "back" }),
      skip: () => dispatchGuide({ type: "skip" }),
      cancel: () => dispatchGuide({ type: "cancel" }),
      stop: (reason?: string) => dispatchGuide({ type: "stop", reason }),
      dispatch: dispatchGuide,
    }),
    [],
  );

  const value = useMemo<CopilotContextValue>(
    () => ({
      open,
      setOpen,
      mode,
      loading,
      error,
      sectionFilter,
      openSection,
      flows,
      guide: guideState,
      guideActions,
      action: actionState,
      clarify,
      draft,
      transcript,
      sendMessage,
      startGuide,
      runAction,
      confirm,
      answerDraft,
      cancelDraft,
      dismissAction,
      loadFlows,
    }),
    [
      open,
      mode,
      loading,
      error,
      sectionFilter,
      openSection,
      flows,
      guideState,
      guideActions,
      actionState,
      clarify,
      draft,
      transcript,
      sendMessage,
      startGuide,
      runAction,
      confirm,
      answerDraft,
      cancelDraft,
      dismissAction,
      loadFlows,
    ],
  );

  return (
    <CopilotContext.Provider value={value}>{children}</CopilotContext.Provider>
  );
}

export function useCopilot(): CopilotContextValue {
  const context = useContext(CopilotContext);
  if (!context) {
    throw new Error("useCopilot must be used within a <CopilotProvider>");
  }
  return context;
}
