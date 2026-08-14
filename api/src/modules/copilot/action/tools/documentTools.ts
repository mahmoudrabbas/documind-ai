import { z } from "zod";
import { Permission } from "../../../permissions/permissions.catalog.js";
import type { RegisteredTool, ToolSchema, RunContext } from "../../../agents/agents.types.js";
import type { AgentRunContext } from "../../../agents/agentRunContext.js";
import { assertNoTrustedContextFields, resolveTrustedActor } from "../../../agents/tools/authorizedRetrievalTools.js";
import { createDocumentServiceProviders } from "../../../documents/documents.service.js";
import type { StorageProvider, SecurityScanner, ProcessingDispatcher } from "../../../../providers/storage/types.js";
import { getDocumentAccessAuthorizationService, type DocumentAccessAuthorizationService } from "../../../document-access/documentAccess.authorization.service.js";

function withActorContext<T>(
  handler: (context: AgentRunContext, input: unknown) => Promise<T>
): (context: RunContext, input: unknown) => Promise<T> {
  return async (context: RunContext, input: unknown) => {
    return handler(context as AgentRunContext, input);
  }
}

function getActorDeps(): { authorization: DocumentAccessAuthorizationService } {
  return { authorization: getDocumentAccessAuthorizationService() };
}

export function createDocumentSearchTool(deps: {
  storageProvider: StorageProvider;
  securityScanner: SecurityScanner;
  processingDispatcher: ProcessingDispatcher;
}): RegisteredTool {
  const service = createDocumentServiceProviders(deps);
  const actorDeps = getActorDeps();

  const schema: ToolSchema = {
    name: "document.search",
    version: "1.0.0",
    description: "Search documents within the tenant",
    inputSchema: z.object({
      search: z.string().trim().min(1).max(256).optional(),
      page: z.number().int().positive().default(1),
      pageSize: z.number().int().positive().max(100).default(20),
      isArchived: z.boolean().optional(),
      category: z.string().trim().max(128).optional(),
      classification: z.string().trim().max(128).optional(),
    }),
    outputSchema: z.object({
      documents: z.array(z.object({
        id: z.string(),
        fileName: z.string(),
        fileSize: z.number(),
        mimeType: z.string(),
        status: z.string(),
        metadata: z.object({
          title: z.string().nullable(),
          description: z.string().nullable(),
          tags: z.array(z.string()),
        }),
        category: z.string().nullable(),
        classification: z.string(),
        isArchived: z.boolean(),
        createdAt: z.string(),
      })),
      pagination: z.object({
        page: z.number(),
        pageSize: z.number(),
        totalPages: z.number(),
        totalRecords: z.number(),
      }),
    }),
    requiredPermission: Permission.DOCUMENTS_READ,
    approvalRequired: false,
    timeoutMs: 10000,
  };

  return {
    schema,
    handler: withActorContext(async (context: AgentRunContext, input: unknown) => {
      assertNoTrustedContextFields(input, "document.search");
      const { actorId } = await resolveTrustedActor(context, actorDeps);
      return service.listDocuments(input, context.tenantId, {
        userId: actorId,
        email: context.actorEmail ?? "",
        role: context.actorRole,
      });
    }),
  };
}

export function createDocumentGetTool(deps: {
  storageProvider: StorageProvider;
  securityScanner: SecurityScanner;
  processingDispatcher: ProcessingDispatcher;
}): RegisteredTool {
  const service = createDocumentServiceProviders(deps);
  const actorDeps = getActorDeps();

  const schema: ToolSchema = {
    name: "document.get",
    version: "1.0.0",
    description: "Get a document by ID",
    inputSchema: z.object({
      documentId: z.string().trim().min(1).max(64),
    }),
    outputSchema: z.object({
      document: z.object({
        id: z.string(),
        fileName: z.string(),
        fileSize: z.number(),
        mimeType: z.string(),
        status: z.string(),
        metadata: z.object({
          title: z.string().nullable(),
          description: z.string().nullable(),
          tags: z.array(z.string()),
        }),
        category: z.string().nullable(),
        department: z.string().nullable(),
        classification: z.string(),
        isArchived: z.boolean(),
        archivedAt: z.string().nullable(),
        deletedAt: z.string().nullable(),
        version: z.number(),
        versionLabel: z.string(),
        createdAt: z.string(),
        updatedAt: z.string(),
      }),
    }),
    requiredPermission: Permission.DOCUMENTS_READ,
    approvalRequired: false,
    timeoutMs: 10000,
  };

  return {
    schema,
    handler: withActorContext(async (context: AgentRunContext, input: unknown) => {
      assertNoTrustedContextFields(input, "document.get");
      const { actorId } = await resolveTrustedActor(context, actorDeps);
      const { documentId } = z.object({ documentId: z.string() }).parse(input);
      return service.getDocument(documentId, context.tenantId, {
        userId: actorId,
        email: context.actorEmail ?? "",
        role: context.actorRole,
      });
    }),
  };
}

