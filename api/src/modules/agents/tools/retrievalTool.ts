import { z } from "zod";
import type { RegisteredTool, RunContext } from "../agents.types.js";
import type { AgentRunContext } from "../agentRunContext.js";
import type { BaseRole } from "../../../common/auth/baseRoles.js";
import { AppError } from "../../../common/errors/AppError.js";
import type { HybridRetrievalService } from "../../retrieval/retrieval.service.js";
import type { AccessContext, RetrievalQuery } from "../../retrieval/retrieval.types.js";

const RETRIEVAL_TOOL_INPUT = z.object({
  queryText: z.string().min(1, "queryText is required"),
  topK: z.number().int().min(1).max(50).default(5),
  documentIds: z.array(z.string()).optional(),
  categories: z.array(z.string()).optional(),
  departments: z.array(z.string()).optional(),
  classifications: z.array(z.string()).optional(),
});

const RETRIEVAL_TOOL_OUTPUT = z.object({
  candidates: z.array(
    z.object({
      chunkId: z.string(),
      documentId: z.string(),
      text: z.string(),
      score: z.number(),
      retrievalMethod: z.string(),
      scoreBreakdown: z
        .object({
          vectorScore: z.number().optional(),
          keywordScore: z.number().optional(),
          fusionScore: z.number(),
        })
        .optional(),
    }),
  ),
  totalCandidates: z.number(),
});

/**
 * Creates the hybrid_search agent tool.
 *
 * This tool performs semantic + keyword search over document chunks
 * and returns ranked results to the agent.
 *
 * The baseRole used for retrieval access is the trusted server-side value
 * from the RunContext; if absent, it is resolved from the persisted actor
 * via `resolveActor`. If neither is available the tool fails closed — no
 * default role is ever assumed.
 */
export function createRetrievalTool(
  service: HybridRetrievalService,
  resolveActor?: (context: {
    tenantId: string;
    actorId: string;
  }) => Promise<{ baseRole: BaseRole }>,
): RegisteredTool {
  return {
    schema: {
      name: "hybrid_search",
      version: "1.0.0",
      description:
        "Hybrid semantic + keyword search over document chunks. " +
        "Returns ranked results from both vector similarity and BM25 keyword matching, " +
        "fused via Reciprocal Rank Fusion.",
      inputSchema: RETRIEVAL_TOOL_INPUT,
      outputSchema: RETRIEVAL_TOOL_OUTPUT,
      requiredPermission: "documents:read",
      approvalRequired: false,
      timeoutMs: 10_000,
      maxRetries: 1,
    },
    handler: async (context: RunContext, input: unknown) => {
      const params = RETRIEVAL_TOOL_INPUT.parse(input);

      let actorRole: BaseRole | undefined;
      let actorEmail: string | undefined;
      const agentContext = context as Partial<AgentRunContext>;
      if (agentContext.actorRole) {
        actorRole = agentContext.actorRole;
        actorEmail = agentContext.actorEmail;
      } else if (resolveActor) {
        const resolved = await resolveActor({
          tenantId: context.tenantId,
          actorId: context.actorId,
        }).catch(() => null);
        if (resolved) {
          actorRole = resolved.baseRole;
        }
      }

      if (!actorRole) {
        throw new AppError(
          401,
          "UNAUTHORIZED",
          "Tool execution requires an authenticated agent context",
        );
      }

      const accessContext: AccessContext = {
        tenantId: context.tenantId,
        actorId: context.actorId,
        actorEmail: actorEmail ?? null,
        baseRole: actorRole,
      };

      const query: RetrievalQuery = {
        queryText: params.queryText,
        topK: params.topK,
      };

      // Build filter from optional params
      const hasFilter =
        params.documentIds?.length ||
        params.categories?.length ||
        params.departments?.length ||
        params.classifications?.length;

      if (hasFilter) {
        query.filter = {};
        if (params.documentIds?.length) {
          query.filter.documentIds = params.documentIds;
        }
        if (params.categories?.length) {
          query.filter.categories = params.categories;
        }
        if (params.departments?.length) {
          query.filter.departments = params.departments;
        }
        if (params.classifications?.length) {
          query.filter.classifications = params.classifications;
        }
      }

      const result = await service.hybridSearch(query, accessContext);

      return {
        candidates: result.candidates.map((c) => ({
          chunkId: c.chunkId,
          documentId: c.documentId,
          text: c.text,
          score: c.score,
          retrievalMethod: c.retrievalMethod,
          scoreBreakdown: c.scoreBreakdown,
        })),
        totalCandidates: result.totalCandidates,
      };
    },
  };
}
