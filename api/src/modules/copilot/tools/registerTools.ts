import { z } from "zod";
import type { CopilotTool } from "./tool.types.js";
import { CopilotToolRegistry } from "./toolRegistry.js";
import type { ToolContext, ToolResult } from "../copilot.types.js";
import type { BaseRole } from "../../../common/auth/baseRoles.js";
import { getCopilotRetrievalService } from "../knowledge/retrievalAccess.js";
import { toUserOpCtx } from "./serviceAccess.js";
import { listUsers, inviteUser, updateUser, resendInvitation, deleteUser } from "../../users/users.service.js";
import { triggerOcrProcessing, reviewDocumentQuality, triggerMetadataAnalysis, retryOcrPages } from "../../processing/processing.service.js";
import { startDocumentIndexing } from "../../processing/indexing/indexing.service.js";
import { ImportBatchService } from "../../imports/services/importBatch.service.js";
import { createDocumentServiceProviders } from "../../documents/documents.service.js";
import { storageProvider } from "../../../providers/storage/index.js";
import { LocalFileSignatureScanner } from "../../../providers/security-scanner/index.js";
import { FakeEntitlementChecker } from "../../../providers/entitlements/index.js";
import { RealProcessingDispatcher, StubProcessingDispatcher } from "../../../providers/processing/index.js";
import { Permission } from "../../permissions/permissions.catalog.js";
import { getPermissionEvaluator } from "../../permissions/permissions.evaluator.js";
import type { AccessContext } from "../../retrieval/retrieval.types.js";
import mongoose from "mongoose";

/**
 * Resolves retrieval access context for copilot search tools. Mirrors the
 * document-access authorization service: custom-role grants and permission
 * scopes are resolved server-side so tenant/category/department scoping is
 * honored by the retrieval engine.
 */
async function buildRetrievalAccessContext(ctx: ToolContext): Promise<AccessContext> {
  const resolved = await getPermissionEvaluator().resolve({
    tenantId: ctx.tenantId,
    actorId: ctx.actorId,
    baseRole: ctx.actorRole as BaseRole,
    customRoleId: ctx.customRoleId,
  });
  const grant = resolved.grants.get(Permission.DOCUMENTS_USE_IN_AI);
  return {
    tenantId: ctx.tenantId,
    actorId: ctx.actorId,
    actorEmail: ctx.actorEmail,
    baseRole: resolved.baseRole,
    customRoleId: resolved.customRoleId,
    permissionScopes: grant?.scope ?? undefined,
  };
}

const navSchema = z.object({ route: z.string().min(1) });

const navigationTools: CopilotTool[] = [
  {
    name: "navigateToPage",
    description: "Navigate to a specific page in the application",
    category: "navigation",
    auditCategory: "navigation",
    inputSchema: navSchema,
    handler: async (params: unknown, _ctx: ToolContext): Promise<ToolResult> => {
      const { route } = navSchema.parse(params);
      return { ok: true, data: { route }, error: null, latencyMs: 0, auditEvent: null };
    },
    requiredPermission: null,
    confirmationLevel: "safe",
  },
];

let docService: ReturnType<typeof createDocumentServiceProviders> | null = null;

function getDocService() {
  if (!docService) {
    docService = createDocumentServiceProviders({
      storageProvider,
      securityScanner: new LocalFileSignatureScanner(),
      entitlementChecker: new FakeEntitlementChecker(),
      processingDispatcher: process.env.NODE_ENV === "test"
        ? new StubProcessingDispatcher()
        : new RealProcessingDispatcher(),
    });
  }
  return docService;
}

const docSearchSchema = z.object({ query: z.string().min(1), limit: z.number().optional() });
const docDetailSchema = z.object({ documentId: z.string().min(1) });
const docUploadSchema = z.object({ filename: z.string().min(1), content: z.string().min(1) });
const docDeleteSchema = z.object({ documentId: z.string().min(1) });

