import { describe, it, expect, vi, beforeEach } from "vitest";

const mockListUsers = vi.fn();
const mockInviteUser = vi.fn();
const mockUpdateUser = vi.fn();
const mockResendInvitation = vi.fn();
const mockTriggerOcrProcessing = vi.fn();
const mockReviewDocumentQuality = vi.fn();
const mockTriggerMetadataAnalysis = vi.fn();
const mockRetryOcrPages = vi.fn();
const mockStartDocumentIndexing = vi.fn();

vi.mock("../../users/users.service.js", () => ({
  listUsers: (...args: unknown[]) => mockListUsers(...args),
  inviteUser: (...args: unknown[]) => mockInviteUser(...args),
  updateUser: (...args: unknown[]) => mockUpdateUser(...args),
  resendInvitation: (...args: unknown[]) => mockResendInvitation(...args),
}));

vi.mock("../../processing/processing.service.js", () => ({
  triggerOcrProcessing: (...args: unknown[]) => mockTriggerOcrProcessing(...args),
  reviewDocumentQuality: (...args: unknown[]) => mockReviewDocumentQuality(...args),
  triggerMetadataAnalysis: (...args: unknown[]) => mockTriggerMetadataAnalysis(...args),
  retryOcrPages: (...args: unknown[]) => mockRetryOcrPages(...args),
}));

vi.mock("../../processing/indexing/indexing.service.js", () => ({
  startDocumentIndexing: (...args: unknown[]) => mockStartDocumentIndexing(...args),
}));

vi.mock("../../../config/index.js", () => ({
  config: {},
}));

vi.mock("../../documents/documents.service.js", () => ({
  createDocumentServiceProviders: () => ({
    updateDocumentMetadata: vi.fn().mockResolvedValue({
      document: { metadata: { title: "Renamed Doc" } },
    }),
    getDocument: vi.fn().mockResolvedValue({
      document: { version: 3 },
    }),
  }),
}));

vi.mock("../../imports/imports.service.js", () => ({
  triggerImport: vi.fn().mockResolvedValue({ batchId: "batch-1" }),
}));

vi.mock("../../../common/health/metrics.js", () => ({
  getMetricsRegistry: () => ({
    metric: () => ({ inc: () => {}, observe: () => {}, set: () => {} }),
    validate: () => {},
  }),
}));

import { CopilotToolRegistry } from "../tools/toolRegistry.js";
import { registerDefaultTools } from "../tools/registerTools.js";
import type { ToolContext } from "../copilot.types.js";

const context: ToolContext = {
  tenantId: "tenant-1",
  actorId: "actor-1",
  actorEmail: "admin@iti.com",
  actorRole: "COMPANY_ADMIN",
  traceId: "trace-1",
  requestId: "req-1",
};

async function runTool(name: string, params: unknown) {
  const registry = new CopilotToolRegistry();
  registerDefaultTools(registry);
  const tool = registry.get(name);
  expect(tool).toBeDefined();
  return tool!.handler(params as never, context);
}

describe("registerCopilotTools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers the expected tool set without the runCampaign stub", () => {
    const registry = new CopilotToolRegistry();
    registerDefaultTools(registry);
    const names = registry.list().map((t) => t.name).sort();
    expect(names).toContain("renameDocument");
    expect(names).toContain("resendInvitation");
    expect(names).toContain("retryProcessing");
    expect(names).toContain("startIndexGeneration");
    expect(names).not.toContain("runCampaign");
    for (const tool of registry.list()) {
      expect(tool.auditCategory).toBeDefined();
      if (tool.retries !== undefined) {
        expect(tool.retries).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("renameDocument updates metadata and returns the new title", async () => {
    mockResendInvitation.mockResolvedValue({});
    const result = await runTool("renameDocument", { documentId: "doc-1", title: "Renamed Doc" });
    expect(result.ok).toBe(true);
    expect(result.data).toMatchObject({ documentId: "doc-1", title: "Renamed Doc" });
    expect(result.auditEvent?.action).toBe("DOCUMENT_METADATA_UPDATED");
  });

  it("resendInvitation delegates to the users service", async () => {
    mockResendInvitation.mockResolvedValue({ user: { email: "guest@iti.com" } });
    const result = await runTool("resendInvitation", { userId: "user-9" });
    expect(result.ok).toBe(true);
    expect(result.data).toMatchObject({ userId: "user-9", status: "invitation_resent" });
    expect(mockResendInvitation).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-1", actorId: "actor-1" }),
      "user-9",
    );
  });

  it("retryProcessing enqueues an OCR retry job", async () => {
    mockRetryOcrPages.mockResolvedValue({ jobId: "job-42" });
    const result = await runTool("retryProcessing", { documentId: "doc-1", pageNumbers: [1, 2] });
    expect(result.ok).toBe(true);
    expect(result.data).toMatchObject({ documentId: "doc-1", jobId: "job-42", status: "retry_enqueued" });
    expect(mockRetryOcrPages).toHaveBeenCalledWith(
      "tenant-1",
      "doc-1",
      3,
      { pageNumbers: [1, 2] },
      expect.objectContaining({ tenantId: "tenant-1", actorId: "actor-1" }),
    );
  });

  it("startIndexGeneration delegates to the indexing service", async () => {
    mockStartDocumentIndexing.mockResolvedValue({
      generationId: "gen-1",
      generationNumber: 4,
      status: "queued",
      traceId: "trace-1",
    });
    const result = await runTool("startIndexGeneration", { documentId: "doc-1" });
    expect(result.ok).toBe(true);
    expect(result.data).toMatchObject({ documentId: "doc-1", generationId: "gen-1", generationNumber: 4 });
    expect(mockStartDocumentIndexing).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      actorId: "actor-1",
      documentId: "doc-1",
      indexInput: { triggeredBy: "REINDEX" },
    });
  });

  it("returns a failed result when a tool throws", async () => {
    mockResendInvitation.mockRejectedValue(new Error("Invite limit reached"));
    const result = await runTool("resendInvitation", { userId: "user-9" });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("Invite limit reached");
  });
});
