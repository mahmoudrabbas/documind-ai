import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  createNotificationDraft,
  builderRegistry,
  type NotificationDraft,
  type NotificationEvent,
} from "../factory/factory.js";
import {
  NotificationFactoryError,
  assertActionUrlAllowed,
  assertMetadataSize,
  escapeHtml,
  isActionUrlAllowed,
  resolveLocalized,
  MAX_TITLE_LENGTH,
} from "../factory/sanitize.js";
import {
  processingFailedMetadataSchema,
  quotaExceededMetadataSchema,
  knowledgeGapMetadataSchema,
  invitationAcceptedMetadataSchema,
  welcomeMetadataSchema,
  roleChangedMetadataSchema,
  documentUploadedMetadataSchema,
} from "../factory/metadata.schemas.js";

const METADATA_SCHEMAS = [
  processingFailedMetadataSchema,
  quotaExceededMetadataSchema,
  knowledgeGapMetadataSchema,
  invitationAcceptedMetadataSchema,
  welcomeMetadataSchema,
  roleChangedMetadataSchema,
  documentUploadedMetadataSchema,
];

function processingFailedEvent(
  overrides: Partial<NotificationEvent> = {},
): NotificationEvent {
  return {
    type: "processing_failed",
    metadata: {
      documentId: "doc_123",
      documentTitle: "Quarterly Report",
      errorCode: "OCR_TIMEOUT",
      stage: "ocr",
      retryable: true,
    },
    actorId: "user_1",
    traceIds: { traceId: "t-1", correlationId: "c-1", causationId: "cau-1" },
    dedupEventId: "doc_123",
    deduplicatedAt: new Date("2026-07-30T12:00:00.000Z"),
    source: { type: "processing", id: "proc_1", displayName: "OCR Pipeline" },
    ...overrides,
  };
}

/** Assert every guardrail that must hold for ANY draft. */
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