const SEARCH_STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "can", "do", "for", "from",
  "how", "i", "in", "is", "it", "of", "on", "or", "show", "that", "the", "to",
  "what", "when", "where", "which", "who", "why", "with", "find", "list",
  "search", "get", "me", "about", "documents", "document", "please",
]);

function extractSearchKeywords(query: string): string {
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((token) => token.length > 1 && !SEARCH_STOPWORDS.has(token))
    .join(" ");
}

const documentTools: CopilotTool[] = [
  {
    name: "searchDocuments",
    description: "Search documents in the knowledge base",
    category: "document",
    auditCategory: "document",
    inputSchema: docSearchSchema,
    handler: async (params: unknown, ctx: ToolContext): Promise<ToolResult> => {
      const { query, limit } = docSearchSchema.parse(params);
      const start = performance.now();
      try {
        const service = getDocService();
        const keywords = extractSearchKeywords(query);
        const result = await service.listDocuments(
          { search: keywords || query, pageSize: limit ?? 10 },
          ctx.tenantId,
          { userId: ctx.actorId, email: ctx.actorEmail, role: ctx.actorRole as BaseRole },
        );
        return { ok: true, data: { documents: result.documents, total: result.pagination?.totalRecords ?? result.documents.length }, error: null, latencyMs: Math.round(performance.now() - start), auditEvent: null };
      } catch (err) {
        return { ok: false, data: null, error: err instanceof Error ? err.message : "Search failed", latencyMs: Math.round(performance.now() - start), auditEvent: null };
      }
    },
    requiredPermission: "documents:read",
    confirmationLevel: "safe",
  },
  {
    name: "getDocumentDetails",
    description: "View document details",
    category: "document",
    auditCategory: "document",
    inputSchema: docDetailSchema,
    handler: async (params: unknown, ctx: ToolContext): Promise<ToolResult> => {
      const { documentId } = docDetailSchema.parse(params);
      const start = performance.now();
      try {
        const service = getDocService();
        const result = await service.getDocument(documentId, ctx.tenantId, { userId: ctx.actorId, email: ctx.actorEmail, role: ctx.actorRole as BaseRole });
        return { ok: true, data: result.document, error: null, latencyMs: Math.round(performance.now() - start), auditEvent: null };
      } catch (err) {
        return { ok: false, data: null, error: err instanceof Error ? err.message : "Failed to get document", latencyMs: Math.round(performance.now() - start), auditEvent: null };
      }
    },
    requiredPermission: "documents:read",
    confirmationLevel: "safe",
  },
  {
    name: "uploadDocument",
    description: "Upload a new document",
    category: "document",
    auditCategory: "document",
    inputSchema: docUploadSchema,
    handler: async (params: unknown, ctx: ToolContext): Promise<ToolResult> => {
      const { filename, content } = docUploadSchema.parse(params);
      const start = performance.now();
      try {
        const service = getDocService();
        const file = { originalname: filename, buffer: Buffer.from(content), size: Buffer.byteLength(content), mimetype: "application/octet-stream", fieldname: "file", encoding: "7bit", destination: "", filename, path: "", stream: null as unknown as NodeJS.ReadableStream } as Express.Multer.File;
        const result = await service.uploadDocument(file, { name: filename }, ctx.tenantId, { userId: ctx.actorId, email: ctx.actorEmail, role: ctx.actorRole as BaseRole });
        return { ok: true, data: { documentId: result.document.id, status: "uploaded" }, error: null, latencyMs: Math.round(performance.now() - start), auditEvent: { action: "DOCUMENT_UPLOADED" as never, resourceType: "Document", resourceId: result.document.id } };
      } catch (err) {
        return { ok: false, data: null, error: err instanceof Error ? err.message : "Upload failed", latencyMs: Math.round(performance.now() - start), auditEvent: null };
      }
    },
    requiredPermission: "documents:create",
    confirmationLevel: "medium",
  },
  {
    name: "deleteDocument",
    description: "Delete a document from the system",
    category: "document",
    auditCategory: "document",
    inputSchema: docDeleteSchema,
    handler: async (params: unknown, ctx: ToolContext): Promise<ToolResult> => {
      const { documentId } = docDeleteSchema.parse(params);
      const start = performance.now();
      try {
        const service = getDocService();
        await service.softDeleteDocument(documentId, ctx.tenantId, { userId: ctx.actorId, email: ctx.actorEmail, role: ctx.actorRole as BaseRole });
        return { ok: true, data: { documentId, status: "deleted" }, error: null, latencyMs: Math.round(performance.now() - start), auditEvent: { action: "DOCUMENT_DELETED" as never, resourceType: "Document", resourceId: documentId } };
      } catch (err) {
        return { ok: false, data: null, error: err instanceof Error ? err.message : "Delete failed", latencyMs: Math.round(performance.now() - start), auditEvent: null };
      }
    },
    requiredPermission: "documents:delete",
    confirmationLevel: "high",
  },
  {
    name: "renameDocument",
    description: "Rename a document in the knowledge base",
    category: "document",
    auditCategory: "document",
    inputSchema: z.object({ documentId: z.string().min(1), title: z.string().min(1).max(120) }),
    handler: async (params: unknown, ctx: ToolContext): Promise<ToolResult> => {
      const { documentId, title } = params as { documentId: string; title: string };
      const start = performance.now();
      try {
        const service = getDocService();
        const previous = await service.getDocument(documentId, ctx.tenantId, { userId: ctx.actorId, email: ctx.actorEmail, role: ctx.actorRole as BaseRole });
        const previousTitle = previous.document.metadata?.title ?? "";
        const result = await service.updateDocumentMetadata(documentId, { title }, ctx.tenantId, { userId: ctx.actorId, email: ctx.actorEmail, role: ctx.actorRole as BaseRole });
        return { ok: true, data: { documentId, title: result.document.metadata?.title ?? title, previousTitle }, error: null, latencyMs: Math.round(performance.now() - start), auditEvent: { action: "DOCUMENT_METADATA_UPDATED" as never, resourceType: "Document", resourceId: documentId } };
      } catch (err) {
        return { ok: false, data: null, error: err instanceof Error ? err.message : "Rename failed", latencyMs: Math.round(performance.now() - start), auditEvent: null };
      }
    },
    rollbackCapable: true,
    rollback: async (params: unknown, ctx: ToolContext, resultData?: unknown): Promise<ToolResult> => {
      const { documentId } = params as { documentId: string };
      const previousTitle = (resultData as { previousTitle?: string } | undefined)?.previousTitle;
      if (!previousTitle) {
        return { ok: false, data: null, error: "Cannot rollback rename: previous title unknown", latencyMs: 0, auditEvent: null };
      }
      const service = getDocService();
      const result = await service.updateDocumentMetadata(documentId, { title: previousTitle }, ctx.tenantId, { userId: ctx.actorId, email: ctx.actorEmail, role: ctx.actorRole as BaseRole });
      return { ok: true, data: { documentId, title: result.document.metadata?.title ?? previousTitle, restored: true }, error: null, latencyMs: 0, auditEvent: null };
    },
    requiredPermission: "documents:update",
    confirmationLevel: "medium",
  },
];

