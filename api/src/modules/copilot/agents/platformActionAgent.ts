import { AGENT_CONTRACT_INVALID } from "../../../common/errors/errorCodes.js";
import type { AgentContract, AgentResultMetadata } from "../../agents/agentContract.js";
import { toAgentId } from "../../agents/agentContracts.js";
import type { AgentRunContext } from "../../agents/agentRunContext.js";
import { ToolRegistry } from "../../agents/toolRegistry.js";
import type { ClassifierDecision } from "../action/action.contracts.js";
import { resolveActionTarget, resolveTargetFromUtterance, getTargetIdField, extractDocumentNameFromUtterance, extractUserIdentityFromUtterance } from "../action/resolveActionTarget.js";
import { z } from "zod";

const PLATFORM_ACTION_AGENT_ID = "platform-action-agent";
const PLATFORM_ACTION_PROMPT_VERSION = "1.0.0";

const actionAgentInputSchema = z.object({
  mode: z.literal("action"),
  utterance: z.string().trim().min(1).max(2048),
  locale: z.enum(["en", "ar"]).default("en"),
  toolNameHint: z.string().trim().min(1).max(128).optional(),
  toolInput: z.record(z.string(), z.unknown()).optional(),
});

const actionAgentOutputSchema = z.object({
  mode: z.literal("action"),
  actionPlan: z.object({
    runId: z.string(),
    intent: z.string(),
    toolName: z.string(),
    toolInput: z.record(z.string(), z.unknown()).optional(),
    risk: z.enum(["low", "reversible", "destructive"]),
    requiresConfirmation: z.boolean(),
    summary: z.string(),
    target: z.object({
      type: z.string(),
      id: z.string(),
      label: z.string(),
    }).nullable(),
    undo: z.object({
      description: z.string(),
      toolName: z.string().optional(),
    }).optional(),
  }),
  availableTools: z.array(z.object({
    name: z.string(),
    description: z.string(),
    requiredPermission: z.string().optional(),
    approvalRequired: z.boolean().optional(),
    risk: z.enum(["low", "reversible", "destructive"]),
  })),
});

const TOOL_RISK_MAP: Record<string, "low" | "reversible" | "destructive"> = {
  "document.search": "low",
  "document.get": "low",
  "document.updateMetadata": "low",
  "document.archive": "reversible",
  "document.restore": "reversible",
  "document.softDelete": "destructive",
  "document.permanentDelete": "destructive",
  "user.invite": "reversible",
  "user.resendInvitation": "low",
  "user.revokeInvitation": "reversible",
  "user.delete": "destructive",
  "settings.update": "low",
};

/**
 * The closed set of tools the action agent may propose (the keys of its risk
 * catalog). Exposed so the runtime composition can assert at boot time that
 * every referenced tool is actually registered — a typo here must fail startup,
 * not produce AGENT_UNREGISTERED_TOOL rejections mid-run.
 */
export function platformActionToolCatalog(): readonly string[] {
  return Object.keys(TOOL_RISK_MAP);
}

const TOOL_UNDO_MAP: Record<string, { description: string; toolName?: string } | undefined> = {
  "document.archive": { description: "Restore the document from archive", toolName: "document.restore" },
  "document.restore": { description: "Archive the document again", toolName: "document.archive" },
  "document.softDelete": { description: "Restore the document from trash", toolName: "document.restore" },
  "user.invite": { description: "Revoke the invitation", toolName: "user.revokeInvitation" },
  "user.revokeInvitation": { description: "Re-invite the user", toolName: "user.invite" },
  "settings.update": { description: "Revert settings to previous version", toolName: "settings.update" },
};

