/**
 * Retrieval Demo — run with:
 *
 *   node --experimental-strip-types --no-warnings --import tsx src/modules/retrieval/demo.ts
 *
 * Seeds 12 chunks across 2 tenants, then runs several queries to show
 * how hybrid search, tenant isolation, role filtering, and fusion work.
 */

import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";

// ── Models ──────────────────────────────────────────────────────────────
import DocumentChunkModel from "../../db/models/documentChunk.model.js";
import DocumentModel from "../../db/models/document.model.js";
import DocumentVersionModel from "../../db/models/documentVersion.model.js";

// ── Adapters & engines ──────────────────────────────────────────────────
import { createFakeVectorStoreAdapter } from "../../providers/embedding/fakeVectorStoreAdapter.js";
import { FakeKeywordAdapter } from "../../providers/embedding/fakeKeywordAdapter.js";
import {
  compileAccessFilters,
  compileQueryFilters,
  mergeFilters,
  type FilterCompiler,
} from "./filterCompiler.js";
import { FusionEngine } from "./fusionEngine.js";

// ── Repository & service ────────────────────────────────────────────────
import { createRetrievalRepository } from "./retrieval.repository.js";
import { createRetrievalService } from "./retrieval.service.js";

// ── Types ───────────────────────────────────────────────────────────────
import type { AccessContext, RetrievalQuery } from "./retrieval.types.js";

// ═══════════════════════════════════════════════════════════════════════════
// Seed data
// ═══════════════════════════════════════════════════════════════════════════

const TENANT_A = new mongoose.Types.ObjectId("670000000000000000000001");
const TENANT_B = new mongoose.Types.ObjectId("670000000000000000000002");

const DOC_A1 = new mongoose.Types.ObjectId("670000000000000000000010");
const DOC_A2 = new mongoose.Types.ObjectId("670000000000000000000011");
const VER_A1 = new mongoose.Types.ObjectId("67000000000000000000a001");
const VER_A2 = new mongoose.Types.ObjectId("67000000000000000000b001");

const DOC_B1 = new mongoose.Types.ObjectId("670000000000000000000020");
const VER_B1 = new mongoose.Types.ObjectId("67000000000000000000c001");

interface SeedChunk {
  tenantId: mongoose.Types.ObjectId;
  documentId: mongoose.Types.ObjectId;
  documentVersionId: mongoose.Types.ObjectId;
  chunkIndex: number;
  text: string;
  pageNumber: number | null;
  sectionTitle: string | null;
  classification: "public" | "internal" | "confidential" | "restricted";
  category: string | null;
  department: string | null;
  allowAiUse: boolean;
}