const userListSchema = z.object({ page: z.number().optional(), pageSize: z.number().optional() });
const userInviteSchema = z.object({ email: z.string().email(), role: z.string().optional(), name: z.string().optional() });
const userRoleSchema = z.object({ userId: z.string().min(1), role: z.string().min(1) });

const userTools: CopilotTool[] = [
  {
    name: "listUsers",
    description: "List tenant users",
    category: "user",
    auditCategory: "user",
    inputSchema: userListSchema,
    handler: async (params: unknown, ctx: ToolContext): Promise<ToolResult> => {
      const { page, pageSize } = userListSchema.parse(params);
      const start = performance.now();
      try {
        const result = await listUsers({ page: page ?? 1, pageSize: pageSize ?? 20 }, toUserOpCtx(ctx));
        return { ok: true, data: { users: result.users, pagination: result.pagination }, error: null, latencyMs: Math.round(performance.now() - start), auditEvent: null };
      } catch (err) {
        return { ok: false, data: null, error: err instanceof Error ? err.message : "Failed to list users", latencyMs: Math.round(performance.now() - start), auditEvent: null };
      }
    },
    requiredPermission: "users:read",
    confirmationLevel: "safe",
  },
  {
    name: "inviteEmployee",
    description: "Invite a new employee to the tenant",
    category: "user",
    auditCategory: "user",
    inputSchema: userInviteSchema,
    handler: async (params: unknown, ctx: ToolContext): Promise<ToolResult> => {
      const { email, role, name } = userInviteSchema.parse(params);
      const start = performance.now();
      try {
        const displayName = name ?? email
          .split("@")[0]
          .split(/[._-]+/)
          .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
          .join(" ");
        const result = await inviteUser({ name: displayName, email, role: role ?? "EMPLOYEE" }, toUserOpCtx(ctx));
        return { ok: true, data: { email, role: role ?? "EMPLOYEE", status: "invited", user: result.user }, error: null, latencyMs: Math.round(performance.now() - start), auditEvent: { action: "USER_INVITED" as never, resourceType: "User", resourceId: email } };
      } catch (err) {
        return { ok: false, data: null, error: err instanceof Error ? err.message : "Invitation failed", latencyMs: Math.round(performance.now() - start), auditEvent: null };
      }
    },
    rollbackCapable: true,
    rollback: async (params: unknown, ctx: ToolContext, resultData?: unknown): Promise<ToolResult> => {
      const data = resultData as { user?: { id?: string; _id?: string } } | undefined;
      const userId = data?.user?.id ?? data?.user?._id;
      if (!userId) {
        return { ok: false, data: null, error: "Cannot rollback invite: created user id unknown", latencyMs: 0, auditEvent: null };
      }
      await deleteUser(toUserOpCtx(ctx), userId);
      return { ok: true, data: { userId, removed: true }, error: null, latencyMs: 0, auditEvent: null };
    },
    requiredPermission: "users:create",
    confirmationLevel: "medium",
  },
  {
    name: "changeUserRole",
    description: "Change a user's role",
    category: "user",
    auditCategory: "user",
    inputSchema: userRoleSchema,
    handler: async (params: unknown, ctx: ToolContext): Promise<ToolResult> => {
      const { userId, role } = userRoleSchema.parse(params);
      const start = performance.now();
      try {
        const result = await updateUser({ role }, toUserOpCtx(ctx), userId);
        return { ok: true, data: { userId, newRole: role, status: "updated", user: result.user }, error: null, latencyMs: Math.round(performance.now() - start), auditEvent: { action: "USER_ROLE_CHANGED" as never, resourceType: "User", resourceId: userId } };
      } catch (err) {
        return { ok: false, data: null, error: err instanceof Error ? err.message : "Role change failed", latencyMs: Math.round(performance.now() - start), auditEvent: null };
      }
    },
    requiredPermission: "users:assign-role",
    confirmationLevel: "high",
  },
  {
    name: "resendInvitation",
    description: "Resend an invitation email to a pending user",
    category: "user",
    auditCategory: "user",
    inputSchema: z.object({ userId: z.string().min(1) }),
    handler: async (params: unknown, ctx: ToolContext): Promise<ToolResult> => {
      const { userId } = params as { userId: string };
      const start = performance.now();
      try {
        const result = await resendInvitation(toUserOpCtx(ctx), userId);
        return { ok: true, data: { userId, email: result.user.email, status: "invitation_resent" }, error: null, latencyMs: Math.round(performance.now() - start), auditEvent: { action: "INVITATION_RESENT" as never, resourceType: "User", resourceId: userId } };
      } catch (err) {
        return { ok: false, data: null, error: err instanceof Error ? err.message : "Resend invitation failed", latencyMs: Math.round(performance.now() - start), auditEvent: null };
      }
    },
    requiredPermission: "users:create",
    confirmationLevel: "medium",
  },
];