export function createDocumentUpdateMetadataTool(deps: {
  storageProvider: StorageProvider;
  securityScanner: SecurityScanner;
  processingDispatcher: ProcessingDispatcher;
}): RegisteredTool {
  const service = createDocumentServiceProviders(deps);
  const actorDeps = getActorDeps();

  const schema: ToolSchema = {
    name: "document.updateMetadata",
    version: "1.0.0",
    description: "Update document metadata (title, description, tags, category, classification)",
    inputSchema: z.object({
      documentId: z.string().trim().min(1).max(64),
      title: z.string().trim().min(1).max(256).optional(),
      description: z.string().trim().max(2048).optional(),
      tags: z.array(z.string().trim().max(64)).max(20).optional(),
      category: z.string().trim().max(128).optional(),
      department: z.string().trim().max(128).optional(),
      classification: z.enum(["internal", "restricted", "confidential", "highly_confidential"]).optional(),
    }),
    outputSchema: z.object({
      document: z.object({
        id: z.string(),
        metadata: z.object({
          title: z.string().nullable(),
          description: z.string().nullable(),
          tags: z.array(z.string()),
        }),
        category: z.string().nullable(),
        department: z.string().nullable(),
        classification: z.string(),
      }),
    }),
    requiredPermission: Permission.DOCUMENTS_UPDATE,
    approvalRequired: false,
    timeoutMs: 10000,
  };

  return {
    schema,
    handler: withActorContext(async (context: AgentRunContext, input: unknown) => {
      assertNoTrustedContextFields(input, "document.updateMetadata");
      const { actorId } = await resolveTrustedActor(context, actorDeps);
      const { documentId, ...metadata } = z.object({
        documentId: z.string(),
        title: z.string().optional(),
        description: z.string().optional(),
        tags: z.array(z.string()).optional(),
        category: z.string().optional(),
        department: z.string().optional(),
        classification: z.enum(["internal", "restricted", "confidential", "highly_confidential"]).optional(),
      }).parse(input);
      return service.updateDocumentMetadata(documentId, metadata, context.tenantId, {
        userId: actorId,
        email: context.actorEmail ?? "",
        role: context.actorRole,
      });
    }),
  };
}

export function createDocumentArchiveTool(deps: {
  storageProvider: StorageProvider;
  securityScanner: SecurityScanner;
  processingDispatcher: ProcessingDispatcher;
}): RegisteredTool {
  const service = createDocumentServiceProviders(deps);
  const actorDeps = getActorDeps();

  const schema: ToolSchema = {
    name: "document.archive",
    version: "1.0.0",
    description: "Archive a document (soft hide from active list)",
    inputSchema: z.object({
      documentId: z.string().trim().min(1).max(64),
    }),
    outputSchema: z.object({
      document: z.object({
        id: z.string(),
        isArchived: z.boolean(),
        archivedAt: z.string().nullable(),
      }),
    }),
    requiredPermission: Permission.DOCUMENTS_ARCHIVE,
    approvalRequired: false,
    timeoutMs: 10000,
  };

  return {
    schema,
    handler: withActorContext(async (context: AgentRunContext, input: unknown) => {
      assertNoTrustedContextFields(input, "document.archive");
      const { actorId } = await resolveTrustedActor(context, actorDeps);
      const { documentId } = z.object({ documentId: z.string() }).parse(input);
      return service.archiveDocument(documentId, context.tenantId, {
        userId: actorId,
        email: context.actorEmail ?? "",
        role: context.actorRole,
      });
    }),
  };
}

