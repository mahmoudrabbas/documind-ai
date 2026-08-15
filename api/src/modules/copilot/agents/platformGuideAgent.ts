import { AGENT_CONTRACT_INVALID } from "../../../common/errors/errorCodes.js";
import type { AgentContract, AgentResultMetadata } from "../../agents/agentContract.js";
import { toAgentId } from "../../agents/agentContracts.js";
import type { AgentRunContext } from "../../agents/agentRunContext.js";
import { expandGuideFlow, buildNavigationGuide } from "../guide/guide.service.js";
import {
  matchFlowToUtterance as guideIntentMatchFlowToUtterance,
  hasHowToFraming,
  hasNavFraming,
  isExplicitNoGuide,
} from "../guide/guideIntent.js";
import {
  matchSectionToUtterance,
  type GuideSectionContext,
} from "../guide/guideSections.js";
import { getGuideFlow } from "../guide/guideFlows.js";
import { z } from "zod";

const PLATFORM_GUIDE_AGENT_ID = "platform-guide-agent";
const PLATFORM_GUIDE_PROMPT_VERSION = "2.0.0";

const guideAgentInputSchema = z.object({
  utterance: z.string().trim().min(1).max(2048),
  locale: z.enum(["en", "ar"]).default("en"),
  flowIdHint: z.string().trim().min(1).max(64).optional(),
  routeContext: z.string().trim().max(256).optional(),
});

const guideAgentOutputSchema = z.object({
  mode: z.literal("guide"),
  guideSession: z.object({
    sessionId: z.string(),
    flowId: z.string(),
    locale: z.enum(["en", "ar"]),
    dir: z.enum(["ltr", "rtl"]),
    steps: z.array(z.object({
      stepId: z.string(),
      order: z.number(),
      title: z.string(),
      instruction: z.string(),
      target: z.object({
        targetId: z.string(),
        route: z.string().optional(),
        optional: z.boolean().optional(),
      }),
      placement: z.enum(["top", "bottom", "start", "end", "auto"]),
      interaction: z.enum(["click", "input", "navigate", "observe", "none"]),
      completion: z.object({
        event: z.enum(["click", "route_change", "value_present", "manual"]),
        routeMatch: z.string().optional(),
      }),
      fallback: z.object({
        onMissing: z.enum(["skip", "stop", "wait"]),
        waitMs: z.number().optional(),
      }),
    })),
    entryRoute: z.string(),
  }),
  availableFlows: z.array(z.string()).optional(),
});