const ocrSchema = z.object({ documentId: z.string().min(1) });
const reindexSchema = z.object({ documentId: z.string().min(1) });
const qualitySchema = z.object({ documentId: z.string().min(1), documentVersion: z.number().optional(), decision: z.enum(["approved", "rejected", "retry"]) });

const processingTools: CopilotTool[] = [
  {
    name: "startOCRProcessing",
    description: "Start OCR processing on a document",
    category: "processing",
    auditCategory: "processing",
    inputSchema: ocrSchema,
    handler: async (params: unknown, ctx: ToolContext): Promise<ToolResult> => {
      const { documentId } = ocrSchema.parse(params);
      const start = performance.now();
      try {
        const result = await triggerOcrProcessing(ctx.tenantId, { documentId }, { tenantId: ctx.tenantId, actorId: ctx.actorId, actorEmail: ctx.actorEmail, actorRole: ctx.actorRole as BaseRole, traceId: ctx.traceId, requestId: ctx.requestId });
        return { ok: true, data: { documentId, jobId: result.jobId, status: "ocr_started" }, error: null, latencyMs: Math.round(performance.now() - start), auditEvent: { action: "OCR_TRIGGERED" as never, resourceType: "Document", resourceId: documentId } };
      } catch (err) {
        return { ok: false, data: null, error: err instanceof Error ? err.message : "OCR start failed", latencyMs: Math.round(performance.now() - start), auditEvent: null };
      }
    },
    requiredPermission: "documents:ocr-process",
    confirmationLevel: "medium",
  },
  {
    name: "startReindexing",
    description: "Re-index a document for AI search",
    category: "processing",
    auditCategory: "processing",
    inputSchema: reindexSchema,
    handler: async (params: unknown, ctx: ToolContext): Promise<ToolResult> => {
      const { documentId } = reindexSchema.parse(params);
      const start = performance.now();
      try {
        const result = await triggerMetadataAnalysis(ctx.tenantId, { documentId }, { tenantId: ctx.tenantId, actorId: ctx.actorId, actorEmail: ctx.actorEmail, actorRole: ctx.actorRole as BaseRole, traceId: ctx.traceId, requestId: ctx.requestId });
        return { ok: true, data: { documentId, candidates: result.candidates.length, status: "analysis_triggered" }, error: null, latencyMs: Math.round(performance.now() - start), auditEvent: { action: "INDEX_REINDEX_TRIGGERED" as never, resourceType: "Document", resourceId: documentId } };
      } catch (err) {
        return { ok: false, data: null, error: err instanceof Error ? err.message : "Reindexing failed", latencyMs: Math.round(performance.now() - start), auditEvent: null };
      }
    },
    requiredPermission: "documents:update",
    confirmationLevel: "medium",
  },
  {
    name: "approveQualityReview",
    description: "Approve or reject quality review results for a document",
    category: "processing",
    auditCategory: "processing",
    inputSchema: qualitySchema,
    handler: async (params: unknown, ctx: ToolContext): Promise<ToolResult> => {
      const { documentId, documentVersion, decision } = qualitySchema.parse(params);
      const start = performance.now();
      try {
        const result = await reviewDocumentQuality(ctx.tenantId, documentId, documentVersion ?? 1, { decision }, { tenantId: ctx.tenantId, actorId: ctx.actorId, actorEmail: ctx.actorEmail, actorRole: ctx.actorRole as BaseRole, traceId: ctx.traceId, requestId: ctx.requestId });
        return { ok: true, data: { documentId, decision, status: decision, review: result }, error: null, latencyMs: Math.round(performance.now() - start), auditEvent: { action: "QUALITY_REVIEWED" as never, resourceType: "DocumentQuality", resourceId: documentId } };
      } catch (err) {
        return { ok: false, data: null, error: err instanceof Error ? err.message : "Quality review failed", latencyMs: Math.round(performance.now() - start), auditEvent: null };
      }
    },
    requiredPermission: "documents:quality-review",
    confirmationLevel: "medium",
  },
  {
    name: "retryProcessing",
    description: "Retry failed OCR pages for a document",
    category: "processing",
    auditCategory: "processing",
    inputSchema: z.object({ documentId: z.string().min(1), pageNumbers: z.array(z.number().int().positive()).optional() }),
    handler: async (params: unknown, ctx: ToolContext): Promise<ToolResult> => {
      const { documentId, pageNumbers } = params as { documentId: string; pageNumbers?: number[] };
      const start = performance.now();
      try {
        const service = getDocService();
        const { document } = await service.getDocument(documentId, ctx.tenantId, { userId: ctx.actorId, email: ctx.actorEmail, role: ctx.actorRole as BaseRole });
        const result = await retryOcrPages(ctx.tenantId, documentId, document.version, { pageNumbers }, { tenantId: ctx.tenantId, actorId: ctx.actorId, actorEmail: ctx.actorEmail, actorRole: ctx.actorRole as BaseRole, traceId: ctx.traceId, requestId: ctx.requestId });
        return { ok: true, data: { documentId, jobId: result.jobId, status: "retry_enqueued" }, error: null, latencyMs: Math.round(performance.now() - start), auditEvent: { action: "OCR_RETRY_TRIGGERED" as never, resourceType: "Document", resourceId: documentId } };
      } catch (err) {
        return { ok: false, data: null, error: err instanceof Error ? err.message : "OCR retry failed", latencyMs: Math.round(performance.now() - start), auditEvent: null };
      }
    },
    requiredPermission: "documents:ocr-process",
    confirmationLevel: "medium",
  },
  {
    name: "startIndexGeneration",
    description: "Start AI search index generation for a document",
    category: "processing",
    auditCategory: "processing",
    inputSchema: z.object({ documentId: z.string().min(1) }),
    handler: async (params: unknown, ctx: ToolContext): Promise<ToolResult> => {
      const { documentId } = params as { documentId: string };
      const start = performance.now();
      try {
        const result = await startDocumentIndexing({
          tenantId: ctx.tenantId,
          actorId: ctx.actorId,
          documentId,
          indexInput: { triggeredBy: "REINDEX" },
        });
        return { ok: true, data: { documentId, generationId: result.generationId, generationNumber: result.generationNumber, status: "index_generation_started" }, error: null, latencyMs: Math.round(performance.now() - start), auditEvent: { action: "INDEX_GENERATION_STARTED" as never, resourceType: "Document", resourceId: documentId } };
      } catch (err) {
        return { ok: false, data: null, error: err instanceof Error ? err.message : "Index generation failed", latencyMs: Math.round(performance.now() - start), auditEvent: null };
      }
    },
    requiredPermission: "documents:update",
    confirmationLevel: "medium",
  },
];