const CHUNKS: SeedChunk[] = [
  // ── Tenant A — HR department ──────────────────────────────────────────
  {
    tenantId: TENANT_A, documentId: DOC_A1, documentVersionId: VER_A1, chunkIndex: 0,
    text: "Annual leave policy: employees are entitled to 30 calendar days of paid leave per year",
    pageNumber: 1, sectionTitle: "Leave Policy", classification: "public",
    category: "policies", department: "hr", allowAiUse: true,
  },
  {
    tenantId: TENANT_A, documentId: DOC_A1, documentVersionId: VER_A1, chunkIndex: 1,
    text: "Remote work policy allows 2 days per week from home with manager approval",
    pageNumber: 1, sectionTitle: "Remote Work", classification: "internal",
    category: "policies", department: "hr", allowAiUse: true,
  },
  {
    tenantId: TENANT_A, documentId: DOC_A1, documentVersionId: VER_A1, chunkIndex: 2,
    text: "Overtime compensation: 1.5x base rate for extra hours beyond 40 hours per week",
    pageNumber: 2, sectionTitle: "Overtime", classification: "internal",
    category: "policies", department: "hr", allowAiUse: true,
  },
  // ── Tenant A — IT department (confidential) ───────────────────────────
  {
    tenantId: TENANT_A, documentId: DOC_A2, documentVersionId: VER_A2, chunkIndex: 0,
    text: "Data security policy: all sensitive data must be encrypted at rest and in transit",
    pageNumber: 1, sectionTitle: "Encryption", classification: "confidential",
    category: "policies", department: "it", allowAiUse: true,
  },
  {
    tenantId: TENANT_A, documentId: DOC_A2, documentVersionId: VER_A2, chunkIndex: 1,
    text: "Password requirements: minimum 12 characters with complexity requirements",
    pageNumber: 2, sectionTitle: "Passwords", classification: "internal",
    category: "policies", department: "it", allowAiUse: true,
  },
  {
    tenantId: TENANT_A, documentId: DOC_A2, documentVersionId: VER_A2, chunkIndex: 2,
    text: "Incident reporting: security breaches must be reported within 1 hour to IT security team",
    pageNumber: 3, sectionTitle: "Incidents", classification: "internal",
    category: "policies", department: "it", allowAiUse: false,  // ← AI use opt-out
  },

  // ── Tenant B — Legal (Arabic) ─────────────────────────────────────────
  {
    tenantId: TENANT_B, documentId: DOC_B1, documentVersionId: VER_B1, chunkIndex: 0,
    text: "عقد عمل بين الشركة والموظف يحدد راتب شهري 8000 ريال سعودي",
    pageNumber: 1, sectionTitle: "الشروط الأساسية", classification: "internal",
    category: "contracts", department: "legal", allowAiUse: true,
  },
  {
    tenantId: TENANT_B, documentId: DOC_B1, documentVersionId: VER_B1, chunkIndex: 1,
    text: "يشمل العقد تأمين صحي و30 يوم إجازة سنوية ومكافأة نهاية الخدمة",
    pageNumber: 2, sectionTitle: "المزايا", classification: "internal",
    category: "contracts", department: "legal", allowAiUse: true,
  },
  {
    tenantId: TENANT_B, documentId: DOC_B1, documentVersionId: VER_B1, chunkIndex: 2,
    text: "مدة العقد: سنة قابلة للتجديد باتفاق الطرفين",
    pageNumber: 2, sectionTitle: "مدة العقد", classification: "internal",
    category: "contracts", department: "legal", allowAiUse: true,
  },
  // ── Tenant B — Finance (confidential/restricted) ──────────────────────
  {
    tenantId: TENANT_B, documentId: DOC_B1, documentVersionId: VER_B1, chunkIndex: 3,
    text: "Q3 revenue reached 2.5 million SAR with 15% growth year-over-year",
    pageNumber: 1, sectionTitle: "Revenue", classification: "confidential",
    category: "reports", department: "finance", allowAiUse: false,
  },
  {
    tenantId: TENANT_B, documentId: DOC_B1, documentVersionId: VER_B1, chunkIndex: 4,
    text: "Operating expenses were 1.2 million SAR including personnel costs of 800K",
    pageNumber: 2, sectionTitle: "Expenses", classification: "restricted",
    category: "reports", department: "finance", allowAiUse: true,
  },
  {
    tenantId: TENANT_B, documentId: DOC_B1, documentVersionId: VER_B1, chunkIndex: 5,
    text: "Customer service response time: respond within 4 hours for standard inquiries",
    pageNumber: 1, sectionTitle: "Response Time", classification: "public",
    category: "guidelines", department: "support", allowAiUse: true,
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

function printSeparator(title: string) {
  console.log(`\n${"═".repeat(70)}`);
  console.log(`  ${title}`);
  console.log(`${"═".repeat(70)}`);
}

function printResult(result: Awaited<ReturnType<typeof service.hybridSearch>>) {
  console.log(`\n  Candidates returned: ${result.totalCandidates}`);
  console.log(`  Filter summary:`);
  console.log(`    tenantFilter: ${result.filterSummary.tenantFilter}`);
  console.log(`    roleFilter:   ${result.filterSummary.roleFilter}`);
  console.log(`    permissions:  [${result.filterSummary.permissionScopes.join(", ")}]`);
  console.log(`    explicit:     [${result.filterSummary.explicitFilters.join(", ")}]`);

  console.log(`\n  Diagnostics:`);
  console.log(`    traceId:          ${result.diagnostics.traceId}`);
  console.log(`    vectorCandidates: ${result.diagnostics.vectorCandidateCount}`);
  console.log(`    keywordCandidates: ${result.diagnostics.keywordCandidateCount}`);
  console.log(`    totalLatencyMs:   ${result.diagnostics.totalLatencyMs}`);

  if (result.candidates.length === 0) {
    console.log(`\n  (no results — search returned empty)`);
    return;
  }

  console.log(`\n  Ranked results:`);
  for (const [i, c] of result.candidates.entries()) {
    console.log(`    ${i + 1}. [score=${c.score.toFixed(4)}] ${c.retrievalMethod}`);
    console.log(`       text:    "${c.text.slice(0, 80)}${c.text.length > 80 ? "..." : ""}"`);
    console.log(`       section: ${c.sectionTitle ?? "—"}`);
    console.log(`       class:   ${c.classification ?? "—"}`);
    console.log(`       page:    ${c.pageNumber ?? "—"}`);
    if (c.scoreBreakdown) {
      console.log(`       breakdown: vector=${c.scoreBreakdown.vectorScore ?? "—"} keyword=${c.scoreBreakdown.keywordScore ?? "—"} fusion=${c.scoreBreakdown.fusionScore}`);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════════════════

let service: ReturnType<typeof createRetrievalService>;

async function main() {
  console.log("🚀 Starting retrieval demo...\n");

  // ── 1. Spin up in-memory MongoDB ──────────────────────────────────────
  const mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  await mongoose.connect(uri);
  console.log(`  ✓ In-memory MongoDB ready at ${uri}`);

  // ── 2. Seed chunks into MongoDB ──────────────────────────────────────
  const inserted = await DocumentChunkModel.insertMany(CHUNKS);
  console.log(`  ✓ Seeded ${CHUNKS.length} document chunks`);

  // ── 3. Create adapters & service ──────────────────────────────────────
  const fakeVector = createFakeVectorStoreAdapter();
  const fakeKeyword = new FakeKeywordAdapter();
  const filterCompiler: FilterCompiler = {
    compileAccessFilters,
    compileQueryFilters,
    mergeFilters,
  };
  const fusionEngine = new FusionEngine();
  const repository = createRetrievalRepository();

  // ── 4. Populate adapters with seeded data ────────────────────────────
  // Generate deterministic pseudo-vectors and index into both adapters.
  const vectorDimension = 16;
  function pseudoVector(text: string): number[] {
    const dims = new Array<number>(vectorDimension).fill(0);
    for (let i = 0; i < text.length; i++) {
      dims[i % vectorDimension] += text.charCodeAt(i);
    }
    const mag = Math.sqrt(dims.reduce((s, v) => s + v * v, 0));
    return mag === 0 ? dims : dims.map((v) => Number((v / mag).toFixed(6)));
  }

  const vectorChunks: { chunkId: string; vector: number[]; metadata: Record<string, unknown> }[] = [];
  const keywordChunks: { chunkId: string; text: string; metadata: Record<string, unknown> }[] = [];

  for (const doc of inserted) {
    const chunkId = doc._id.toString();
    const metadata = {
      tenantId: doc.tenantId.toString(),
      documentId: doc.documentId.toString(),
      documentVersionId: doc.documentVersionId.toString(),
      classification: doc.classification,
      department: doc.department,
      category: doc.category,
      allowAiUse: doc.allowAiUse,
    };

    vectorChunks.push({ chunkId, vector: pseudoVector(doc.text), metadata });
    keywordChunks.push({ chunkId, text: doc.text, metadata });
  }

  await fakeVector.storeChunks(vectorChunks);
  await fakeKeyword.indexChunks(keywordChunks);
  console.log(`  ✓ Populated fake adapters with ${vectorChunks.length} chunks`);

  service = createRetrievalService({
    vectorAdapter: fakeVector,
    keywordAdapter: fakeKeyword,
    embeddingAdapter: {
      providerKey: "demo-fake",
      async embed({ inputs }: { inputs: string[] }) {
        // Deterministic pseudo-embedding: hash each word into a 4-dim vector
        const vectors = inputs.map((text) => {
          const dims = new Array<number>(4).fill(0);
          for (let i = 0; i < text.length; i++) {
            dims[i % 4] += text.charCodeAt(i);
          }
          const mag = Math.sqrt(dims.reduce((s, v) => s + v * v, 0));
          return dims.map((v) => Number((v / mag).toFixed(6)));
        });
        const totalTokens = inputs.reduce((sum, t) => sum + t.length, 0);
        return { vectors, usage: { totalTokens } };
      },
    },
    fusionEngine,
    filterCompiler,
    repository,
  });
  console.log("  ✓ Service wired with fake adapters\n");

  // ═══════════════════════════════════════════════════════════════════════
  // Scenario 1: SUPER_ADMIN hybrid search — "leave policy"
  // ═══════════════════════════════════════════════════════════════════════
  printSeparator("SCENARIO 1: SUPER_ADMIN searching Tenant A — 'leave policy'");

  const ctxAdmin: AccessContext = {
    tenantId: TENANT_A.toString(),
    actorId: "admin-user-001",
    baseRole: "SUPER_ADMIN",
  };

  const q1: RetrievalQuery = { queryText: "leave policy", topK: 5 };
  const r1 = await service.hybridSearch(q1, ctxAdmin);
  printResult(r1);

  // ═══════════════════════════════════════════════════════════════════════
  // Scenario 2: EMPLOYEE hybrid search — "security breach"
  // (should NOT see confidential chunks)
  // ═══════════════════════════════════════════════════════════════════════
  printSeparator("SCENARIO 2: EMPLOYEE searching Tenant A — 'security breach'");

  const ctxEmployee: AccessContext = {
    tenantId: TENANT_A.toString(),
    actorId: "employee-user-001",
    baseRole: "EMPLOYEE",
  };

  const q2: RetrievalQuery = { queryText: "security breach reporting", topK: 5 };
  const r2 = await service.hybridSearch(q2, ctxEmployee);
  printResult(r2);

  // ═══════════════════════════════════════════════════════════════════════
  // Scenario 3: Cross-tenant isolation — Tenant B user queries Tenant A
  // ═══════════════════════════════════════════════════════════════════════
  printSeparator("SCENARIO 3: Cross-tenant isolation — Tenant B searching Tenant A");

  const ctxTenantB: AccessContext = {
    tenantId: TENANT_B.toString(),
    actorId: "user-b-001",
    baseRole: "COMPANY_ADMIN",
  };

  const q3: RetrievalQuery = { queryText: "leave policy", topK: 5 };
  const r3 = await service.hybridSearch(q3, ctxTenantB);
  printResult(r3);

  // ═══════════════════════════════════════════════════════════════════════
  // Scenario 4: Arabic query on Tenant B
  // ═══════════════════════════════════════════════════════════════════════
  printSeparator("SCENARIO 4: Arabic query on Tenant B — 'راتب شهري'");

  const q4: RetrievalQuery = { queryText: "راتب شهري", topK: 3 };
  const r4 = await service.hybridSearch(q4, ctxTenantB);
  printResult(r4);

  // ═══════════════════════════════════════════════════════════════════════
  // Scenario 5: Filtered query — only 'hr' department + 'public' class
  // ═══════════════════════════════════════════════════════════════════════
  printSeparator("SCENARIO 5: Filtered query — HR dept + public classification");

  const q5: RetrievalQuery = {
    queryText: "employee benefits",
    topK: 5,
    filter: {
      departments: ["hr"],
      classifications: ["public"],
    },
  };
  const r5 = await service.hybridSearch(q5, ctxAdmin);
  printResult(r5);

  // ═══════════════════════════════════════════════════════════════════════
  // Scenario 6: Vector-only search
  // ═══════════════════════════════════════════════════════════════════════
  printSeparator("SCENARIO 6: Vector-only search — 'overtime hours'");

  const q6: RetrievalQuery = { queryText: "overtime hours compensation", topK: 3 };
  const r6 = await service.vectorSearch(q6, ctxAdmin);
  printResult(r6);

  // ═══════════════════════════════════════════════════════════════════════
  // Scenario 7: Keyword-only search
  // ═══════════════════════════════════════════════════════════════════════
  printSeparator("SCENARIO 7: Keyword-only search — 'password requirements'");

  const q7: RetrievalQuery = { queryText: "password requirements", topK: 3 };
  const r7 = await service.keywordSearch(q7, ctxAdmin);
  printResult(r7);

  // ═══════════════════════════════════════════════════════════════════════
  // Scenario 8: allowAiUse=false chunks excluded
  // ═══════════════════════════════════════════════════════════════════════
  printSeparator("SCENARIO 8: AI-use opt-out — 'incident reporting'");

  const q8: RetrievalQuery = { queryText: "incident reporting", topK: 5 };
  const r8 = await service.hybridSearch(q8, ctxAdmin);
  printResult(r8);
  console.log(`\n  ✓ Note: chunk with text "Incident reporting: security breaches..."`);
  console.log(`    has allowAiUse=false and should NOT appear in results.`);

  // ── Cleanup ───────────────────────────────────────────────────────────
  await mongoose.disconnect();
  await mongod.stop();

  console.log(`\n${"═".repeat(70)}`);
  console.log("  ✅ Demo complete — all scenarios finished.");
  console.log(`${"═".repeat(70)}\n`);
}

main().catch((err) => {
  console.error("Demo failed:", err);
  process.exit(1);
});