export function createPlatformActionAgent(
  toolRegistry: ToolRegistry,
  _classifierDecision: ClassifierDecision,
): AgentContract<z.infer<typeof actionAgentInputSchema>, z.infer<typeof actionAgentOutputSchema>> {
  const availableTools = Array.from(toolRegistry.list().values()).map((tool) => ({
    name: tool.schema.name,
    description: tool.schema.description,
    requiredPermission: tool.schema.requiredPermission,
    approvalRequired: tool.schema.approvalRequired,
    risk: TOOL_RISK_MAP[tool.schema.name] ?? "low",
  }));

  return {
    id: toAgentId(PLATFORM_ACTION_AGENT_ID),
    version: "1.0.0",
    capabilities: ["read", "execute"],
    inputSchema: actionAgentInputSchema,
    outputSchema: actionAgentOutputSchema,

    async execute(
      runContext: AgentRunContext,
      input: unknown,
    ): Promise<{ ok: true; status: "completed"; output: z.infer<typeof actionAgentOutputSchema>; latencyMs: number; metadata?: AgentResultMetadata } | { ok: false; status: "failed" | "unauthorized" | "cancelled" | "timeout"; error: { code: string; message: string }; latencyMs: number; metadata?: AgentResultMetadata }> {
      const start = Date.now();
      const parsed = actionAgentInputSchema.safeParse(input);
      if (!parsed.success) {
        return {
          ok: false,
          status: "failed",
          error: { code: AGENT_CONTRACT_INVALID, message: "Invalid action agent input" },
          latencyMs: Date.now() - start,
        };
      }

      const { utterance, locale, toolNameHint } = parsed.data;

      let toolName: string | undefined = toolNameHint;
      if (!toolName) {
        toolName = inferToolFromUtterance(utterance, locale, toolRegistry);
      }

if (!toolName) {
        return {
          ok: false,
          status: "failed",
          error: { code: "NO_MATCHING_TOOL", message: "No matching action tool found for the request" },
          latencyMs: Date.now() - start,
        };
      }

      const tool = toolRegistry.get(toolName);
      if (!tool) {
        return {
          ok: false,
          status: "failed",
          error: { code: "UNREGISTERED_TOOL", message: `Tool ${toolName} is not registered` },
          latencyMs: Date.now() - start,
        };
      }

      // Narrow the type immediately after null check
      const toolNameStr = toolName!;
      const risk = (TOOL_RISK_MAP[toolNameStr] ?? "low") as "low" | "reversible" | "destructive";
      const requiresConfirmation = tool.schema.approvalRequired ?? false;
      const undo: { description: string; toolName?: string } | undefined = TOOL_UNDO_MAP[toolNameStr];

      const planToolInput = parsed.data.toolInput ? { ...parsed.data.toolInput } : {};

      const idField = getTargetIdField(toolNameStr);
      if (idField && typeof planToolInput[idField] !== "string") {
        const resolved = await resolveTargetFromUtterance({
          toolName: toolNameStr,
          utterance,
          tenantId: runContext.tenantId,
        });
        if (resolved) {
          planToolInput[resolved.idField] = resolved.id;
        } else {
          const named = idField === "documentId"
            ? extractDocumentNameFromUtterance(utterance)
            : extractUserIdentityFromUtterance(utterance);
          if (named) {
            return {
              ok: false,
              status: "failed",
              error: {
                code: "TARGET_NOT_FOUND",
                message: idField === "documentId"
                  ? `No document matching "${named}" was found in this workspace`
                  : `No user matching "${named}" was found in this workspace`,
              },
              latencyMs: Date.now() - start,
            };
          }
        }
      }

      let target: { type: string; id: string; label: string } | null;
      try {
        target = await resolveActionTarget({
          toolName: toolNameStr,
          toolInput: planToolInput,
          tenantId: runContext.tenantId,
        });
      } catch (caught) {
        return {
          ok: false,
          status: "failed",
          error: {
            code: "TARGET_NOT_FOUND",
            message: caught instanceof Error ? caught.message : "Action target could not be resolved",
          },
          latencyMs: Date.now() - start,
        };
      }

      return {
        ok: true,
        status: "completed",
        output: {
          mode: "action",
          actionPlan: {
            runId: runContext.runId!,
            intent: utterance,
            toolName: toolNameStr,
            toolInput: planToolInput,
            risk,
            requiresConfirmation,
            summary: buildSummary(toolNameStr, risk, locale),
            target,
            undo: undo ?? undefined,
          },
          availableTools,
        },
        latencyMs: Date.now() - start,
        metadata: {
          modelProvider: "copilot-action-agent",
          modelName: "deterministic",
          promptVersion: PLATFORM_ACTION_PROMPT_VERSION,
          tokensUsed: 0,
          estimatedCost: 0,
          latencyMs: Date.now() - start,
        },
      };
    },
  };
}

