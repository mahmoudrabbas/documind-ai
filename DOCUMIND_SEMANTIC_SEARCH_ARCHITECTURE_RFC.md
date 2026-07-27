# RFC/ADR — Semantic Chunking, Embeddings & MongoDB Atlas Vector Search Indexing
**Project:** DocuMind AI · **Epic:** Search · **Issue:** #16 · **Author:** Architecture proposal for @omar1175
**Status:** Draft for review — no code written, design only
it says "👤 Assignee

Omar (@omar1175)
Issue Metadata
Field 	Value
Epic 	Search
Assigned to 	@omar1175 (Omar)
Complexity 	Very Large
Branch 	feature/16-implement-semantic-chunking-embeddings-and-indexing
Delivery unit 	One feature issue → one branch → one pull request
Base roles 	SUPER_ADMIN, COMPANY_ADMIN, EMPLOYEE only
Primary sources 	DOCUMIND_AI_SRS_UPDATED_V2, PROJECT_IMPLEMENTATION_STATUS.md, current repository code
Mission

Create searchable tenant-aware document chunks and index verification.

The result must be a complete, reviewable vertical slice. Do not split database, backend, frontend, tests, and documentation into separate blocking issues when they are required for this feature.
Why This Issue Exists — Current Repository State

    No document chunk model implementation, embedding generation, vector store, keyword index, semantic chunking, or searchable-index verification exists.

User and Product Outcomes

    Approved document versions become searchable through reproducible chunks, embeddings, and keyword indexes.
    Reprocessing is idempotent, access metadata is preserved, and stale indexes are safely replaced.

SRS Requirements Covered

    FR-PROC-006..007

Current Code Areas to Inspect First

    api/src/db/models/documentChunk.model.ts
    api/src/providers/embeddings/
    api/src/modules/processing/
    api/src/modules/retrieval/
    workers/

Do not limit the audit to these paths. Search route registration, models, services, API clients, tests, environment configuration, Docker, and documentation for related behavior.
Required Discovery Before Coding

The coding model must first:

    Read the issue completely.
    Inspect the current implementation and route registration.
    Identify existing models, indexes, services, adapters, UI pages, tests, and documentation that overlap this feature.
    Run git status and record any pre-existing changes without overwriting them.
    Detect the package manager and available scripts.
    Write a short implementation plan naming the files/modules it expects to add or change.
    State any conflict between this issue and the current repository before making changes.
    Preserve existing public behavior unless this issue explicitly replaces it.
    Avoid installing a provider-specific dependency when a provider-neutral port plus fake adapter is sufficient.

After discovery, continue implementation without asking routine questions. Ask only when a product decision is genuinely missing and cannot be represented behind an interface.
Detailed Functional Requirements

    Define a semantic chunk schema preserving tenant, document/version, page, section, clause/table, language, category, department, classification, access policy version, source offsets, checksum, and text.
    Implement configurable chunking strategies for headings/paragraphs/clauses/tables with token limits and overlap; do not cut blindly across semantic boundaries.
    Support Arabic, English, and mixed content without losing source mapping.
    Define provider-neutral EmbeddingProvider, VectorIndex, and KeywordIndex interfaces with deterministic fakes.
    Generate embeddings in batches with retry, rate limits, model/version metadata, usage/cost events, and idempotency.
    Create vector and keyword indexes with mandatory tenant/access/version filter fields.
    Verify expected chunk/index counts before marking a document searchable.
    Implement atomic index generation/versioning: build a new index generation, validate it, switch active generation, then retire old data.
    Support delete, archive, access-policy change, re-embed, and full reindex without exposing stale unauthorized chunks.
    Persist chunk and index generation history sufficient for citations and rollback.
    Create fixture corpus and retrieval smoke tests without implementing hybrid retrieval ranking.

Existing High-Level Scope

The original issue plan included the following scope. It remains required unless the detailed specification above explicitly refines it:

    Implement semantic/header/table chunking
    Create embedding provider adapter
    Store chunk metadata and vectors
    Create keyword/vector indexes
    Add index verification and rollback
    Add multilingual retrieval fixtures

Backend and Domain Implementation

    Never allow the LLM or embedding provider to receive chunks before document access/processing approval.
    Batch long-running work through job ports.
    Text stored in vector metadata must follow privacy policy; use IDs where provider supports external metadata storage.

Recommended Code Ownership / Path Boundaries

    chunker/embedding/index adapters
    chunk/index-generation models
    indexing jobs
    status/reindex APIs
    corpus/contract/security tests

Use repository conventions. If a suggested path does not exist, create the equivalent module in the existing architecture rather than forcing a conflicting structure.
Frontend and UX Requirements

    Expose indexing status, model/version, chunk count, and safe retry/reindex actions through processing UI contracts.

For every relevant interface, implement:

    Loading state.
    Empty state.
    Validation state.
    Permission-denied state.
    Network/server failure state.
    Success and recovery actions.
    Responsive behavior on mobile, tablet, and desktop.
    Arabic RTL and English LTR behavior where text is user-facing.
    Accessible labels, focus behavior, keyboard operation, and semantic feedback.

If this issue has no user-facing UI, document that explicitly in the pull request and provide a diagnostic/test interface only where required.
Data Model, API, and Contract Requirements

    Define chunk, embedding reference, index generation, active generation, and processing result schemas/indexes.
    Publish search-index ports consumed by retrieval.

Every API added or changed must document:

    HTTP method and route.
    Authentication requirement.
    Required permission/base role.
    Tenant-scoping rule.
    Request schema.
    Success response schema.
    Stable error codes.
    Idempotency behavior where relevant.
    Pagination/filtering behavior where relevant.
    Frontend caller or reason it is backend-only.
    Automated test coverage.

Security and Multi-Tenancy Requirements

    Tenant and access-policy fields are mandatory and immutable within a generation.
    Test stale index removal after permission revocation.
    Provider calls must obey data residency/classification policy.

Additionally:

    Derive tenant identity from authenticated context, never from a trusted client body field.
    Recheck authorization inside deterministic services/tools/workers, not only at the route or UI.
    Validate every tenant-owned referenced ID belongs to the authenticated tenant.
    Do not expose secrets, raw tokens, internal stack traces, or unauthorized document content.
    Add cross-tenant and privilege-escalation tests appropriate to this feature.
    Add audit events for sensitive state changes and denials where useful.

