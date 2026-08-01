"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { CopilotPlan, CopilotPlanEvent, CopilotSuggestion, GuideInstruction, PlanMode, StepStatus } from "@/types/api/copilot.types";
import * as copilotService from "@/services/copilot.service";

interface ConfirmationRequest {
  stepIndex: number;
  toolName: string;
  parameters: Record<string, unknown>;
  confirmationLevel: string;
  description: string;
  impact: string;
}

interface StepExecutionView {
  stepIndex: number;
  description: string;
  status: StepStatus;
  error: string | null;
}

interface UseCopilotReturn {
  plan: CopilotPlan | null;
  guideInstructions: GuideInstruction[];
  guideActive: boolean;
  isGenerating: boolean;
  isExecuting: boolean;
  error: string | null;
  suggestions: CopilotSuggestion[];
  executionSteps: StepExecutionView[];
  confirmation: ConfirmationRequest | null;
  autoAdvancing: boolean;

  generatePlan: (query: string, mode?: PlanMode) => Promise<void>;
  executeStep: (stepIndex: number) => Promise<void>;
  confirmAction: (decision: "approve" | "reject") => Promise<void>;
  cancelCurrentPlan: () => Promise<void>;
  loadSuggestions: () => Promise<void>;
  completeGuide: () => void;
  skipGuide: () => void;
  reset: () => void;
}

function needsConfirmation(level: string): boolean {
  return level === "medium" || level === "high";
}