export function createDocumentRestoreTool(deps: {
  storageProvider: StorageProvider;
  securityScanner: SecurityScanner;
  processingDispatcher: ProcessingDispatcher;
}): RegisteredTool {
  const service = createDocumentServiceProviders(deps);
  const actorDeps = getActorDeps();

  const schema: ToolSchema = {
    name: "document.restore",
    version: "1.0.0",
    description: "Restore an archived document to active list",
    inputSchema: z.object({
      documentId: z.string().trim().min(1).max(64),
    }),
    outputSchema: z.object({
      document: z.object({
        id: z.string(),
        isArchived: z.boolean(),
        archivedAt: z.string().nullable(),
      }),
    }),
    requiredPermission: Permission.DOCUMENTS_ARCHIVE,
    approvalRequired: false,
    timeoutMs: 10000,
  };

  return {
    schema,
    handler: withActorContext(async (context: AgentRunContext, input: unknown) => {
      assertNoTrustedContextFields(input, "document.restore");
      const { actorId } = await resolveTrustedActor(context, actorDeps);
      const { documentId } = z.object({ documentId: z.string() }).parse(input);
      return service.restoreDocument(documentId, context.tenantId, {
        userId: actorId,
        email: context.actorEmail ?? "",
        role: context.actorRole,
      });
    }),
  };
}

export function createDocumentSoftDeleteTool(deps: {
  storageProvider: StorageProvider;
  securityScanner: SecurityScanner;
  processingDispatcher: ProcessingDispatcher;
}): RegisteredTool {
  const service = createDocumentServiceProviders(deps);
  const actorDeps = getActorDeps();

  const schema: ToolSchema = {
    name: "document.softDelete",
    version: "1.0.0",
    description: "Move a document to trash (soft delete)",
    inputSchema: z.object({
      documentId: z.string().trim().min(1).max(64),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
    }),
    requiredPermission: Permission.DOCUMENTS_DELETE,
    approvalRequired: true,
    timeoutMs: 10000,
  };

  return {
    schema,
    handler: withActorContext(async (context: AgentRunContext, input: unknown) => {
      assertNoTrustedContextFields(input, "document.softDelete");
      const { actorId } = await resolveTrustedActor(context, actorDeps);
      const { documentId } = z.object({ documentId: z.string() }).parse(input);
      await service.softDeleteDocument(documentId, context.tenantId, {
        userId: actorId,
        email: context.actorEmail ?? "",
        role: context.actorRole,
      });
      return { success: true, message: "Document moved to trash" };
    }),
  };
}

export function createDocumentPermanentDeleteTool(deps: {
  storageProvider: StorageProvider;
  securityScanner: SecurityScanner;
  processingDispatcher: ProcessingDispatcher;
}): RegisteredTool {
  const service = createDocumentServiceProviders(deps);
  const actorDeps = getActorDeps();

  const schema: ToolSchema = {
    name: "document.permanentDelete",
    version: "1.0.0",
    description: "Permanently delete a document (irreversible, must be soft-deleted first)",
    inputSchema: z.object({
      documentId: z.string().trim().min(1).max(64),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
    }),
    requiredPermission: Permission.DOCUMENTS_DELETE,
    approvalRequired: true,
    timeoutMs: 10000,
  };

  return {
    schema,
    handler: withActorContext(async (context: AgentRunContext, input: unknown) => {
      assertNoTrustedContextFields(input, "document.permanentDelete");
      const { actorId } = await resolveTrustedActor(context, actorDeps);
      const { documentId } = z.object({ documentId: z.string() }).parse(input);
      await service.permanentDeleteDocument(documentId, context.tenantId, {
        userId: actorId,
        email: context.actorEmail ?? "",
        role: context.actorRole,
      });
      return { success: true, message: "Document permanently deleted" };
    }),
  };
}