Failure, Retry, and Recovery Behavior

    Handle provider partial batch failure, rate limit, dimension mismatch, index outage, verification mismatch, cancellation, and policy change mid-run.
    Do not mark searchable until all required indexes are verified.

The happy path alone is not sufficient. Partial success, duplicate requests, stale state, provider/worker interruption, and retry behavior must be explicit and tested wherever they can occur.
Automated Test Plan

    Golden chunking tests for headings, clauses, tables, Arabic/English, and page mapping.
    Embedding/vector/keyword contract tests with fakes.
    Idempotency, generation switch, rollback, stale access, and partial-failure tests.

Also run and report the affected workspace commands:

    Lint.
    Typecheck.
    Unit tests.
    Integration/security tests.
    Frontend/browser tests where applicable.
    Production build for affected workspaces.
    Docker/Compose validation when infrastructure changed.

Do not claim a command passed unless it was executed successfully. When a command is blocked by environment or external infrastructure, record the exact blocker and still run all independent checks.
Observability and Audit Requirements

    Record chunk counts/sizes, model/version, token usage, cost, duration, retries, index generation, and verification result.

Use correlation/trace identifiers and safe structured fields. Do not log sensitive payloads merely to make debugging easier.
Parallel-Safety Contract — No Waiting on Another Issue

    Consume frozen extraction/metadata/access-policy fixtures.
    Publish fake vector/keyword indexes and a frozen corpus for retrieval teams.
    Do not require live providers in CI.

Mandatory parallel-development rules:

    Define the required interface/port locally in the owning domain.
    Ship a deterministic fake or in-memory adapter in the same PR.
    Add contract tests that both fake and production adapters must satisfy.
    Use fixtures for unavailable upstream/downstream systems.
    Do not block waiting for another feature branch.
    Do not directly import another unfinished issue's internal implementation.
    Freeze request/response/event schemas used by other teams and document version changes.
    Keep temporary adapters clearly named and replaceable; they must not silently become production providers.

Explicitly Out of Scope

    Hybrid retrieval ranking, answer generation, chat, or citation verification.

Also out of scope:

    Unrelated repository-wide refactors.
    Changing the three approved base roles.
    Adding production credentials to source control.
    Marking a feature complete with mocked production behavior and no clear adapter boundary.
    Implementing work assigned to another issue unless required to provide a small interface/fake.

Acceptance Criteria

The feature is accepted only when all detailed requirements above are met and the following outcomes are true:

    Every chunk carries tenant/access/version metadata
    Re-indexing is idempotent
    Failed indexing does not mark ready
    Embedding usage is recorded
    Fake embedding adapter supports tests

Additional acceptance criteria:

    Real backend behavior exists for the part owned by this issue.
    Required frontend behavior is connected to the real API or to an explicitly documented fake adapter when the live downstream implementation belongs elsewhere.
    Tenant isolation and permission checks are proven by tests.
    Idempotency/retry/recovery behavior is proven where relevant.
    No hardcoded demo data is presented as real product data.
    Stable contracts and fixtures are documented for parallel teams.
    Documentation is updated to distinguish current implementation from remaining target behavior.
    A reviewer can demonstrate the feature end-to-end using documented local steps.

Definition of Done

    Backend/domain implementation is complete.
    Frontend integration is complete where applicable.
    Tenant and permission rules are verified.
    Validation and all material failure states are implemented.
    Unit, integration, security, and user-flow tests appropriate to risk pass.
    Observability and audit events are added.
    API/data contracts and module documentation are updated.
    Lint, typecheck, tests, and production builds pass for every affected workspace.
    git diff contains no unrelated changes, secrets, generated junk, or temporary debug code.
    The pull request explains how the feature was tested and which adapters are fake vs production-ready.

Instructions for the Coding Model

    Do not merely describe the implementation; inspect and modify the repository.
    Do not rewrite stable modules unnecessarily.
    Prefer small domain interfaces and explicit adapters over hidden cross-module coupling.
    Do not weaken authorization, tenant filtering, validation, or audit to make tests pass.
    Do not treat an LLM/agent decision as authorization or deterministic execution.
    Do not use hardcoded metrics, fake success responses, or placeholder UI as the final implementation.
    Preserve backward compatibility or provide a migration/backfill with dry-run and rollback guidance.
    Keep the PR focused on this issue while completing all layers needed for a usable vertical slice.
    Update tests as part of implementation, not after the feature is considered done.
    End with an evidence-based completion report.

Required Final Response From the Coding Model

The final response must include:

    Summary of implemented behavior.
    Files added/changed.
    Data migrations/backfills and how to run them.
    API routes/contracts added or changed.
    Security and tenant-isolation decisions.
    Fake adapters/fixtures created for parallel work.
    Commands executed with pass/fail/blocked status.
    Remaining limitations that are explicitly outside this issue.
    git status --short.
    Confirmation that no secrets were printed or committed.
"
---

## 0. Discovery Note & Conflict Disclosure

Per the issue's "Required Discovery Before Coding" step, this section states what was and wasn't available, and flags one real conflict before any design decision is treated as final.

**What this design is grounded in:**
- The full issue text (functional requirements, security rules, test plan, DoD).
- The paths the issue names as existing (`documentChunk.model.ts`, `providers/embeddings/`, `modules/processing/`, `modules/retrieval/`, `workers/`).
- The prompt's explicit constraint: **MongoDB Atlas Vector Search only** — no Qdrant, Pinecone, or Weaviate.

**What this session does not have:** live access to the actual repository (no `git status`, no source tree to inspect). Every reference to "existing" code below is therefore an *assumption to validate*, not a confirmed fact — the coding phase must re-run the discovery steps (git status, package manager detection, actual file inspection) against the real repo before writing anything, exactly as the issue mandates.

**Conflict to flag explicitly:** earlier project planning for DocuMind (visible in prior team documentation) specified **Qdrant** as the vector store, with MongoDB used for relational/document metadata only. This issue's prompt overrides that with a hard requirement to use **only MongoDB Atlas Vector Search**, with no Qdrant/Pinecone/Weaviate. This design follows the issue's instruction (MongoDB Atlas Vector Search), and this document is the artifact that should be used to reconcile the two plans with the rest of the team before implementation starts — if any other in-flight branch already assumes Qdrant for retrieval, that branch owner needs to see this RFC.