const answerSchema = z.object({ question: z.string().min(1) });
const searchKbSchema = z.object({ query: z.string().min(1), limit: z.number().optional() });

const searchToolsList: CopilotTool[] = [
  {
    name: "answerQuestion",
    description: "Answer a question using the knowledge base",
    category: "search",
    auditCategory: "search",
    inputSchema: answerSchema,
    handler: async (params: unknown, ctx: ToolContext): Promise<ToolResult> => {
      const { question } = answerSchema.parse(params);
      const start = performance.now();
      try {
        const retrievalService = getCopilotRetrievalService();
        const result = await retrievalService.hybridSearch(
          { queryText: question, topK: 5 },
          await buildRetrievalAccessContext(ctx),
        );
        const answer = result.candidates.length > 0
          ? result.candidates.map((c, i) => `[${i + 1}] ${c.text}${c.documentTitle ? ` (— ${c.documentTitle})` : ""}`).join("\n\n")
          : "I couldn't find any relevant information in the knowledge base to answer this question.";
        return { ok: true, data: { question, answer, sources: result.candidates.length }, error: null, latencyMs: Math.round(performance.now() - start), auditEvent: null };
      } catch (err) {
        return { ok: false, data: null, error: err instanceof Error ? err.message : "Failed to answer question", latencyMs: Math.round(performance.now() - start), auditEvent: null };
      }
    },
    requiredPermission: "documents:use-in-ai",
    confirmationLevel: "safe",
  },
  {
    name: "searchKnowledge",
    description: "Search the knowledge base",
    category: "search",
    auditCategory: "search",
    inputSchema: searchKbSchema,
    handler: async (params: unknown, ctx: ToolContext): Promise<ToolResult> => {
      const { query, limit } = searchKbSchema.parse(params);
      const start = performance.now();
      try {
        const retrievalService = getCopilotRetrievalService();
        const result = await retrievalService.hybridSearch(
          { queryText: query, topK: limit ?? 10 },
          await buildRetrievalAccessContext(ctx),
        );
        const results = result.candidates.map((c) => ({
          chunkId: c.chunkId,
          documentId: c.documentId,
          text: c.text,
          score: c.score,
          documentTitle: c.documentTitle,
          pageNumber: c.pageNumber,
          sectionTitle: c.sectionTitle,
        }));
        return { ok: true, data: { query, results, total: result.totalCandidates }, error: null, latencyMs: Math.round(performance.now() - start), auditEvent: null };
      } catch (err) {
        return { ok: false, data: null, error: err instanceof Error ? err.message : "Search failed", latencyMs: Math.round(performance.now() - start), auditEvent: null };
      }
    },
    requiredPermission: "documents:read",
    confirmationLevel: "safe",
  },
];