describe("notification factory (T4)", () => {
  describe("createNotificationDraft — processing_failed", () => {
    it("builds a valid draft: category documents, priority normal, actions with the VERIFIED retry URL", () => {
      const draft = createNotificationDraft(processingFailedEvent());

      expect(draft.type).toBe("processing_failed");
      expect(draft.category).toBe("documents");
      expect(draft.priority).toBe("normal");
      expect(draft.dedupEventId).toBe("doc_123");

      const urls = draft.actions.map((a) => a.url);
      // POST /documents/:id/ocr/retry — verified at processing.routes.ts:94,
      // mounted under /documents (app.ts:184).
      expect(urls).toContain("/documents/doc_123/ocr/retry");
      // GET /documents/:id (View) — documents.routes.ts.
      expect(urls).toContain("/documents/doc_123");

      const retry = draft.actions.find((a) => a.method === "POST");
      expect(retry?.url).toBe("/documents/doc_123/ocr/retry");
      expect(retry?.label.en).toBe("Retry");
      expect(retry?.label.ar.length).toBeGreaterThan(0);

      expectWellFormedDraft(draft);
    });

    it("maps indexing-stage failures to the verified /documents/:id/index/retry endpoint", () => {
      const draft = createNotificationDraft(
        processingFailedEvent({
          metadata: {
            documentId: "doc_123",
            documentTitle: "Annual Report",
            errorCode: "EMBED_ERROR",
            stage: "embed",
            retryable: true,
          },
        }),
      );

      const retry = draft.actions.find((a) => a.method === "POST");
      // POST /documents/:id/index/retry — verified at indexing.routes.ts:33
      // (router.use'd by processing.routes.ts:32 → same /documents mount).
      expect(retry?.url).toBe("/documents/doc_123/index/retry");
      expect(draft.actions.map((a) => a.url)).not.toContain("/documents/doc_123/ocr/retry");
    });

    it("escapes HTML in user-derived documentTitle (XSS attempt sanitized)", () => {
      const draft = createNotificationDraft(
        processingFailedEvent({
          metadata: {
            documentId: "doc_123",
            documentTitle: '<script>alert("1")</script>',
            errorCode: "OCR_TIMEOUT",
            stage: "ocr",
            retryable: true,
          },
        }),
      );

      expect(draft.body.en).toContain("&lt;script&gt;");
      expect(draft.body.en).not.toContain("<script>");
      expect(draft.body.ar).not.toContain("<script>");
    });

    it("rejects metadata with an unknown key (zod strict)", () => {
      const event = processingFailedEvent({
        metadata: {
          documentId: "doc_123",
          documentTitle: "Report",
          errorCode: "E1",
          stage: "ocr",
          retryable: true,
          evilExtraKey: "nope",
        },
      });

      let caught: unknown;
      try {
        createNotificationDraft(event);
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(z.ZodError);
    });

    it("rejects a title longer than 256 characters with a typed size error", () => {
      const event = processingFailedEvent({ title: { en: "x".repeat(MAX_TITLE_LENGTH + 1) } });

      let caught: unknown;
      try {
        createNotificationDraft(event);
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(NotificationFactoryError);
      expect((caught as NotificationFactoryError).code).toBe("SIZE_LIMIT");
    });

    it("applies the T1 locale fallback: en-only source string → ar key equals the en string", () => {
      const draft = createNotificationDraft(
        processingFailedEvent({ body: { en: "Only English source text" } }),
      );

      expect(draft.body.en).toBe("Only English source text");
      expect(draft.body.ar).toBe("Only English source text");
    });

    it("fails when BOTH locales are missing for a source segment (factory error)", () => {
      const event = processingFailedEvent({ body: {} });

      let caught: unknown;
      try {
        createNotificationDraft(event);
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(NotificationFactoryError);
      expect((caught as NotificationFactoryError).code).toBe("LOCALE_FALLBACK");
    });
  });

  describe("createNotificationDraft — all 7 builders happy paths", () => {
    it("quota_exceeded → billing, no actions", () => {
      const draft = createNotificationDraft({
        type: "quota_exceeded",
        metadata: {
          quotaType: "ocrPagesPerMonth",
          limit: 100,
          usage: 100,
          resetAt: "2026-08-01T00:00:00.000Z",
        },
        actorId: "user_1",
        dedupEventId: "ocrPagesPerMonth",
      });

      expect(draft.category).toBe("billing");
      expect(draft.priority).toBe("high");
      expect(draft.actions).toEqual([]);
      expectWellFormedDraft(draft);
    });

    it("knowledge_gap_created → knowledge, no actions", () => {
      const draft = createNotificationDraft({
        type: "knowledge_gap_created",
        metadata: {
          topic: "How do I submit expenses?",
          severity: "high",
          questionPreview: "How do I submit expenses?",
        },
        actorId: "user_1",
        dedupEventId: "gap_42",
      });

      expect(draft.category).toBe("knowledge");
      expect(draft.priority).toBe("normal");
      expect(draft.actions).toEqual([]);
      expectWellFormedDraft(draft);
    });

    it("invitation_accepted → workflow/normal, no actions", () => {
      const draft = createNotificationDraft({
        type: "invitation_accepted",
        metadata: { inviteeUserId: "user_77", inviteeName: "Sara Ali" },
        actorId: "user_77",
        dedupEventId: "user_77",
      });

      expect(draft.category).toBe("workflow");
      expect(draft.priority).toBe("normal");
      expect(draft.actions).toEqual([]);
      expect(draft.dedupEventId).toBe("user_77");
      expectWellFormedDraft(draft);
    });

    it("welcome → workflow/low, no actions", () => {
      const draft = createNotificationDraft({
        type: "welcome",
        metadata: { companyName: "Acme Corp" },
        actorId: "user_77",
        dedupEventId: "user_77",
      });

      expect(draft.category).toBe("workflow");
      expect(draft.priority).toBe("low");
      expect(draft.actions).toEqual([]);
      expectWellFormedDraft(draft);
    });

    it("role_changed → workflow/normal, no actions", () => {
      const draft = createNotificationDraft({
        type: "role_changed",
        metadata: {
          roleType: "custom",
          action: "assigned",
          roleName: "HR Manager",
          beforeRole: undefined,
          afterRole: "HR Manager",
        },
        actorId: "user_5",
        dedupEventId: "user_5",
      });

      expect(draft.category).toBe("workflow");
      expect(draft.priority).toBe("normal");
      expect(draft.actions).toEqual([]);
      expectWellFormedDraft(draft);
    });

    it("document_uploaded → documents/normal, View action allowlisted", () => {
      const draft = createNotificationDraft({
        type: "document_uploaded",
        metadata: {
          documentId: "doc_9",
          documentTitle: "SOP - Onboarding",
          department: "HR",
          classification: "restricted",
        },
        actorId: "user_1",
        dedupEventId: "doc_9",
      });

      expect(draft.category).toBe("documents");
      expect(draft.priority).toBe("normal");
      expect(draft.actions.map((a) => a.url)).toEqual(["/documents/doc_9"]);
      expectWellFormedDraft(draft);
    });
  });

  describe("factory core — pure registry lookup (OCP)", () => {
    it("exposes a builder for every round-9 type and none for processing_complete", () => {
      expect(builderRegistry.processing_failed).toBeDefined();
      expect(builderRegistry.quota_exceeded).toBeDefined();
      expect(builderRegistry.knowledge_gap_created).toBeDefined();
      expect(builderRegistry.invitation_accepted).toBeDefined();
      expect(builderRegistry.welcome).toBeDefined();
      expect(builderRegistry.role_changed).toBeDefined();
      expect(builderRegistry.document_uploaded).toBeDefined();
      expect(builderRegistry.processing_complete).toBeUndefined();
    });

    it("throws a typed UNKNOWN_TYPE error for an unregistered type", () => {
      let caught: unknown;
      try {
        createNotificationDraft({ type: "processing_complete", metadata: {} });
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(NotificationFactoryError);
      expect((caught as NotificationFactoryError).code).toBe("UNKNOWN_TYPE");
    });

    it("each builder's draft carries the builder's own type (no cross-drafting)", () => {
      const cases: Array<{
        type: NotificationEvent["type"];
        metadata: Record<string, unknown>;
        dedupEventId?: string;
      }> = [
        {
          type: "processing_failed",
          metadata: {
            documentId: "d1",
            documentTitle: "T",
            errorCode: "E",
            stage: "ocr",
            retryable: true,
          },
        },
        {
          type: "quota_exceeded",
          metadata: { quotaType: "documents", limit: 5, usage: 5, resetAt: "2026-08-01T00:00:00.000Z" },
        },
        {
          type: "knowledge_gap_created",
          metadata: { topic: "T", severity: "low", questionPreview: "Q" },
        },
        { type: "invitation_accepted", metadata: { inviteeUserId: "u", inviteeName: "N" } },
        { type: "welcome", metadata: { companyName: "C" }, dedupEventId: "u" },
        {
          type: "role_changed",
          metadata: { roleType: "base", action: "changed", roleName: "EMPLOYEE" },
          dedupEventId: "u",
        },
        { type: "document_uploaded", metadata: { documentId: "d", documentTitle: "T" } },
      ];
      for (const testCase of cases) {
        const draft = createNotificationDraft({
          type: testCase.type,
          metadata: testCase.metadata,
          ...(testCase.dedupEventId ? { dedupEventId: testCase.dedupEventId } : {}),
        });
        expect(draft.type).toBe(testCase.type);
      }
    });
  });

  describe("metadata schemas — strict (reject unknown keys)", () => {
    const validInputs: Array<Record<string, unknown>> = [
      {
        documentId: "doc_1",
        documentTitle: "Report",
        errorCode: "E1",
        stage: "ocr",
        retryable: true,
      },
      { quotaType: "documents", limit: 10, usage: 3, resetAt: "2026-08-01T00:00:00.000Z" },
      { topic: "Topic", severity: "medium", questionPreview: "Question" },
      { inviteeUserId: "user_1", inviteeName: "Name" },
      { companyName: "Acme" },
      { roleType: "base", action: "changed", roleName: "ADMIN" },
      { documentId: "doc_1", documentTitle: "Title" },
    ];

    it.each(validInputs.map((input, index) => [index, input] as const))(
      "schema #%i rejects an unknown key",
      (_index, input) => {
        const schema = METADATA_SCHEMAS[_index];
        const withUnknown = { ...input, extraKey: "not allowed" };
        expect(() => schema.parse(withUnknown)).toThrow(z.ZodError);
      },
    );

    it.each(validInputs.map((input, index) => [index, input] as const))(
      "schema #%i accepts its valid input",
      (_index, input) => {
        const schema = METADATA_SCHEMAS[_index];
        expect(schema.safeParse(input).success).toBe(true);
      },
    );
  });

  describe("sanitize helpers", () => {
    it("escapeHtml escapes < > & \" '", () => {
      expect(escapeHtml(`<script>"&'</script>`)).toBe(
        "&lt;script&gt;&quot;&amp;&#39;&lt;/script&gt;",
      );
    });

    it("allowlist rejects any URL not in the verified endpoint set", () => {
      expect(isActionUrlAllowed("/documents/doc_123/ocr/retry")).toBe(true);
      expect(isActionUrlAllowed("/documents/doc_123/index/retry")).toBe(true);
      expect(isActionUrlAllowed("/documents/doc_123")).toBe(true);
      expect(isActionUrlAllowed("https://evil.example.com/steal")).toBe(false);
      expect(isActionUrlAllowed("/admin/delete-tenant")).toBe(false);
      expect(isActionUrlAllowed("/documents/doc_123/ocr/retry?ref=1")).toBe(false);

      let caught: unknown;
      try {
        assertActionUrlAllowed("/not/allowlisted");
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(NotificationFactoryError);
      expect((caught as NotificationFactoryError).code).toBe("URL_NOT_ALLOWED");
    });

    it("metadata size cap rejects oversized metadata (4KB)", () => {
      expect(() => assertMetadataSize({ padded: "x".repeat(5000) })).toThrow(
        NotificationFactoryError,
      );
      expect(() => assertMetadataSize({ small: "ok" })).not.toThrow();
    });

    it("resolveLocalized: en canonical when only ar provided", () => {
      expect(resolveLocalized({ ar: "عربي" }, { en: "EN", ar: "AR" })).toEqual({
        en: "عربي",
        ar: "عربي",
      });
    });
  });
});
