/**
 * T18 — document_uploaded API trigger producer unit tests.
 *
 * Exercises `uploadDocument` (documents.service.ts) end-to-end with a FAKE
 * OutboxTriggerPort injected via `createDocumentServiceProviders` — no Mongo,
 * no Redis, no HTTP. Verifies:
 *   1. a successful upload publishes EXACTLY ONE `document_uploaded` envelope
 *      carrying fresh persisted-document state (id/title/classification), a
 *      dedupKey over the document id, the uploader as sole recipient, and a
 *      payload the T4 factory builder (`documentUploadedMetadataSchema`) can
 *      consume directly;
 *   2. a failed upload (quarantined file) publishes NOTHING;
 *   3. a throwing trigger port does NOT fail the upload (best-effort).
 */
import { describe, it, expect, vi } from "vitest";
import type {
  OutboxTriggerPort,
  TriggerEnvelope,
} from "../ports/outboxTrigger.port.js";
import { documentUploadedMetadataSchema } from "../factory/metadata.schemas.js";
import { createDocumentServiceProviders } from "../../documents/documents.service.js";
import {
  InMemoryStorageProvider,
  FakeSecurityScanner,
  RecordingProcessingDispatcher,
} from "../../../providers/storage/fakes.js";

// --- seams uploadDocument touches, faked so no DB/HTTP happens ---
vi.mock("../../documents/documents.repository.js", () => ({
  findDocumentByChecksum: vi.fn(async () => []),
}));

vi.mock("../../entitlement/entitlement-checks.js", () => ({
  checkUploadAllowed: vi.fn(async () => {}),
}));

vi.mock("../../../common/observability/index.js", () => ({
  getAuditWriter: () => ({ write: vi.fn(async () => undefined) }),
}));

// The upload path enforces DOCUMENTS_CREATE via authorizePermission. This unit
// test exercises the trigger producer, not the authorization boundary, so the
// permission check is faked at the module seam exactly like the other seams
// above; production enforcement itself is untouched.
vi.mock("../../permissions/permissions.authorization.js", () => ({
  authorizePermission: vi.fn(async () => ({ allowed: true })),
  authorizePermissionCapability: vi.fn(
    async () => ({ allowed: true, denialCode: null, scope: null, source: null }),
  ),
}));

vi.mock("../../documents/documentUpload.repository.js", () => ({
  createDocumentWithPrivatePolicy: vi.fn(
    async (documentData: {
      tenantId: { toString(): string };
      uploadedBy: { toString(): string };
      fileName: string;
      fileSize: number;
      mimeType: string;
      metadata: { title: string | null };
      classification: string;
      scanResult: { scanner: string; scannedAt: Date; result: string; details?: string | null };
    }) => ({
      _id: "doc-uploaded-1",
      tenantId: documentData.tenantId,
      uploadedBy: documentData.uploadedBy,
      owner: documentData.uploadedBy,
      fileName: documentData.fileName,
      fileSize: documentData.fileSize,
      mimeType: documentData.mimeType,
      status: "uploaded",
      metadata: documentData.metadata,
      department: null,
      classification: documentData.classification,
      scanResult: documentData.scanResult,
      checksum: "checksum",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    }),
  ),
}));

class FakeTriggerPort implements OutboxTriggerPort {
  public readonly envelopes: TriggerEnvelope[] = [];

  constructor(private readonly failOnPublish = false) {}

  async publishTrigger(event: TriggerEnvelope): Promise<void> {
    if (this.failOnPublish) {
      throw new Error("outbox unavailable");
    }
    this.envelopes.push(event);
  }
}

function makeFile(originalname: string, buffer: Buffer) {
  return {
    fieldname: "file",
    originalname,
    encoding: "7bit",
    mimetype: "application/pdf",
    buffer,
    size: buffer.length,
  };
}

function makeService(port: OutboxTriggerPort) {
  return createDocumentServiceProviders({
    storageProvider: new InMemoryStorageProvider(),
    securityScanner: new FakeSecurityScanner(),
    processingDispatcher: new RecordingProcessingDispatcher(),
    triggerPort: port,
  });
}

const ACTOR = { userId: "user-1", email: "admin@example.com", role: "COMPANY_ADMIN" } as const;

describe("document_uploaded trigger producer", () => {
  it("publishes exactly one document_uploaded envelope on successful upload", async () => {
    const port = new FakeTriggerPort();
    const service = makeService(port);

    const result = await service.uploadDocument(
      makeFile("annual-report-2024.pdf", Buffer.from("%PDF-1.4 fake content")),
      { title: "Annual Report 2024", description: "Q4 numbers", tags: ["finance"] },
      "tenant-1",
      ACTOR,
    );

    expect(result.document.id).toBe("doc-uploaded-1");
    expect(port.envelopes).toHaveLength(1);

    const envelope = port.envelopes[0];
    expect(envelope.type).toBe("document_uploaded");
    expect(envelope.tenantId).toBe("tenant-1");
    expect(envelope.actorId).toBe("user-1");
    expect(envelope.recipientUserIds).toEqual(["user-1"]);
    expect(envelope.eventId).toBeTruthy();
    expect(envelope.dedupKey).toMatch(/^document_uploaded:doc-uploaded-1:\d+$/);

    // Fresh persisted-document state (id/title/classification from the created
    // doc — not raw upload input), with the null department omitted.
    expect(envelope.payload.dedupEventId).toBe("doc-uploaded-1");
    expect(envelope.payload.source).toEqual({
      type: "document",
      id: "doc-uploaded-1",
      displayName: "Annual Report 2024",
    });
    expect(envelope.payload.metadata).toEqual({
      documentId: "doc-uploaded-1",
      documentTitle: "Annual Report 2024",
      classification: "internal",
    });

    // The payload must be directly consumable by the T4 factory builder.
    expect(documentUploadedMetadataSchema.safeParse(envelope.payload.metadata).success).toBe(true);
  });

  it("publishes nothing when the upload fails with a signature mismatch", async () => {
    const port = new FakeTriggerPort();
    const service = makeService(port);

    await expect(
      service.uploadDocument(
        makeFile("malicious.pdf", Buffer.from("evil bytes")),
        { title: "Malicious Doc" },
        "tenant-1",
        ACTOR,
      ),
    ).rejects.toThrow(/File contents do not match the declared file type/i);

    expect(port.envelopes).toHaveLength(0);
  });

  it("does not fail the upload when the trigger port throws", async () => {
    const port = new FakeTriggerPort(true);
    const service = makeService(port);

    const result = await service.uploadDocument(
      makeFile("report.pdf", Buffer.from("%PDF-1.4 ok")),
      { title: "Resilient Upload" },
      "tenant-1",
      ACTOR,
    );

    expect(result.document.id).toBe("doc-uploaded-1");
  });
});
