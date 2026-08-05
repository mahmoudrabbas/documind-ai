import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DefaultJudgeEvidenceLoader } from "../judgeEvidence.js";
import type { JudgeEvidenceContext, JudgeEvidenceLimits } from "../judgeEvidence.js";
import type { MessageSource } from "../../../db/models/message.model.js";
import type { DocumentAccessAuthorizationService } from "../../document-access/documentAccess.authorization.service.js";
import type { DocumentAuthorizationContext } from "../../document-access/documentAccess.authorization.service.js";
import type { DocumentChunkDocument } from "../../../db/models/documentChunk.model.js";

interface StubChunk {
  _id: { toString(): string };
  documentId: { toString(): string };
  text: string;
  sectionTitle?: string | null;
  pageNumber?: number | null;
}

const context: JudgeEvidenceContext = { tenantId: "tenant-1", actorId: "user-1" };

function chunk(id: string, documentId: string, text: string, extra: Partial<StubChunk> = {}): StubChunk {
  return {
    _id: { toString: () => id },
    documentId: { toString: () => documentId },
    text,
    sectionTitle: null,
    pageNumber: null,
    ...extra,
  };
}

function source(chunkId: string, documentId: string, title: string): MessageSource {
  return { chunkId, documentId, documentTitle: title, score: 0.9 };
}

function makeLoader(overrides: {
  chunks?: StubChunk[];
  deniedDocuments?: string[];
  limits?: JudgeEvidenceLimits;
} = {}) {
  const { chunks = [], deniedDocuments = [], limits } = overrides;
  const loader = new DefaultJudgeEvidenceLoader({
    limits,
    documentAuthorization: {
      authorizeDocumentAction: async (_ctx: DocumentAuthorizationContext, documentId: string) => {
        if (deniedDocuments.includes(documentId)) {
          throw new Error(`denied: ${documentId}`);
        }
      },
    } as unknown as Pick<DocumentAccessAuthorizationService, "authorizeDocumentAction">,
    findChunksByIds: async () => chunks as unknown as DocumentChunkDocument[],
  });
  return loader;
}

describe("DefaultJudgeEvidenceLoader", () => {
  it("returns [] for no sources", async () => {
    const loader = makeLoader();
    assert.deepEqual(await loader.load(context, []), []);
  });

  it("preserves source order and skips unknown chunks", async () => {
    const chunks = [
      chunk("c2", "d2", "second"),
      chunk("c1", "d1", "first"),
    ];
    const loader = makeLoader({ chunks });
    const evidence = await loader.load(context, [
      source("c1", "d1", "Doc A"),
      source("c2", "d2", "Doc B"),
    ]);
    assert.deepEqual(evidence.map((e) => e.chunkId), ["c1", "c2"]);
  });

  it("deduplicates chunkIds keeping the first occurrence", async () => {
    const chunks = [chunk("c1", "d1", "text")];
    const loader = makeLoader({ chunks });
    const evidence = await loader.load(context, [
      source("c1", "d1", "Doc A"),
      source("c1", "d1", "Doc A"),
    ]);
    assert.equal(evidence.length, 1);
  });

  it("drops chunks of documents no longer authorized for AI use", async () => {
    const chunks = [chunk("c1", "d1", "allowed"), chunk("c2", "d2", "denied")];
    const loader = makeLoader({ chunks, deniedDocuments: ["d2"] });
    const evidence = await loader.load(context, [
      source("c1", "d1", "Doc A"),
      source("c2", "d2", "Doc B"),
    ]);
    assert.deepEqual(evidence.map((e) => e.chunkId), ["c1"]);
  });

  it("returns [] when no chunk is authorized", async () => {
    const chunks = [chunk("c1", "d1", "text")];
    const loader = makeLoader({ chunks, deniedDocuments: ["d1"] });
    assert.deepEqual(await loader.load(context, [source("c1", "d1", "Doc A")]), []);
  });

  it("falls back to the persisted title when the chunk has no title", async () => {
    const chunks = [chunk("c1", "d1", "text")];
    const loader = makeLoader({ chunks });
    const evidence = await loader.load(context, [source("c1", "d1", "Persisted Title")]);
    assert.equal(evidence[0]!.documentTitle, "Persisted Title");
  });

  it("truncates long chunk text to the per-chunk budget", async () => {
    const longText = "a".repeat(5000);
    const chunks = [chunk("c1", "d1", longText)];
    const loader = makeLoader({ chunks, limits: { maxChunks: 5, maxCharsPerChunk: 100, maxTotalChars: 8000 } });
    const evidence = await loader.load(context, [source("c1", "d1", "Doc A")]);
    assert.ok(evidence[0]!.text.length <= 101);
    assert.ok(evidence[0]!.text.startsWith("a".repeat(100)));
  });

  it("stops adding evidence once the total char budget is exhausted", async () => {
    const chunks = [chunk("c1", "d1", "aaaa"), chunk("c2", "d2", "bbbb")];
    const loader = makeLoader({ chunks, limits: { maxChunks: 5, maxCharsPerChunk: 2000, maxTotalChars: 5 } });
    const evidence = await loader.load(context, [
      source("c1", "d1", "Doc A"),
      source("c2", "d2", "Doc B"),
    ]);
    assert.equal(evidence.length, 1);
  });

  it("caps the number of chunks at maxChunks", async () => {
    const chunks = [chunk("c1", "d1", "a"), chunk("c2", "d2", "b"), chunk("c3", "d3", "c")];
    const loader = makeLoader({ chunks, limits: { maxChunks: 2, maxCharsPerChunk: 2000, maxTotalChars: 8000 } });
    const evidence = await loader.load(context, [
      source("c1", "d1", "A"),
      source("c2", "d2", "B"),
      source("c3", "d3", "C"),
    ]);
    assert.equal(evidence.length, 2);
  });

  it("skips chunks with empty text", async () => {
    const chunks = [chunk("c1", "d1", "   "), chunk("c2", "d2", "valid")];
    const loader = makeLoader({ chunks });
    const evidence = await loader.load(context, [
      source("c1", "d1", "A"),
      source("c2", "d2", "B"),
    ]);
    assert.deepEqual(evidence.map((e) => e.chunkId), ["c2"]);
  });
});
