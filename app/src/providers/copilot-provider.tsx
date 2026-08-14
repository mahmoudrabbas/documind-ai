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
  confirmAction,
  getGuideFlows,
  resolveGuideFlow as resolveGuideFlowApi,
  sendCopilotMessage,
} from "@/services/copilot.service";
import type {
  ActionPlan,
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

export type CopilotPanelMode = "guide" | "action" | "clarify" | null;

/** Default action chips offered when the assistant needs clarification. */
const DEFAULT_CLARIFY_ACTIONS = [
  "document.search",
  "document.get",
  "user.invite",
  "settings.update",
];

export interface CopilotContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  mode: CopilotPanelMode;
  loading: boolean;
  error: string | null;

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

  sendMessage: (utterance: string) => Promise<void>;
  startGuide: (flowId: string) => Promise<void>;
  confirm: (decision: "approve" | "reject", note?: string) => Promise<void>;
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
          dispatchGuide({ type: "setSession", session: result.guideSession });
          setClarify(null);
        } else if (result.actionPlan) {
          const planWithApproval: ActionPlan = result.approvalId
            ? { ...result.actionPlan, approvalId: result.approvalId }
            : result.actionPlan;
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

  const confirm = useCallback(
    async (decision: "approve" | "reject", note?: string) => {
      const plan = actionStateRef.current.plan;
      const approvalId = actionStateRef.current.approvalId;
      if (!plan || !approvalId) return;
      setError(null);
      try {
        await confirmAction({
          runId: plan.runId,
          decision,
          approvalId,
          note,
        });
        // The socket (if connected) will deliver action.executed/failed; the
        // REST response is authoritative for status, so mirror it here too.
        dispatchAction({
          event: decision === "approve" ? "action.executed" : "action.failed",
          payload: {
            runId: plan.runId,
            status: decision === "approve" ? "completed" : "rejected",
            result: {
              runId: plan.runId,
              status: decision === "approve" ? "completed" : "rejected",
              toolName: plan.toolName,
              output: null,
              message:
                decision === "approve" ? "Action completed" : "Action rejected",
            },
          },
        });
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to confirm action",
        );
      }
    },
    [],
  );

  const dismissAction = useCallback(() => {
    dispatchAction({ event: "copilot.classified", payload: {} });
    setMode(null);
  }, []);

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
      flows,
      guide: guideState,
      guideActions,
      action: actionState,
      clarify,
      sendMessage,
      startGuide,
      confirm,
      dismissAction,
      loadFlows,
    }),
    [
      open,
      mode,
      loading,
      error,
      flows,
      guideState,
      guideActions,
      actionState,
      clarify,
      sendMessage,
      startGuide,
      confirm,
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
