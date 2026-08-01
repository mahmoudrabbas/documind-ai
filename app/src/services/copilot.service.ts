import { api, API_BASE_URL } from "@/lib/api-client";
import { getAccessToken } from "@/lib/auth-tokens";
import type {
  CopilotPlan,
  CopilotPlanEvent,
  CopilotSuggestion,
  GuidePlan,
  StepStatus,
} from "@/types/api/copilot.types";

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

interface StepExecuteResult {
  step: {
    stepIndex: number;
    action: string;
    description: string;
    tool: string | null;
    parameters: Record<string, unknown> | null;
    confirmationLevel: string;
    requiredPermission: string | null;
    status: StepStatus;
    result: { ok: boolean; data: unknown; error: string | null; latencyMs: number } | null;
    errorMessage: string | null;
  };
  result: { ok: boolean; data: unknown; error: string | null; latencyMs: number };
  confirmationRequired: boolean;
  confirmationRequest: {
    stepIndex: number;
    toolName: string;
    parameters: Record<string, unknown>;
    confirmationLevel: string;
    description: string;
    impact: string;
  } | null;
}

export async function generatePlan(
  query: string,
  mode: "guide" | "action" = "action",
  currentRoute?: string,
): Promise<CopilotPlan> {
  const response = await api.post<ApiResponse<CopilotPlan>>("/copilot/plan", {
    query,
    mode,
    currentRoute,
  });
  return response.data;
}

export async function executeStep(
  planId: string,
  stepIndex: number,
  parameters?: Record<string, unknown>,
): Promise<StepExecuteResult> {
  const response = await api.post<ApiResponse<StepExecuteResult>>("/copilot/execute", {
    planId,
    stepIndex,
    parameters,
  });
  return response.data;
}

export async function confirmStep(
  planId: string,
  stepIndex: number,
  decision: "approve" | "reject",
): Promise<StepExecuteResult> {
  const response = await api.post<ApiResponse<StepExecuteResult>>("/copilot/confirm", {
    planId,
    stepIndex,
    decision,
  });
  return response.data;
}

export async function getPlan(planId: string): Promise<CopilotPlan> {
  const response = await api.get<ApiResponse<CopilotPlan>>(`/copilot/plans/${planId}`);
  return response.data;
}

export async function getGuidePlan(planId: string): Promise<GuidePlan> {
  const response = await api.get<ApiResponse<GuidePlan>>(`/copilot/plans/${planId}/guide`);
  return response.data;
}

export function subscribeToPlanEvents(
  planId: string,
  onEvent: (event: CopilotPlanEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const token = getAccessToken();
  return fetch(`${API_BASE_URL}/copilot/plans/${encodeURIComponent(planId)}/events`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    credentials: "include",
    signal,
  }).then(async (response) => {
    if (!response.ok || !response.body) {
      throw new Error(`Event stream failed with status ${response.status}`);
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    const flush = (): void => {
      let boundary = buffer.indexOf("\n\n");
      while (boundary >= 0) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const dataLine = block
          .split("\n")
          .find((line) => line.startsWith("data:"));
        if (dataLine) {
          try {
            const event = JSON.parse(dataLine.slice(5).trim()) as CopilotPlanEvent;
            onEvent(event);
          } catch {
            // ignore malformed frames
          }
        }
        boundary = buffer.indexOf("\n\n");
      }
    };

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      flush();
    }
  });
}

export async function cancelPlan(planId: string): Promise<boolean> {
  const response = await api.delete<ApiResponse<{ cancelled: boolean }>>(
    `/copilot/plans/${planId}`,
  );
  return response.data.cancelled;
}

export async function getSuggestions(): Promise<CopilotSuggestion[]> {
  const response = await api.get<ApiResponse<CopilotSuggestion[]>>("/copilot/suggestions");
  return response.data;
}