function inferToolFromUtterance(
  utterance: string,
  locale: "en" | "ar",
  toolRegistry: ToolRegistry,
): string | undefined {
  const lower = utterance.toLowerCase();

  const toolKeywords: Record<string, string[]> = {
    "document.search": ["search", "find", "look for", "list documents", "بحث", "ابحث", "قائمة المستندات"],
    "document.get": ["get", "details", "show", "view", "عرض", "تفاصيل", "اعرض"],
    "document.updateMetadata": ["update", "rename", "change", "edit", "تحديث", "إعادة تسمية", "تغيير", "تعديل"],
    "document.archive": ["archive", "hide", "أرشف", "إخفاء"],
    "document.restore": ["restore", "unarchive", "استعادة", "إلغاء الأرشفة"],
    "document.softDelete": ["delete", "remove", "trash", "soft delete", "حذف", "إزالة", "سلة المهملات", "حذف ناعم"],
    "document.permanentDelete": ["permanently delete", "permanent delete", "delete forever", "حذف نهائي", "حذف دائم"],
    "user.invite": ["invite", "add user", "new user", "دعوة", "إضافة مستخدم", "مستخدم جديد"],
    "user.resendInvitation": ["resend", "re-send", "إعادة إرسال", "أعد الإرسال"],
    "user.revokeInvitation": ["revoke", "cancel invitation", "إلغاء الدعوة", "إلغاء"],
    "user.delete": ["delete user", "remove user", "حذف مستخدم", "إزالة مستخدم"],
    "settings.update": ["settings", "preferences", "update settings", "change settings", "إعدادات", "تفضيلات", "تحديث الإعدادات", "تغيير الإعدادات"],
  };

  for (const [toolName, keywords] of Object.entries(toolKeywords)) {
    if (toolRegistry.get(toolName) && keywords.some((k) => lower.includes(k))) {
      return toolName;
    }
  }

  return undefined;
}

function buildSummary(toolName: string, risk: "low" | "reversible" | "destructive", locale: "en" | "ar"): string {
  const summaries: Record<string, { en: string; ar: string }> = {
    "document.search": { en: "Search for documents in your knowledge base", ar: "البحث عن مستندات في قاعدة المعرفة" },
    "document.get": { en: "View document details", ar: "عرض تفاصيل المستند" },
    "document.updateMetadata": { en: "Update document metadata (title, description, tags)", ar: "تحديث بيانات المستند (العنوان، الوصف، الوسوم)" },
    "document.archive": { en: "Archive the document (reversible)", ar: "أرشفة المستند (قابل للعكس)" },
    "document.restore": { en: "Restore the document from archive", ar: "استعادة المستند من الأرشيف" },
    "document.softDelete": { en: "Move document to trash (reversible via restore)", ar: "نقل المستند إلى سلة المهملات (قابل للاستعادة)" },
    "document.permanentDelete": { en: "Permanently delete document (irreversible)", ar: "حذف المستند نهائيًا (لا يمكن التراجع)" },
    "user.invite": { en: "Invite a new user to the tenant", ar: "دعوة مستخدم جديد إلى المؤسسة" },
    "user.resendInvitation": { en: "Resend invitation to pending user", ar: "إعادة إرسال الدعوة للمستخدم المعلّق" },
    "user.revokeInvitation": { en: "Revoke a pending invitation", ar: "إلغاء دعوة معلّقة" },
    "user.delete": { en: "Delete a user (irreversible)", ar: "حذف مستخدم (لا يمكن التراجع)" },
    "settings.update": { en: "Update tenant settings", ar: "تحديث إعدادات المؤسسة" },
  };

  const summary = summaries[toolName] ?? { en: `Execute ${toolName}`, ar: `تنفيذ ${toolName}` };
  return locale === "ar" ? summary.ar : summary.en;
}