export function useCopilot(): UseCopilotReturn {
  const [plan, setPlan] = useState<CopilotPlan | null>(null);
  const [guideInstructions, setGuideInstructions] = useState<GuideInstruction[]>([]);
  const [guideActive, setGuideActive] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<CopilotSuggestion[]>([]);
  const [executionSteps, setExecutionSteps] = useState<StepExecutionView[]>([]);
  const [confirmation, setConfirmation] = useState<ConfirmationRequest | null>(null);
  const [autoAdvancing, setAutoAdvancing] = useState(false);
  const planRef = useRef<CopilotPlan | null>(null);
  const pendingStepRef = useRef<number | null>(null);
  const autoQueueRef = useRef<number[]>([]);
  const processingRef = useRef(false);

  const applyEvent = useCallback((event: CopilotPlanEvent) => {
    switch (event.type) {
      case "step.started":
      case "step.retrying":
        setExecutionSteps((prev) =>
          prev.map((s) => (s.stepIndex === event.stepIndex ? { ...s, status: "running" } : s)),
        );
        break;
      case "step.completed":
        setExecutionSteps((prev) =>
          prev.map((s) => (s.stepIndex === event.stepIndex ? { ...s, status: "completed", error: null } : s)),
        );
        break;
      case "step.failed":
        setExecutionSteps((prev) =>
          prev.map((s) => (s.stepIndex === event.stepIndex ? { ...s, status: "failed", error: event.error } : s)),
        );
        break;
      case "step.cancelled":
        setExecutionSteps((prev) =>
          prev.map((s) => (s.stepIndex === event.stepIndex ? { ...s, status: "cancelled" } : s)),
        );
        break;
      case "step.confirmation_required":
        setExecutionSteps((prev) =>
          prev.map((s) => (s.stepIndex === event.stepIndex ? { ...s, status: "awaiting_confirmation" } : s)),
        );
        break;
      case "plan.completed":
        setPlan((p) => (p ? { ...p, status: "completed" } : p));
        break;
      case "plan.failed":
        setPlan((p) => (p ? { ...p, status: "failed" } : p));
        break;
      case "plan.cancelled":
        setPlan((p) => (p ? { ...p, status: "cancelled" } : p));
        break;
      default:
        break;
    }
  }, []);

  useEffect(() => {
    const currentPlanId = plan?.id;
    if (!currentPlanId) return undefined;
    const controller = new AbortController();
    copilotService.subscribeToPlanEvents(currentPlanId, applyEvent, controller.signal).catch(() => {
      // stream ended or connection dropped — the app also reads step results directly
    });
    return () => controller.abort();
  }, [plan?.id, applyEvent]);

  const runNextQueuedStep = useCallback(async () => {
    if (processingRef.current || autoQueueRef.current.length === 0) return;
    processingRef.current = true;
    setAutoAdvancing(true);

    const stepIndex = autoQueueRef.current[0];

    setExecutionSteps((prev) =>
      prev.map((s) => (s.stepIndex === stepIndex ? { ...s, status: "running" } : s)),
    );

    try {
      const result = await copilotService.executeStep(planRef.current!.id, stepIndex);
      if (result.confirmationRequired && result.confirmationRequest) {
        setConfirmation(result.confirmationRequest);
        pendingStepRef.current = stepIndex;
        setExecutionSteps((prev) =>
          prev.map((s) =>
            s.stepIndex === stepIndex ? { ...s, status: "awaiting_confirmation" } : s,
          ),
        );
        autoQueueRef.current = [];
      } else {
        autoQueueRef.current.shift();
        setExecutionSteps((prev) =>
          prev.map((s) =>
            s.stepIndex === stepIndex
              ? { ...s, status: result.step.status, error: result.step.errorMessage }
              : s,
          ),
        );
        if (autoQueueRef.current.length > 0) {
          processingRef.current = false;
          await runNextQueuedStep();
        } else {
          setAutoAdvancing(false);
          processingRef.current = false;
        }
        return;
      }
    } catch (err) {
      autoQueueRef.current = [];
      setError(err instanceof Error ? err.message : "Step execution failed");
      setExecutionSteps((prev) =>
        prev.map((s) =>
          s.stepIndex === stepIndex
            ? { ...s, status: "failed", error: err instanceof Error ? err.message : "Failed" }
            : s,
        ),
      );
    }

    setAutoAdvancing(false);
    processingRef.current = false;
  }, []);

  const generatePlan = useCallback(async (query: string, mode: PlanMode = "action") => {
    setIsGenerating(true);
    setError(null);
    setPlan(null);
    setGuideInstructions([]);
    setExecutionSteps([]);
    setConfirmation(null);
    setAutoAdvancing(false);
    autoQueueRef.current = [];
    pendingStepRef.current = null;
    processingRef.current = false;

    try {
      const result = await copilotService.generatePlan(query, mode, window.location.pathname);
      setPlan(result);
      planRef.current = result;
      const steps = result.steps.map((s) => ({
        stepIndex: s.stepIndex,
        description: s.description,
        status: s.status,
        error: null,
      }));
      setExecutionSteps(steps);

      if (result.mode === "guide") {
        try {
          const guide = await copilotService.getGuidePlan(result.id);
          setGuideInstructions(guide.instructions);
          setGuideActive(true);
        } catch {
          setGuideInstructions([]);
          setGuideActive(true);
        }
      } else {
        setGuideInstructions([]);
        setGuideActive(false);
      }

      const safeSteps = result.mode === "action"
        ? result.steps
            .filter((s) => !needsConfirmation(s.confirmationLevel))
            .map((s) => s.stepIndex)
        : [];

      if (safeSteps.length > 0) {
        autoQueueRef.current = safeSteps;
        setIsGenerating(false);
        await runNextQueuedStep();
        return;
      }

      const firstConfirmable = result.steps.find((s) => needsConfirmation(s.confirmationLevel));
      if (firstConfirmable) {
        pendingStepRef.current = firstConfirmable.stepIndex;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate plan");
    } finally {
      setIsGenerating(false);
    }
  }, [runNextQueuedStep]);

  const executeStep = useCallback(async (stepIndex: number) => {
    if (!plan) return;
    setIsExecuting(true);
    setError(null);

    setExecutionSteps((prev) =>
      prev.map((s) => (s.stepIndex === stepIndex ? { ...s, status: "running" } : s)),
    );

    try {
      const result = await copilotService.executeStep(plan.id, stepIndex);
      if (result.confirmationRequired && result.confirmationRequest) {
        setConfirmation(result.confirmationRequest);
        pendingStepRef.current = stepIndex;
        setExecutionSteps((prev) =>
          prev.map((s) =>
            s.stepIndex === stepIndex ? { ...s, status: "awaiting_confirmation" } : s,
          ),
        );
      } else {
        setExecutionSteps((prev) =>
          prev.map((s) =>
            s.stepIndex === stepIndex
              ? { ...s, status: result.step.status, error: result.step.errorMessage }
              : s,
          ),
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Step execution failed");
      setExecutionSteps((prev) =>
        prev.map((s) =>
          s.stepIndex === stepIndex
            ? { ...s, status: "failed", error: err instanceof Error ? err.message : "Failed" }
            : s,
        ),
      );
    } finally {
      setIsExecuting(false);
    }
  }, [plan]);

  const confirmAction = useCallback(async (decision: "approve" | "reject") => {
    if (!plan || pendingStepRef.current === null) return;

    const stepIndex = pendingStepRef.current;
    setConfirmation(null);
    pendingStepRef.current = null;

    if (decision === "reject") {
      setExecutionSteps((prev) =>
        prev.map((s) =>
          s.stepIndex === stepIndex ? { ...s, status: "cancelled" } : s,
        ),
      );
      return;
    }

    setIsExecuting(true);
    try {
      const result = await copilotService.confirmStep(plan.id, stepIndex, "approve");
      setExecutionSteps((prev) =>
        prev.map((s) =>
          s.stepIndex === stepIndex
            ? { ...s, status: result.step.status, error: result.step.errorMessage }
            : s,
        ),
      );

      const remainingSafe = plan.steps
        .filter((s) => s.stepIndex > stepIndex && !needsConfirmation(s.confirmationLevel))
        .map((s) => s.stepIndex);
      if (remainingSafe.length > 0) {
        autoQueueRef.current = remainingSafe;
        await runNextQueuedStep();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Confirmation failed");
      setExecutionSteps((prev) =>
        prev.map((s) =>
          s.stepIndex === stepIndex
            ? { ...s, status: "failed", error: err instanceof Error ? err.message : "Failed" }
            : s,
        ),
      );
    } finally {
      setIsExecuting(false);
    }
  }, [plan, runNextQueuedStep]);

  const reset = useCallback(() => {
    setPlan(null);
    setGuideInstructions([]);
    setGuideActive(false);
    setError(null);
    setExecutionSteps([]);
    setConfirmation(null);
    setAutoAdvancing(false);
    planRef.current = null;
    pendingStepRef.current = null;
    autoQueueRef.current = [];
    processingRef.current = false;
  }, []);

  const completeGuide = useCallback(() => {
    setGuideActive(false);
  }, []);

  const skipGuide = useCallback(() => {
    setGuideActive(false);
    setGuideInstructions([]);
  }, []);

  const cancelCurrentPlan = useCallback(async () => {
    if (!plan) return;
    try {
      await copilotService.cancelPlan(plan.id);
    } catch {
      // Best-effort
    }
    reset();
  }, [plan, reset]);

  const loadSuggestions = useCallback(async () => {
    try {
      const result = await copilotService.getSuggestions();
      setSuggestions(result);
    } catch {
      // Silently fail — suggestions are non-critical
    }
  }, []);

  return {
    plan,
    guideInstructions,
    guideActive,
    isGenerating,
    isExecuting,
    error,
    suggestions,
    executionSteps,
    confirmation,
    autoAdvancing,
    generatePlan,
    executeStep,
    confirmAction,
    cancelCurrentPlan,
    loadSuggestions,
    completeGuide,
    skipGuide,
    reset,
  };
}