---

## 1. High-Level Architecture

```
 Approved Document Version
          │
          ▼
   ① Text Extraction (existing, out of scope)
          │  produces: page-mapped raw text + structural hints
          ▼
   ② Semantic Chunking
          │  produces: DocumentChunk[] (unsaved, in-memory)
          ▼
   ③ Chunk Persistence (draft generation)
          │  writes: documentchunks (status: DRAFT, generation: vNext)
          ▼
   ④ Embedding Generation (OpenAI, batched)
          │  writes: embedding vectors + usage/cost events
          ▼
   ⑤ Index Build (MongoDB Atlas Vector Search + keyword index)
          │  creates/updates: Atlas Search index for generation vNext
          ▼
   ⑥ Verification
          │  compares: expected chunk/embedding/index counts vs actual
          ▼
   ⑦ Generation Switch (atomic activation)
          │  flips: activeGeneration pointer on Document
          ▼
   ⑧ Retirement of old generation (soft-delete, then GC)
          │
          ▼
   Search-Ready → consumed by Retrieval module (⑨ semantic retrieval → LLM, out of scope)
```

**Why this shape, not a simpler "chunk → embed → done" pipeline:**

- The pipeline is explicitly staged around a **generation** concept (③–⑦) rather than in-place mutation, because the issue requires atomic switch-over, rollback, and "never expose stale unauthorized chunks." A single mutable chunk collection updated row-by-row cannot guarantee that a partially-reprocessed document is never served mid-update. Generations solve this by making "searchable" a property of an entire, verified batch, not of individual rows.
- Verification (⑥) is a distinct stage, not folded into indexing, because the issue's acceptance criteria require "failed indexing does not mark ready" — that needs an explicit gate with its own pass/fail state that downstream code can query, rather than an implicit side effect of the last write succeeding.
- Extraction (①) and Retrieval-to-LLM (⑨) are drawn but explicitly out of scope — they already exist or belong to another issue; this RFC only owns ②–⑧.

