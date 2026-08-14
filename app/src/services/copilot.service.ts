/**
 * Copilot API client — typed wrapper over the `/copilot` REST surface
 * (guider.md §16). Mirror of `api/src/modules/copilot/copilot.routes.ts`.
 */

import { apiClient, ApiError } from "@/lib/api-client";
import type {
  ActionPlan,
  ClarifyPayload,
  CopilotMessageResult,
  GuideFlowMeta,
  GuideSession,
} from "@/lib/copilot/copilot-types";

type Envelope<T> = { success: boolean; data: T };

export type CopilotMode = CopilotMessageResult["mode"];

export interface SendCopilotMessageInput {
  utterance: string;
  locale?: "en" | "ar";
  routeContext?: string;
}

/**
 * POST /copilot/message — classify an utterance into guide/action/clarify.
 * Bounded by a timeout so a slow or hung classifier surfaces as a visible
 * error in the panel instead of an endless spinner.
 */
const MESSAGE_TIMEOUT_MS = 60_000;

export async function sendCopilotMessage(
  input: SendCopilotMessageInput,
): Promise<CopilotMessageResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), MESSAGE_TIMEOUT_MS);
  try {
    const response = await apiClient<Envelope<CopilotMessageResult>>(
      "/copilot/message",
      {
        method: "POST",
        signal: controller.signal,
        body: {
          utterance: input.utterance,
          locale: input.locale ?? "en",
          ...(input.routeContext ? { routeContext: input.routeContext } : {}),
        },
      },
    );
    return response.data;
  } catch (error) {
    if (controller.signal.aborted) {
      throw new ApiError({
        status: 0,
        code: "REQUEST_TIMEOUT",
        message:
          "The assistant took too long to respond. Please try your request again.",
      });
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/** GET /copilot/guide/flows — permission-filtered flow catalog for the launcher. */
export async function getGuideFlows(
  locale?: "en" | "ar",
): Promise<GuideFlowMeta[]> {
  const query = locale ? `?locale=${locale}` : "";
  const response = await apiClient<Envelope<{ flows: GuideFlowMeta[] }>>(
    `/copilot/guide/flows${query}`,
    { method: "GET" },
  );
  return response.data.flows;
}

export interface ResolveGuideFlowInput {
  flowId: string;
  locale?: "en" | "ar";
}

/** POST /copilot/guide/resolve — start a flow directly (no LLM). */
export async function resolveGuideFlow(
  input: ResolveGuideFlowInput,
): Promise<GuideSession> {
  const response = await apiClient<Envelope<{ guideSession: GuideSession }>>(
    "/copilot/guide/resolve",
    {
      method: "POST",
      body: { flowId: input.flowId, locale: input.locale ?? "en" },
    },
  );
  return response.data.guideSession;
}

export interface CreateActionPlanInput {
  utterance?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  locale?: "en" | "ar";
}

/** POST /copilot/action — propose (and for destructive tools, hold) an action. */
export async function createActionPlan(
  input: CreateActionPlanInput,
): Promise<ActionPlan> {
  const response = await apiClient<Envelope<{ actionPlan: ActionPlan }>>(
    "/copilot/action",
    {
      method: "POST",
      body: {
        ...(input.utterance ? { utterance: input.utterance } : {}),
        ...(input.toolName ? { toolName: input.toolName } : {}),
        ...(input.toolInput ? { toolInput: input.toolInput } : {}),
        locale: input.locale ?? "en",
      },
    },
  );
  return response.data.actionPlan;
}

export interface ConfirmActionInput {
  runId: string;
  decision: "approve" | "reject";
  approvalId: string;
  note?: string;
}

/**
 * POST /copilot/action/:runId/confirm — approve or reject a held action. The
 * response run status is authoritative; socket lifecycle events are
 * enhancement-only.
 */
export async function confirmAction(
  input: ConfirmActionInput,
): Promise<{ status: string; run: { status: string } }> {
  const response = await apiClient<Envelope<{ run: { status: string } }>>(
    `/copilot/action/${encodeURIComponent(input.runId)}/confirm`,
    {
      method: "POST",
      body: {
        decision: input.decision,
        approvalId: input.approvalId,
        ...(input.note ? { note: input.note } : {}),
      },
    },
  );
  return { status: response.data.run.status, run: response.data.run };
}

export interface ActionRunDetails {
  status: string;
  [key: string]: unknown;
}

/** GET /copilot/action/:runId — fetch authoritative run state (REST fallback). */
export async function getActionStatus(
  runId: string,
): Promise<ActionRunDetails> {
  const response = await apiClient<Envelope<ActionRunDetails>>(
    `/copilot/action/${encodeURIComponent(runId)}`,
    { method: "GET" },
  );
  return response.data;
}

export type { ClarifyPayload };