const importSchema = z.object({ batchId: z.string().min(1) });

const adminToolsList: CopilotTool[] = [
  {
    name: "runImport",
    description: "Confirm and run an import batch",
    category: "admin",
    auditCategory: "admin",
    inputSchema: importSchema,
    handler: async (params: unknown, ctx: ToolContext): Promise<ToolResult> => {
      const { batchId } = importSchema.parse(params);
      const start = performance.now();
      try {
        const result = await ImportBatchService.confirmBatch(batchId, ctx.actorId);
        return { ok: true, data: { batchId, state: result.batch.state, status: "import_started" }, error: null, latencyMs: Math.round(performance.now() - start), auditEvent: { action: "PROCESSING_RUN_INITIATED" as never, resourceType: "Document", resourceId: batchId } };
      } catch (err) {
        return { ok: false, data: null, error: err instanceof Error ? err.message : "Import failed", latencyMs: Math.round(performance.now() - start), auditEvent: null };
      }
    },
    requiredPermission: "imports:create",
    confirmationLevel: "medium",
  },
  {
    name: "getSystemHealth",
    description: "Check system health status",
    category: "admin",
    auditCategory: "admin",
    inputSchema: z.object({}),
    handler: async (): Promise<ToolResult> => {
      const start = performance.now();
      try {
        const dbState = mongoose.connection.readyState;
        const dbStatus = dbState === 1 ? "connected" : dbState === 2 ? "connecting" : "disconnected";
        const redisStatus = (() => { try { return "unknown"; } catch { return "error"; } })();
        return {
          ok: true, data: {
            status: dbStatus === "connected" ? "healthy" : "degraded",
            uptime: process.uptime(),
            memory: process.memoryUsage().rss,
            database: dbStatus,
            redis: redisStatus,
            timestamp: new Date().toISOString(),
          }, error: null, latencyMs: Math.round(performance.now() - start), auditEvent: null,
        };
      } catch (err) {
        return { ok: false, data: null, error: err instanceof Error ? err.message : "Health check failed", latencyMs: Math.round(performance.now() - start), auditEvent: null };
      }
    },
    requiredPermission: null,
    confirmationLevel: "safe",
  },
];

export function registerDefaultTools(registry: CopilotToolRegistry): void {
  for (const tool of [...navigationTools, ...documentTools, ...userTools, ...processingTools, ...searchToolsList, ...adminToolsList]) {
    registry.register(tool);
  }
}