**Alternative considered:** streaming/incremental indexing (index each chunk as soon as it's embedded, no generation concept). Rejected because it makes "verify before searchable" nearly impossible to reason about — there's no clean moment where you can say "this document's index is complete and consistent," which directly violates the DoD requirement that failed indexing must never mark a document ready.

---

## 2. MongoDB Schema

### 2.1 Collections

**`documents`** (existing — extended, not replaced)
- Add fields: `activeChunkGeneration: ObjectId | null`, `searchStatus: enum('NOT_INDEXED'|'INDEXING'|'READY'|'FAILED'|'STALE')`.
- *Why extend rather than a new collection:* the document is the natural owner of "which generation is currently live" — retrieval needs a single, cheap lookup (`documents.findOne`) to know what's safe to query, without joining into a generations collection on every search request.

**`documentChunks`**
- `_id`, `tenantId`, `organizationId`, `documentId`, `documentVersionId`
- `generationId` (which build this chunk belongs to)
- `chunkIndex` (ordinal within document, for stable ordering/citation)
- `sectionPath` (e.g. `["Article 4", "Clause 4.2"]`), `pageStart`, `pageEnd`, `offsetStart`, `offsetEnd`
- `contentType: enum('paragraph'|'heading'|'table'|'clause'|'list')`
- `language: enum('ar'|'en'|'mixed')`
- `department`, `classification`, `accessPolicyVersion` — copied at chunk-build time, **immutable within a generation**
- `text` (raw chunk text — see §7 on privacy for where this can/can't travel)
- `checksum` (sha256 of normalized text, for idempotency and drift detection)
- `tokenCount`
- `status: enum('DRAFT'|'EMBEDDED'|'INDEXED'|'ACTIVE'|'RETIRED')`
- `createdAt`, `updatedAt`

*Why a checksum field:* reprocessing the same document version must be idempotent. Before re-chunking, the pipeline can compare checksums of would-be chunks against the last generation's chunks; unchanged sections can skip re-embedding entirely (cost control), while changed sections get new chunks. Without a checksum this degrades to "always re-embed everything," which the issue's cost/idempotency requirements explicitly want avoided.

*Why `accessPolicyVersion` is immutable within a generation:* the issue requires that permission changes not silently leak into an already-verified, already-active generation. If access policy changes, that triggers a **new generation** (re-embed not required, but re-index/re-filter is), rather than mutating live rows — mutating live rows while they're serving queries is exactly the race condition that causes stale unauthorized access.

**`chunkEmbeddings`** (kept separate from `documentChunks`, not embedded as a subdocument)
- `_id`, `chunkId`, `generationId`, `tenantId`
- `provider: string`, `model: string`, `modelVersion: string`, `dimensions: number`
- `vector: number[]` (or reference — see §5)
- `embeddingChecksum` (checksum of the *input* text that produced this vector, distinct from the chunk's own checksum, so re-embeds triggered by a model upgrade are traceable separately from content changes)
- `tokenUsage`, `costUsd`, `createdAt`

*Why a separate collection instead of storing the vector on the chunk document:* two independent reasons. First, Atlas Vector Search indexes are defined over a specific field path; keeping vectors in their own collection lets the vector index be rebuilt/replaced without touching (or holding locks on) the document-shaped chunk data other services read constantly. Second, it cleanly supports **provider replacement** — a future second embedding provider/model can write a second `chunkEmbeddings` row per chunk (different `model`), and retrieval can choose which to query, without a schema migration on `documentChunks`.

**`indexGenerations`**
- `_id`, `documentId`, `documentVersionId`, `tenantId`
- `generationNumber` (monotonic per document)
- `status: enum('BUILDING'|'VERIFYING'|'VERIFIED'|'ACTIVE'|'FAILED'|'RETIRED')`
- `expectedChunkCount`, `actualChunkCount`, `expectedEmbeddingCount`, `actualEmbeddingCount`
- `atlasIndexName`, `atlasIndexStatus`
- `failureReason` (nullable, structured: `{stage, code, message}`)
- `triggeredBy: enum('INITIAL'|'REINDEX'|'ACCESS_POLICY_CHANGE'|'MODEL_UPGRADE')`
- `createdAt`, `activatedAt`, `retiredAt`

*Why this exists as its own collection rather than being derived from chunk statuses:* verification, rollback, and "which generation is currently active" all need an atomic, queryable single source of truth. Deriving generation state by aggregating over potentially millions of chunk rows on every check is both slow and racy (chunks can be mid-write while you're aggregating). A dedicated generation record is the thing the activation transaction flips — one document write, not a fan-out.

**`processingJobs`** (existing, extended)
- Add `stage: enum('CHUNK'|'EMBED'|'INDEX'|'VERIFY')`, `generationId`, `retryCount`, `idempotencyKey`, `deadLettered: boolean`.

### 2.2 Indexes

- `documentChunks`: compound `{tenantId, documentId, generationId, chunkIndex}` (retrieval + ordering); `{tenantId, generationId, status}` (verification counts); unique `{documentId, generationId, chunkIndex}`.
- `chunkEmbeddings`: `{chunkId, generationId}` unique; `{tenantId, generationId}` for verification counts.
- `indexGenerations`: unique `{documentId, generationNumber}`; `{documentId, status}` for "find active generation" fast-path.
- Atlas Vector Search index itself: see §5.

### 2.3 Tenant Isolation at the Schema Level

Every collection above carries `tenantId` as a **required, non-nullable, indexed** field, and it is the leading field in every compound index — not for query performance alone, but so that no query path can accidentally omit it and still be efficient enough to ship (an accidental cross-tenant scan would be slow enough in staging load tests to get caught). `tenantId` is written once at document-chunk creation from the authenticated processing context and is never accepted from a request body (see §7).

---

## 3. Chunking Strategy

**Goal ordering:** never cut across a semantic boundary just to hit a token count. Token limits are a *ceiling*, not a target.

**Strategy, in priority order:**
1. **Structural chunking first.** If the extracted document carries structural hints (headings, numbered clauses, table boundaries — produced upstream by extraction, out of scope here but consumed here), each heading/clause/table becomes a candidate chunk boundary. A clause is never split mid-sentence to satisfy a token limit unless the clause itself exceeds the hard ceiling (see below).
2. **Paragraph-level fallback.** Where no structural hints exist (plain paragraphs), chunk on paragraph boundaries, then greedily pack paragraphs together up to the target token size (default target ~400 tokens, hard ceiling ~800 tokens, both configurable per tenant/document category).
3. **Oversized unit handling.** A clause/table/paragraph that exceeds the hard ceiling on its own is split at sentence boundaries (for prose) or at row-group boundaries (for tables), never mid-token, and the resulting sub-chunks retain a shared `sectionPath` and a `partIndex` so citations can still point to "Clause 4.2, part 2 of 3."
4. **Overlap.** A configurable sliding overlap (default ~10–15% of target tokens) is applied only between adjacent chunks *within the same section*, not across section boundaries — overlapping across a heading boundary would let retrieval return a chunk that straddles two unrelated topics, which hurts precision more than the overlap helps recall.
5. **Tables.** Table rows are kept together where possible; if a table must be split, the header row is duplicated into each sub-chunk so a chunk is never "just data with no column meaning."
6. **Language handling (Arabic / English / mixed).** Chunking is language-aware but not language-*exclusive*: a chunk spanning mixed Arabic/English content (common in contracts with bilingual clauses) is tagged `language: 'mixed'` rather than forced into one bucket, and tokenization uses a tokenizer-agnostic character/word count fallback when the primary tokenizer's language model doesn't confidently classify the script. RTL text is stored as plain Unicode text with no directionality markup baked into the stored string — direction is a rendering concern for the UI, not a storage concern.
7. **Metadata carried per chunk:** `pageStart/pageEnd`, `offsetStart/offsetEnd` (character offsets into the source-extracted text, for citation/highlighting), `sectionPath`, `contentType`, `language`, `checksum`, `partIndex`/`partCount` where split.
8. **Versioning.** Chunking config (target size, overlap, tokenizer version) is itself versioned and stored on the `indexGenerations` record, so a future change to chunking parameters is traceable to exactly which generations used which config — this matters when someone asks "why did retrieval quality change" six weeks from now.

**Trade-off called out:** structural-first chunking is more implementation effort than naive fixed-size windowing, and depends on extraction upstream providing usable structural hints. If extraction cannot reliably produce heading/clause boundaries for a given document type, this design degrades gracefully to paragraph-packing (step 2) rather than failing — but retrieval quality for that document type will be lower until extraction improves. That degradation path should be logged (see §11) so it's visible, not silent.

---

## 4. Embedding Architecture

### 4.1 Interfaces (design-level, not implementation)

```
interface EmbeddingProvider {
  readonly name: string;
  readonly model: string;
  readonly dimensions: number;

  embedBatch(inputs: EmbeddingInput[]): Promise<EmbeddingResult[]>;
}

interface EmbeddingInput {
  chunkId: string;
  text: string;
  idempotencyKey: string; // derived from chunk checksum + model + version
}

interface EmbeddingResult {
  chunkId: string;
  vector: number[];
  tokenUsage: { prompt: number };
  costUsd: number;
  modelVersion: string;
}
```

`OpenAIEmbeddingProvider` implements this against the OpenAI embeddings API. A `FakeEmbeddingProvider` (deterministic — e.g. a hash-based pseudo-vector of the correct dimensionality) implements the same interface for tests and for parallel teams who need vector search to "work" without live OpenAI access, per the issue's parallel-safety contract.

**Why the interface is this shape, not "embed one string, call it N times":** batching is a first-class parameter (`embedBatch`, not `embed`), because OpenAI's embeddings API is meaningfully cheaper and faster in batches, and because rate-limit/backoff logic needs to operate at the batch level (a 429 on a batch of 100 should retry that batch with backoff, not require re-deriving which 100 failed one-by-one).

### 4.2 Batching, Rate Limiting, Retry

- Batch size is configurable, default tuned to stay under both the token-per-request and requests-per-minute limits of the configured OpenAI tier, with a safety margin (default target: 80% of published limits).
- Rate limiting is a token-bucket in front of the provider call, shared across workers for the same tenant/API key, so parallel workers don't independently blow through the limit.
- Retry policy: exponential backoff with jitter, bounded attempt count (default 5), only for retryable errors (429, 5xx, timeout) — never for 4xx validation errors, which get failed fast and surfaced.
- **Idempotency:** each embedding call's idempotency key is `hash(chunkChecksum + model + modelVersion)`. Before calling the provider, the pipeline checks whether a `chunkEmbeddings` row already exists for that key; if so, it's reused instead of re-billed. This is what makes "reprocessing is idempotent" (an explicit acceptance criterion) true at the embedding layer, not just at the chunk layer.
- **Partial batch failure:** if a batch of 100 chunks returns 97 successes and 3 failures (mixed errors within one API call, or a batch split due to size), the 97 are persisted immediately; the 3 failures are individually retried or dead-lettered. A partial failure never blocks the successes from being written — this is why persistence happens per-item, not per-batch-as-a-transaction.

### 4.3 Cost & Token Tracking

Every successful embedding call writes `tokenUsage` and `costUsd` onto its `chunkEmbeddings` row and emits a cost/usage event (consumed by §11 observability and, eventually, tenant billing — out of scope here, but the event shape is frozen so billing can consume it later without a schema renegotiation).

### 4.4 Provider Replacement

Because `EmbeddingProvider` is an interface and `model`/`dimensions` are recorded per-embedding-row rather than assumed globally, replacing OpenAI with another provider (or adding a second concurrent provider for evaluation) requires: a new adapter class, a new Atlas Vector Search index sized for the new dimensionality (see §5), and a new `indexGenerations` row with `triggeredBy: 'MODEL_UPGRADE'`. It does **not** require a schema migration, because `dimensions` was never hardcoded into the schema — it's a value, not a shape.

---

## 5. MongoDB Atlas Vector Search

### 5.1 Collection & Field Layout

The vector lives on `chunkEmbeddings.vector`. The Atlas Search index is defined on `chunkEmbeddings`, with the following field mapping:

- `vector`: `knnVector`, dimensions = provider's configured dimensionality (e.g. 1536 for `text-embedding-3-small`), similarity = cosine.
- `tenantId`, `generationId`, `documentId`: `filter` type (exact-match, not indexed for text search) — these are the **mandatory** pre-filters on every query, never optional.
- `department`, `classification`, `accessPolicyVersion`, `language`, `contentType`: `filter` type — optional filters layered on top of the mandatory ones.

*Why filter fields live on the embedding index rather than requiring a join back to `documentChunks` at query time:* Atlas Vector Search's `$vectorSearch` stage supports pre-filtering directly on indexed fields in the same collection. Denormalizing `tenantId`/`department`/`classification` onto `chunkEmbeddings` (copied at write time from the chunk) means tenant/security filtering happens *inside* the ANN search itself, not as a post-filter after retrieving top-k — which matters a lot for correctness: post-filtering top-k results for tenant isolation risks returning fewer than k results (or zero) for a tenant whose documents are a minority of the corpus, because the ANN search may have already discarded them before the k cutoff. Pre-filtering avoids this "empty results for legitimate tenant" failure mode entirely.

### 5.2 Index Naming & Generation Strategy

Index name: `vidx_{documentId}_{generationNumber}` is **not** used — that would mean one Atlas Search index per document, which does not scale (documents can number in the tens of thousands per tenant; Atlas has per-cluster index count limits). Instead:

- A **single** Atlas Vector Search index per cluster/environment: `vidx_chunk_embeddings_v{schemaVersion}`, covering the whole `chunkEmbeddings` collection across all tenants and documents.
- Tenant/document/generation scoping happens via the mandatory filter fields (§5.1), not via separate indexes.
- `schemaVersion` increments only when the *index definition itself* changes (e.g. dimensionality change from a new embedding model, or a new filter field added) — this is what "migration strategy" refers to below.

**Why one shared index instead of one per tenant or per document:** Atlas Vector Search indexes have real per-cluster limits and non-trivial build/resource cost. A single well-filtered index that scales with data volume (with Atlas's own sharding/replication handling growth) is both operationally simpler and how Atlas Vector Search is designed to be used — the filter-field mechanism exists specifically so tenants can share an index safely. Per-tenant indexes were considered and rejected: they'd give slightly stronger blast-radius isolation, but at a cost of index-count limits and much higher operational overhead (index lifecycle management per tenant, index warm-up latency on tenant creation) for a security property already achievable via mandatory filters plus tests proving those filters can't be bypassed (see §7).

### 5.3 Automatic Creation & Startup Validation

- On service startup, a validation routine checks that the expected Atlas Search index (`vidx_chunk_embeddings_v{currentSchemaVersion}`) exists and is in `READY` state via the Atlas Admin API; if missing, it is created idempotently (create-if-not-exists, not create-or-replace, to avoid accidentally dropping a live index on redeploy).
- If the index exists but is still `BUILDING` (e.g. right after a schema-version bump), the service starts in a degraded mode: writes proceed, but the `documents.searchStatus` cannot transition to `READY` until the index reports `READY`, surfaced as a distinct, monitorable state rather than a silent wait.

### 5.4 Migration Strategy (dimensionality / schema-version change)

1. New `chunkEmbeddings` rows are written with the new model/dimensions alongside old rows (old rows are never deleted mid-migration).
2. A new Atlas index `vidx_chunk_embeddings_v{N+1}` is created for the new dimensionality.
3. A background re-embed job (bounded by tenant, resumable) populates new rows for existing chunks, tracked via its own `indexGenerations`-style progress record (`triggeredBy: 'MODEL_UPGRADE'`).
4. Once verification (§6 counts) passes for a tenant, that tenant's `documents.activeChunkGeneration` pointers can be flipped to reference generations backed by the new embeddings — this is the same atomic-switch mechanism as §1/§8, reused rather than special-cased for migrations.
5. Old index/rows are retired only after a configurable grace period with zero read traffic against them (verified via metrics, §11).

---

## 6. Retrieval Architecture

*(Explicitly bounded: this issue does not implement retrieval ranking or the LLM step — this section defines the **contract** retrieval consumes, per the "publish search-index ports" requirement.)*

- **Query embedding:** the query string is embedded using the *same* `EmbeddingProvider`/model as the active generation being searched (the port takes `generationId` or resolves it from `documents.activeChunkGeneration`, never assumes a global "current model").
- **Vector search call:** `$vectorSearch` against `chunkEmbeddings`, pre-filtered on `tenantId` (always), `generationId` (always, resolved server-side from the document's active pointer — never client-supplied), and optionally `department`/`classification`/`language` per the caller's authorization context.
- **Top-k:** configurable, default 20 candidates returned to the caller (retrieval module), which may downstream-rerank — this design exposes a **placeholder** `similarityScore` per result and a **reranking hook interface** (`RerankerPort`, unimplemented, satisfied by a pass-through fake) so a future reranking issue has a stable seam to implement against, without this issue needing to build ranking logic itself.
- **Future hybrid/keyword search:** the `KeywordIndex` port (parallel to `VectorIndex`) is defined with the same tenant/generation filter contract, backed initially by a MongoDB Atlas Search **text** index (not a separate search engine) on `documentChunks.text`, so hybrid search later is a matter of combining two already-tenant-safe result sets, not introducing a new isolation boundary.
- **Future citations:** because `sectionPath`, `pageStart/pageEnd`, `offsetStart/offsetEnd`, and `partIndex` are already on every chunk, a future citation-verification issue can resolve any chunk back to an exact source location without this issue needing to build citation logic itself.

---

## 7. Multi-Tenant Security

**Non-negotiables, all enforced at the service layer (not just the route/UI):**

1. `tenantId` is derived exclusively from the authenticated request/job context. It is never accepted from a request body, query string, or job payload as a trusted value — any tenant-scoped ID in an incoming payload (documentId, chunkId, generationId) is **revalidated** server-side to confirm it belongs to the authenticated tenant before use, on every service and worker entry point, not only at the API boundary.
2. Every chunk/embedding/index-generation write includes `tenantId`, `department`, `classification`, `accessPolicyVersion` — and these are **immutable for the lifetime of a generation**. A permission change never mutates an active generation's rows; it triggers a new generation (§2.1, §5.4's mechanism reused).
3. **Stale index removal after permission revocation:** when a document's access policy is revoked/narrowed, the pipeline does not attempt to "unfilter" a live generation. It builds a new generation reflecting the new policy, verifies it, and atomically switches — the old generation is retired (soft-deleted, then GC'd after grace period) rather than patched. This guarantees there is never a window where a partially-updated permission set is live.
4. **Private/department-scoped documents:** filtering happens at the mandatory pre-filter level in the vector search call (§5.1, §6), never as an application-layer post-filter over an already-fetched result set — post-filtering is explicitly rejected as a pattern here because it both leaks result-count information and risks returning fewer-than-expected results silently (see §5.1's rationale).
5. **Future ACL support:** the schema reserves `accessPolicyVersion` as a version pointer rather than embedding a full ACL structure on every chunk, so a future fine-grained ACL system can be introduced by changing what `accessPolicyVersion` resolves to, without a chunk-schema migration.
6. **Provider data residency/classification:** before any chunk text is sent to OpenAI for embedding, a policy check (existing compliance/classification service, out of scope here — this design only calls it) confirms the document's classification permits third-party provider calls. If not, embedding is blocked and the document surfaces a distinct `searchStatus` reason rather than silently failing.
7. **Cross-tenant / privilege-escalation tests are mandatory**, not optional, per §12 — including a test that attempts to read another tenant's chunks via a forged `generationId`/`documentId` in an otherwise-valid request from tenant A, and confirms it is rejected before any data leaves the service layer.

---

## 8. Processing Pipeline

- **Queues/workers:** chunking, embedding, and indexing each run as separate job stages (`stage` field on `processingJobs`) so a slow/rate-limited embedding stage doesn't block chunking throughput for other documents, and so retries can be scoped to the failed stage only, not the whole pipeline.
- **Idempotency key** per job = `hash(documentVersionId + stage + generationId)`, so a duplicate job enqueue (e.g. from an at-least-once queue redelivering) is a safe no-op if that stage already completed for that generation.
- **Dead letter queue:** after the configured max retry count, a job moves to a DLQ with its structured failure reason preserved (`indexGenerations.failureReason`), and the generation is marked `FAILED` — it is never silently dropped, and it never gets a chance to mark the document `READY`.
- **Partial failure / rollback:** if verification (§9) fails after chunking+embedding+indexing all "complete," the generation is marked `FAILED`, the document's `activeChunkGeneration` is left untouched (still pointing at the last-known-good generation, or `null` if this is the first attempt), and the failed generation's rows are retained (not deleted) for debugging, then GC'd after a grace period — this is the rollback mechanism: rollback is "don't switch the pointer," not "undo writes."
- **Re-indexing / replacement strategy:** re-indexing always creates a new generation number; it never reuses or overwrites an existing generation's `_id`. This is what makes re-indexing composable with rollback — an in-progress re-index can be safely abandoned (leaving the old generation active) at any point before the switch step.
- **Status transitions:** `documents.searchStatus` follows `NOT_INDEXED → INDEXING → (READY | FAILED)`, with `READY → STALE` when a newer generation begins building (so callers know a fresher index is on the way without losing access to the currently-active one), and `STALE → READY` once the new generation activates.

---

## 9. Error Recovery

| Failure | Behavior |
|---|---|
| OpenAI rate limit (429) | Backoff + retry within batch; if exhausted, that batch's chunks stay `DRAFT` (not `EMBEDDED`), job retried at job level, generation stays `BUILDING` |
| OpenAI outage / 5xx | Same as above; sustained outage trips a circuit breaker so the pipeline stops hammering the provider and surfaces a clear `FAILED` reason rather than retrying into a wall |
| Mongo write failure | Standard driver retry (idempotent writes only, keyed by checksum/idempotency key above); non-idempotent multi-doc sequences use a bounded compensating-action pattern (mark generation `FAILED`, don't partially activate) |
| Network timeout | Treated as retryable at both provider-call and job level, bounded by the same retry policy as §4.2 |
| Partial indexing | Generation stays below `VERIFIED` until Atlas index reports `READY` **and** counts match (§9's core mechanism, detailed in verification, effectively §6 of the original outline folded here) |
| Duplicate processing | Prevented by idempotency keys at chunk, embedding, and job level — a duplicate run for an already-`ACTIVE` generation is a no-op, not a re-do |
| Worker crash mid-batch | Job's `retryCount`/idempotency key allow safe resumption; already-persisted chunk/embedding rows are not redone (checksum match short-circuits them) |
| Restart behavior | On worker restart, in-flight jobs are re-claimed via a lease/heartbeat mechanism (existing queue infra, assumed present per `workers/`) so no job is silently lost, only delayed |

---

## 10. Performance

- **Batch sizes:** embedding batches tuned to provider limits (§4.2); Mongo bulk-writes for chunk/embedding persistence batched (default 500 docs/bulk op) to reduce round trips without holding excessively large in-memory buffers.
- **Chunk size:** default target ~400 tokens balances retrieval precision (smaller chunks → more precise matches) against index size / storage cost (smaller chunks → more rows); this is a tunable, not a constant, per the versioned chunking config in §3.
- **Parallelism:** chunking is CPU-bound and parallelizable per-document; embedding is I/O-bound and rate-limit-bound, so its parallelism is capped by the token-bucket (§4.2) rather than worker count — adding more workers beyond the rate limit's ceiling doesn't help and is avoided.
- **Memory:** large documents are chunked and persisted incrementally (streamed), not held fully in memory as one giant array, to bound worker memory footprint independent of document size.
- **OpenAI cost:** tracked per-embedding (§4.3); idempotency (§4.2) is the primary cost control, since it avoids re-billing unchanged content on every reprocess.
- **Mongo / Atlas Vector Search performance:** the shared-index-with-filters design (§5.2) is chosen partly for performance — Atlas's pre-filter + ANN search is designed to scale with sharded clusters, whereas many small per-tenant indexes would each pay fixed build/resource overhead.
- **Future scaling:** if a single tenant's corpus grows large enough that even filtered search over the shared index degrades, the schema-version mechanism (§5.4) provides a path to a differently-partitioned index (e.g. sharded by tenant cohort) without a chunk-schema rewrite.

---

## 11. Observability

- **Structured logging:** every pipeline stage logs with `{tenantId, documentId, generationId, stage, correlationId}` — never raw chunk text in logs (privacy requirement from the issue).
- **Metrics:** chunk counts/sizes per document, embedding latency (p50/p95), vector search query latency, queue lag per stage, indexing duration end-to-end, cost-per-document.
- **Cost metrics:** aggregated from `chunkEmbeddings.costUsd`, exposed per-tenant and per-document for future billing consumption.
- **Verification results:** every `indexGenerations` transition (`BUILDING→VERIFYING→VERIFIED/FAILED→ACTIVE/RETIRED`) emits an event, giving a full audit trail of every attempt, not just the successful ones.
- **Alerts:** DLQ depth > threshold; verification failure rate per tenant; Atlas index status not `READY` beyond expected build time; embedding cost anomaly (sudden spike vs. rolling average).
- **Audit events:** access-policy-triggered reindex, permission-denial on cross-tenant chunk access attempts (§7), and any generation retirement — these feed the issue's audit requirement, distinct from debug logs.

---

## 12. Testing Strategy

- **Golden chunking tests:** fixed input documents (headings, clauses, tables, Arabic, English, mixed) with hand-verified expected chunk boundaries, page mapping, and offsets — regression-tested on every chunking-config change.
- **Contract tests for `EmbeddingProvider`, `VectorIndex`, `KeywordIndex`:** a single shared test suite run against both the fake and (in a separate, opt-in, non-CI-blocking suite) the real OpenAI/Atlas adapters, so both must satisfy identical behavioral guarantees (batch partial-failure handling, idempotency, dimensionality reporting).
- **Idempotency tests:** reprocessing an unchanged document produces zero new embedding calls and zero new chunk rows (checksums match); reprocessing a partially-changed document re-embeds only the changed sections.
- **Generation-switch / rollback tests:** simulate verification failure after chunking+embedding succeed; assert the document's active generation is untouched and `searchStatus` never reports `READY`.
- **Stale-access tests:** revoke a document's access policy mid-generation-build; assert the previously active (now-superseded) generation's chunks are unreachable once the new generation activates, and that no query path can still retrieve the retired generation's data.
- **Cross-tenant/security tests:** forged tenant-adjacent IDs in requests are rejected server-side even when the request is otherwise well-formed and authenticated as a different, valid tenant.
- **Partial-failure tests:** a batch embedding call that fails for 3 of 100 chunks results in 97 persisted successes and 3 retried/dead-lettered failures, not an all-or-nothing loss.
- **Fixture corpus:** a frozen, versioned multilingual (Arabic/English/mixed) sample corpus checked into the repo (or a fixtures package) for use by this issue's tests **and** published for the retrieval team to build against without needing live extraction/embedding, per the parallel-safety contract.

---

## 13. Repository Structure (proposed, to be validated against actual repo layout)

```
api/src/modules/processing/
  chunking/
    chunker.ts                 # orchestrates strategy selection
    strategies/
      structural.strategy.ts
      paragraph.strategy.ts
      table.strategy.ts
    tokenizers/
      tokenizer.port.ts
      openai-tokenizer.adapter.ts
  indexing/
    generation.service.ts      # owns generation lifecycle: build→verify→activate→retire
    verification.service.ts

api/src/providers/embeddings/
  embedding-provider.port.ts
  openai-embedding.adapter.ts
  fake-embedding.adapter.ts

api/src/providers/vector-index/
  vector-index.port.ts
  atlas-vector-index.adapter.ts
  fake-vector-index.adapter.ts

api/src/providers/keyword-index/
  keyword-index.port.ts
  atlas-keyword-index.adapter.ts
  fake-keyword-index.adapter.ts

api/src/db/models/
  documentChunk.model.ts        # extended, not replaced
  chunkEmbedding.model.ts
  indexGeneration.model.ts

api/src/db/repositories/
  documentChunk.repository.ts
  chunkEmbedding.repository.ts
  indexGeneration.repository.ts

workers/
  chunking.worker.ts
  embedding.worker.ts
  indexing.worker.ts

api/src/modules/retrieval/
  ports/
    search-index.port.ts        # published contract consumed by retrieval, owned here

tests/
  fixtures/corpus/              # frozen multilingual sample documents
  contract/                     # shared fake+real adapter contract tests
  security/                     # cross-tenant, stale-access tests
  golden/chunking/              # golden chunking test cases
```

**Responsibilities, briefly:** `chunking/` owns turning extracted text into chunk candidates; `indexing/generation.service.ts` owns the entire generation state machine (this is the module that enforces "never mark ready until verified"); `providers/*` are the three swappable adapters plus their fakes, isolated from each other so replacing one provider never touches another; `retrieval/ports/search-index.port.ts` is the one file the retrieval team should ever need to import from this issue's work.

---

## 14. Implementation Plan (phased)

**Phase 1 — Schema & Ports (no behavior change)**
- Add `chunkEmbeddings`, `indexGenerations` models/repositories; extend `documentChunk`, `documents`, `processingJobs`.
- Define `EmbeddingProvider`, `VectorIndex`, `KeywordIndex` ports + fakes.
- *Compiles independently:* yes (no callers yet). *Tests:* schema/repository unit tests, fake-adapter contract tests. *Acceptance:* new collections/fields exist, fakes pass contract tests. *Risk:* low. *Complexity:* medium.

**Phase 2 — Chunking Strategy**
- Implement structural/paragraph/table strategies + tokenizer port, golden tests.
- *Depends on:* Phase 1 models only (writes DRAFT chunks). *Tests:* golden chunking suite. *Acceptance:* fixture corpus chunks match golden expectations, offsets/page mapping correct. *Risk:* medium (multilingual edge cases). *Complexity:* large.

**Phase 3 — Embedding Pipeline**
- `OpenAIEmbeddingProvider`, batching/retry/backoff/idempotency, cost/usage events.
- *Depends on:* Phase 1 ports. *Tests:* provider contract tests (fake + real, real gated out of CI), partial-failure tests, idempotency tests. *Acceptance:* re-running on unchanged chunks produces zero new provider calls. *Risk:* medium (rate-limit tuning needs real-world validation). *Complexity:* medium.

**Phase 4 — Atlas Vector Search Integration**
- Index creation/validation on startup, `AtlasVectorIndexAdapter`, filter-field wiring.
- *Depends on:* Phase 3 (needs real vectors to index). *Tests:* contract tests against a real Atlas test cluster (or Atlas local), tenant-filter correctness tests. *Acceptance:* pre-filtered vector search returns only in-tenant, in-generation results. *Risk:* medium-high (Atlas index behavior specifics). *Complexity:* large.

**Phase 5 — Generation Lifecycle & Verification**
- `generation.service.ts`: build → verify counts → activate → retire; rollback path.
- *Depends on:* Phases 2–4. *Tests:* generation-switch, rollback, stale-access, DLQ tests. *Acceptance:* failed verification never activates; stale generation never queryable after switch. *Risk:* high (this is the correctness-critical core). *Complexity:* large.

**Phase 6 — Worker Wiring & Status APIs**
- Wire chunking/embedding/indexing workers to job queue; status/reindex API contracts (routes deliberately not implemented as code in this RFC, but their contracts documented per §14 note below).
- *Depends on:* Phase 5. *Tests:* end-to-end pipeline integration test on fixture corpus. *Acceptance:* a document goes from upload to `searchStatus: READY` through the real (non-fake) pipeline in a test environment. *Risk:* medium. *Complexity:* medium.

**Phase 7 — Security & Multi-Tenant Test Hardening**
- Cross-tenant/privilege-escalation tests, permission-revocation stale-index tests, audit event wiring.
- *Depends on:* Phase 6 (needs a working pipeline to attack). *Tests:* as named. *Acceptance:* all security tests in §12 pass. *Risk:* medium. *Complexity:* medium.

**Phase 8 — Frontend Contracts / Diagnostic UI**
- Processing-status UI contract (loading/empty/validation/permission-denied/network-failure/success states, RTL/LTR, a11y) or explicit documentation that no user-facing UI is needed beyond a diagnostic view, per the issue's own escape hatch.
- *Depends on:* Phase 6 (needs real status API). *Tests:* frontend contract/browser tests. *Acceptance:* documented per issue's UI requirement list. *Risk:* low. *Complexity:* small-medium.

*(Note: API route/controller code and CRUD models are intentionally not designed down to the code level in this document per the issue's explicit "do not write implementation code" instruction — Phase 6/8 above name the contracts that must exist; writing them is implementation, not architecture.)*

---

## 15. Final Review — Self-Critique

**Weaknesses of this design:**
- The single shared Atlas Vector Search index (§5.2) trades per-tenant blast-radius isolation for operational simplicity and scale. If a future compliance requirement mandates *physical* index-level tenant separation (not just filter-based), this design would need a materially different sharding strategy — worth validating against DocuMind's actual compliance targets before committing.
- Generation-based reprocessing (§1, §8) is more storage-heavy than in-place mutation — old generations linger through their grace period, meaning temporarily higher storage cost during reindex/migration windows. This is an intentional trade for correctness, but should be sized against expected reindex frequency.
- Chunking quality is bounded by the quality of structural hints from upstream extraction (§3); if extraction is weak for a given document type, this design degrades to paragraph-packing rather than failing loudly by default — the degradation is logged but not blocking, which is a deliberate choice that a reviewer might reasonably want to make a hard failure instead, depending on how much retrieval quality matters for that document category.
- This RFC assumes the existing `workers/` queue infrastructure supports per-job lease/heartbeat and idempotency-key deduplication (§8, §9). If it doesn't already, that's a prerequisite gap this issue would surface during real discovery, not something this design can fix from outside.

**Why this architecture over the simpler alternatives considered:**
- Vs. in-place chunk mutation: rejected because it cannot satisfy "never expose stale unauthorized chunks" without generation-level atomicity.
- Vs. per-tenant or per-document Atlas indexes: rejected on operational/scale grounds (§5.2), with filter-based isolation covering the same security requirement, provable by tests instead of by index topology.
- Vs. storing vectors embedded on the chunk document: rejected because it couples chunk-schema evolution to embedding/index-schema evolution, blocking clean provider replacement (§4.4).
- Vs. streaming/incremental indexing: rejected because it removes the one clean "is this generation fully verified" checkpoint the acceptance criteria depend on.

**Suggested future improvements (explicitly out of scope for this issue):**
- Hybrid rank fusion between vector and keyword results (placeholder interfaces provided in §6).
- Fine-grained ACL beyond `accessPolicyVersion` (schema reserves the seam in §7.5).
- Per-tenant index sharding if scale requires it (seam reserved in §10's "future scaling" note).

---

*End of RFC. This document intentionally contains no route/controller/model implementation code, per the issue's constraints — it is a design artifact for team review before Phase 1 work begins.*