export const platformGuideAgent: AgentContract<z.infer<typeof guideAgentInputSchema>, z.infer<typeof guideAgentOutputSchema>> = {
  id: toAgentId(PLATFORM_GUIDE_AGENT_ID),
  version: "1.0.0",
  capabilities: ["read", "generate"],
  inputSchema: guideAgentInputSchema,
  outputSchema: guideAgentOutputSchema,

  async execute(
    runContext: AgentRunContext,
    input: unknown,
  ): Promise<{ ok: true; status: "completed"; output: z.infer<typeof guideAgentOutputSchema>; latencyMs: number; metadata?: AgentResultMetadata } | { ok: false; status: "failed" | "unauthorized" | "cancelled" | "timeout"; error: { code: string; message: string }; latencyMs: number; metadata?: AgentResultMetadata }> {
    const start = Date.now();
    const parsed = guideAgentInputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        status: "failed",
        error: { code: AGENT_CONTRACT_INVALID, message: "Invalid guide agent input" },
        latencyMs: Date.now() - start,
      };
    }

    const { utterance, locale, flowIdHint, routeContext } = parsed.data;

    const guideContext = {
      tenantId: runContext.tenantId,
      actorId: runContext.actorId,
      actorRole: runContext.actorRole as "SUPER_ADMIN" | "COMPANY_ADMIN" | "EMPLOYEE",
      locale,
    };
    const sectionContext: GuideSectionContext =
      runContext.actorRole === "SUPER_ADMIN" ? "platform" : "tenant";

    const availableFlows = await listAvailableFlowsForContext(runContext);

    // The user explicitly declined a guided walkthrough ("do not guide me",
    // "don't walk me through the UI"). The guide agent has no tools, so it
    // must never fabricate a session for such a request — the classifier
    // routes these to the unsupported-capability path, and this guard keeps
    // direct calls safe too.
    if (isExplicitNoGuide(utterance)) {
      return {
        ok: false,
        status: "failed",
        error: {
          code: "CAPABILITY_UNAVAILABLE",
          message: "Direct execution is not supported by the guide agent",
        },
        latencyMs: Date.now() - start,
      };
    }

    let session: Awaited<ReturnType<typeof expandGuideFlow>> = null;

    // Resolution is framing-aware:
    //   "how do I ..."          -> prefer a step-by-step flow
    //   "where is / open the …" -> prefer the section navigation guide
    //   otherwise               -> the strongest match wins (specific phrases
    //                              beat generic keywords by length)
    const flowMatch = guideIntentMatchFlowToUtterance(
      utterance,
      locale,
      availableFlows,
      routeContext,
    );
    const section = matchSectionToUtterance(utterance, sectionContext, locale);

    if (hasHowToFraming(utterance)) {
      if (flowMatch) {
        session = await expandGuideFlow(flowMatch.flowId, guideContext);
      }
      if (!session && section) {
        session = await buildNavigationGuide(section, guideContext);
      }
    } else if (hasNavFraming(utterance)) {
      if (section) {
        session = await buildNavigationGuide(section, guideContext);
      }
      if (!session && flowMatch) {
        session = await expandGuideFlow(flowMatch.flowId, guideContext);
      }
    } else if (flowMatch) {
      session = await expandGuideFlow(flowMatch.flowId, guideContext);
    } else if (section) {
      session = await buildNavigationGuide(section, guideContext);
    }

    // The classifier hint is used only as a last resort, and only when it is a
    // registered flow whose keywords actually overlap the utterance. This keeps
    // a generic guess (e.g. "settings.open") from producing a Settings guide
    // for unrelated requests while still honoring a confident, on-topic hint.
    if (!session && flowIdHint && flowHintMatchesUtterance(flowIdHint, utterance)) {
      session = await expandGuideFlow(flowIdHint, guideContext);
    }

    if (!session) {
      return {
        ok: false,
        status: "failed",
        error: { code: "NO_MATCHING_FLOW", message: "No matching guide flow found for the request" },
        latencyMs: Date.now() - start,
      };
    }

    return {
      ok: true,
      status: "completed",
      output: {
        mode: "guide",
        guideSession: session,
        availableFlows,
      },
      latencyMs: Date.now() - start,
      metadata: {
        modelProvider: "copilot-guide-agent",
        modelName: "deterministic",
        promptVersion: PLATFORM_GUIDE_PROMPT_VERSION,
        tokensUsed: 0,
        estimatedCost: 0,
        latencyMs: Date.now() - start,
      },
    };
  },
};

async function listAvailableFlowsForContext(runContext: AgentRunContext): Promise<string[]> {
  const { listAvailableGuideFlows } = await import("../guide/guide.service.js");
  const guideContext = {
    tenantId: runContext.tenantId,
    actorId: runContext.actorId,
    actorRole: runContext.actorRole as "SUPER_ADMIN" | "COMPANY_ADMIN" | "EMPLOYEE",
    locale: "en" as const,
  };
  return listAvailableGuideFlows(guideContext);
}

/**
 * Whether a classifier `flowIdHint` plausibly matches the utterance. A hint is
 * only trusted when it names a registered flow whose keywords overlap the
 * request — a hallucinated or generic hint never wins over the deterministic
 * matcher.
 */
function flowHintMatchesUtterance(flowId: string, utterance: string): boolean {
  if (!getGuideFlow(flowId)) return false;
  const match = guideIntentMatchFlowToUtterance(
    utterance,
    "en",
    [flowId],
    undefined,
  );
  return match !== null;
}