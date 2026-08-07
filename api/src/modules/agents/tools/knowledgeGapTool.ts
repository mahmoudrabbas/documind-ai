import { z } from "zod";
import type { RegisteredTool, RunContext } from "../agents.types.js";
import {
  knowledgeGapsService,
  type KnowledgeGapsService,
} from "../../knowledge-gaps/knowledge-gaps.service.js";

const KNOWLEDGE_GAP_TOOL_INPUT = z.object({
  question: z.string().min(1),
  outcome: z.enum(["unanswered", "low_confidence", "negative_feedback"]),
  confidence: z.number().min(0).max(1).default(0.5),
});

const KNOWLEDGE_GAP_TOOL_OUTPUT = z.object({
  gapId: z.string(),
  status: z.string(),
});

// Maps the tool's outcome vocabulary to the KnowledgeGapsService candidate
// outcome vocabulary used by reportCandidate.
const OUTCOME_MAP: Record<
  "unanswered" | "low_confidence" | "negative_feedback",
  "refused" | "weak" | "negative_feedback"
> = {
  unanswered: "refused",
  low_confidence: "weak",
  negative_feedback: "negative_feedback",
};

/**
 * Creates the `report_knowledge_gap` agent tool.
 *
 * This tool records a knowledge-gap candidate for the current tenant via
 * knowledgeGapsService.reportCandidate(), returning the gap id and status.
 */
export function createKnowledgeGapTool(
  service: KnowledgeGapsService = knowledgeGapsService,
): RegisteredTool {
  return {
    schema: {
      name: "report_knowledge_gap",
      version: "1.0.0",
      description:
        "Records a knowledge-gap candidate for the current tenant. " +
        "Call this tool whenever the assistant cannot answer the user's question " +
        "from the knowledge base (outcome=unanswered), answers with low confidence " +
        "(outcome=low_confidence), or receives negative feedback " +
        "(outcome=negative_feedback). Pass the user's original question unchanged. " +
        "This creates a tracked gap so the missing knowledge can be added and resolved.",
      inputSchema: KNOWLEDGE_GAP_TOOL_INPUT,
      outputSchema: KNOWLEDGE_GAP_TOOL_OUTPUT,
      requiredPermission: "knowledge_gaps:create",
      approvalRequired: false,
      timeoutMs: 5_000,
      maxRetries: 1,
    },
    handler: async (context: RunContext, input: unknown) => {
      const params = KNOWLEDGE_GAP_TOOL_INPUT.parse(input);

      const gap = await service.reportCandidate(context.tenantId, context.actorId, {
        question: params.question,
        outcome: OUTCOME_MAP[params.outcome],
        confidence: params.confidence,
        evidenceSummaryIds: [],
        conversationId: context.conversationId,
        messageId: context.messageId,
        traceId: context.traceId,
      });

      const record = gap as { _id?: unknown; id?: unknown; status?: string } | null;
      const gapId = String(record?._id ?? record?.id ?? "");
      const status = record?.status ?? "open";

      return { gapId, status };
    },
  };
}
