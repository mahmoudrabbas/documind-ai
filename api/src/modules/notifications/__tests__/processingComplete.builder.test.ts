/**
 * processing_complete builder unit tests (T18).
 *
 * Pure unit tests (no Mongo, no timers): payload shape, dedup key, default
 * recipients (the uploader/owner rides via metadata.recipients.userIds — the
 * RecipientResolver's fallback path), strict metadata validation, and the
 * generic factory guardrails (well-formed draft, allowlisted action URLs).
 */
import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  createNotificationDraft,
  type NotificationDraft,
  type NotificationEvent,
} from "../factory/factory.js";
import { isActionUrlAllowed } from "../factory/sanitize.js";
import { processingCompleteBuilder } from "../factory/builders/processingComplete.builder.js";
import { processingCompleteMetadataSchema } from "../factory/metadata.schemas.js";

const UPLOADER_USER_ID = "user_uploader_42";

function processingCompleteEvent(
  overrides: Partial<NotificationEvent> = {},
): NotificationEvent {
  return {
    type: "processing_complete",
    metadata: {
      documentId: "doc_123",
      version: 2,
      outcome: "success",
      completedAt: "2026-08-01T12:00:00.000Z",
    },
    actorId: "system",
    traceIds: { traceId: "t-1", correlationId: "c-1", causationId: "cau-1" },
    dedupEventId: "doc_123",
    deduplicatedAt: new Date("2026-08-01T12:00:00.000Z"),
    source: { type: "processing", id: "proc_1", displayName: "Indexing Pipeline" },
    ...overrides,
  };
}

/** Assert every guardrail that must hold for ANY draft (mirrors factory.test.ts). */
function expectWellFormedDraft(draft: NotificationDraft): void {
  expect(draft.title.en.length).toBeGreaterThan(0);
  expect(draft.title.ar.length).toBeGreaterThan(0);
  expect(draft.body.en.length).toBeGreaterThan(0);
  expect(draft.body.ar.length).toBeGreaterThan(0);
  expect(draft.dedupEventId.length).toBeGreaterThan(0);
  expect(draft.version).toBe(1);
  expect(draft.actions.length).toBeLessThanOrEqual(4);
  for (const action of draft.actions) {
    expect(isActionUrlAllowed(action.url)).toBe(true);
  }
}

describe("processing_complete builder (T18)", () => {
  describe("payload shape", () => {
    it("builds a valid draft: category documents, priority normal, View action, actorId system", () => {
      const draft = createNotificationDraft(processingCompleteEvent());

      expect(draft.type).toBe("processing_complete");
      expect(draft.category).toBe("documents");
      expect(draft.priority).toBe("normal");
      expect(draft.actorId).toBe("system");

      // Metadata preserved verbatim: documentId, version, outcome, completedAt.
      expect(draft.metadata).toEqual({
        documentId: "doc_123",
        version: 2,
        outcome: "success",
        completedAt: "2026-08-01T12:00:00.000Z",
      });

      // GET /documents/:id (View) — documents.routes.ts.
      const urls = draft.actions.map((a) => a.url);
      expect(urls).toEqual(["/documents/doc_123"]);
      expect(draft.actions[0]?.method).toBe("GET");
      expect(draft.actions[0]?.label.en).toBe("View document");
      expect(draft.actions[0]?.label.ar.length).toBeGreaterThan(0);

      // Envelope passthrough.
      expect(draft.traceIds).toEqual({
        traceId: "t-1",
        correlationId: "c-1",
        causationId: "cau-1",
      });
      expect(draft.source).toEqual({
        type: "processing",
        id: "proc_1",
        displayName: "Indexing Pipeline",
      });

      expectWellFormedDraft(draft);
    });

    it("populates bilingual title and body for both locales", () => {
      const draft = processingCompleteBuilder.build(processingCompleteEvent());
      expect(draft.title.en).toBe("Document processing complete");
      expect(draft.title.ar.length).toBeGreaterThan(0);
      expect(draft.body.en).toContain("finished processing");
      expect(draft.body.ar.length).toBeGreaterThan(0);
    });
  });

  describe("dedup key", () => {
    it("falls back to documentId when the event carries no dedupEventId", () => {
      const draft = createNotificationDraft(
        processingCompleteEvent({ dedupEventId: undefined }),
      );
      expect(draft.dedupEventId).toBe("doc_123");
    });

    it("prefers the event's explicit dedupEventId (per-version keys supported)", () => {
      const draft = createNotificationDraft(
        processingCompleteEvent({ dedupEventId: "doc_123:v2" }),
      );
      expect(draft.dedupEventId).toBe("doc_123:v2");
    });
  });

  describe("default recipients (uploader/document owner)", () => {
    it("carries the uploader via metadata.recipients.userIds for the RecipientResolver", () => {
      const draft = createNotificationDraft(
        processingCompleteEvent({
          metadata: {
            documentId: "doc_123",
            version: 2,
            outcome: "success",
            completedAt: "2026-08-01T12:00:00.000Z",
            recipients: { userIds: [UPLOADER_USER_ID] },
          },
        }),
      );
      expect(draft.metadata).toEqual({
        documentId: "doc_123",
        version: 2,
        outcome: "success",
        completedAt: "2026-08-01T12:00:00.000Z",
        recipients: { userIds: [UPLOADER_USER_ID] },
      });
      const recipients = draft.metadata.recipients as { userIds: string[] } | undefined;
      expect(recipients?.userIds).toEqual([UPLOADER_USER_ID]);
      expectWellFormedDraft(draft);
    });

    it("omits recipients when the event metadata carries no default-recipient override", () => {
      const draft = createNotificationDraft(processingCompleteEvent());
      expect("recipients" in (draft.metadata as Record<string, unknown>)).toBe(false);
    });
  });

  describe("strict metadata validation", () => {
    it("rejects an unknown metadata key (zod strict)", () => {
      const event = processingCompleteEvent({
        metadata: {
          documentId: "doc_123",
          version: 2,
          outcome: "success",
          completedAt: "2026-08-01T12:00:00.000Z",
          evilExtraKey: "nope",
        },
      });
      expect(() => processingCompleteMetadataSchema.parse(event.metadata)).toThrow(z.ZodError);
      expect(() => createNotificationDraft(event)).toThrow(z.ZodError);
    });

    it("rejects a non-success outcome", () => {
      expect(
        processingCompleteMetadataSchema.safeParse({
          documentId: "doc_123",
          version: 2,
          outcome: "failed",
          completedAt: "2026-08-01T12:00:00.000Z",
        }).success,
      ).toBe(false);
    });

    it("rejects a missing completedAt timestamp", () => {
      expect(
        processingCompleteMetadataSchema.safeParse({
          documentId: "doc_123",
          version: 2,
          outcome: "success",
        }).success,
      ).toBe(false);
    });

    it("rejects a non-positive version", () => {
      expect(
        processingCompleteMetadataSchema.safeParse({
          documentId: "doc_123",
          version: 0,
          outcome: "success",
          completedAt: "2026-08-01T12:00:00.000Z",
        }).success,
      ).toBe(false);
    });
  });
});
