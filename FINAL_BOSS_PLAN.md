# FINAL BOSS PLAN
### DocuMind AI — Merged Execution Strategy for Maximum Productivity

**Prepared for:** mahmoudrabbas, omar1175, sohylagomaa, Se7so27, Abdallahadel2004, marcoreda56-bot
**Status:** Master execution document — single source of truth for all remaining work
**Date:** July 14, 2026
**Sources:** NextApproach (01–08) as base, FirstApproach format enhanced

---

## Table of Contents

1. [Comparison Summary](#1-comparison-summary)
2. [Scope Boundary](#2-scope-boundary)
3. [Architecture Decisions (Locked)](#3-architecture-decisions-locked)
4. [Selective Fake Adapters](#4-selective-fake-adapters)
5. [22 Enhanced Feature Issues](#5-22-enhanced-feature-issues)
6. [Team Distribution](#6-team-distribution)
7. [Sprint Plan](#7-sprint-plan)
8. [Dependency Graph](#8-dependency-graph)
9. [Git Workflow & Review Protocol](#9-git-workflow--review-protocol)
10. [Onboarding Checklist](#10-onboarding-checklist)

---

## 1. Comparison Summary

Two planning approaches were analyzed and merged:

### Why NextApproach Won as Base

| Dimension | FirstApproach | NextApproach | Verdict |
|---|---|---|---|
| Scope accuracy | Includes payments/billing/subscriptions/Excel import (NOT in SRS) | Matches actual SRS gap analysis exactly | **NextApproach** |
| Issue sizing | "Large"/"Very Large", no points, no day estimates | 3–13 story points, 2–5 day features | **NextApproach** |
| Issue count | 30 (15+ are scope creep) | 22 (all match real gaps) | **NextApproach** |
| Assignee model | By role type (not individuals) | By GitHub username, balanced 18–22 pts each | **NextApproach** |
| Dependency model | "No blocking via fake adapters" | Explicit graph with hard spine, review ring | **NextApproach** |
| Sprint plan | Waves (vague integration points) | 7 sprints × 2 weeks, demoable per sprint | **NextApproach** |
| Architecture decisions | Not locked | Fully locked (Qdrant, OpenAI, Claude, LangChain) | **NextApproach** |
| Git workflow | Basic guidelines | Detailed branching, PR gates, merge protocol | **NextApproach** |
| Issue detail | 200+ lines, discovery checklists, coding model instructions | Checklist format, phased splitting | **FirstApproach** |
| Parallel-safety pattern | Fake adapters to unblock parallel work | Not explicitly addressed | **FirstApproach** |
| Knowledge sharing | Not specified | Spine rotation + review ring | **NextApproach** |

### What We Took From Each

**From NextApproach (base):**
- 22 Feature Issues matching actual SRS gaps
- Story-point-balanced team distribution (18–22 pts/dev)
- Explicit dependency graph with hard spine
- 7-sprint plan with demoable output per sprint
- Spine rotation model (every dev touches the critical path once)
- Review ring (adjacent developers review each other)
- Locked architecture decisions

**From FirstApproach (enhancement):**
- Enhanced FI format: discovery checklists, coding model instructions, verification commands
- Parallel-safety contract: fake adapters for critical bottlenecks
- Review checklist quality (what a reviewer must verify)
- Coding model workflow (10-step process)
- Definition of Done standard

**Dropped from FirstApproach:**
- Payments, billing, subscriptions, Excel import, email queue (scope creep, not SRS core)
- Agent runtime/supervisor (not in SRS core)
- Wave-based integration checkpoints (NextApproach's sprints are better)
- Role-based assignment (not individual developers)

---

## 2. Scope Boundary

### In Scope (22 Feature Issues, 123 story points)

| Epic | Feature Issues | Points |
|---|---|---|
| **EP1 — Document Intelligence Pipeline** | FI-1.1, FI-1.2, FI-1.3, FI-1.4 | 23 |
| **EP2 — Semantic Retrieval & Knowledge Base** | FI-2.1, FI-2.2, FI-2.3 | 19 |
| **EP3 — Conversational RAG Assistant** | FI-3.1, FI-3.2, FI-3.3, FI-3.4, FI-3.5, FI-3.6 | 39 |
| **EP4 — Knowledge Operations & Analytics** | FI-4.1, FI-4.2, FI-4.3 | 13 |
| **EP5 — Tenant & Workspace Administration** | FI-5.1, FI-5.2 | 6 |
| **EP6 — Platform Foundation & Delivery Readiness** | FI-6.1, FI-6.2, FI-6.3, FI-6.4 | 23 |
| **Total** | **22 FIs** | **123 pts** |

### Out of Scope (FirstApproach extras, NOT in SRS core)

- Payment checkout and webhook synchronization
- Subscription/package domain normalization
- Billing portal, invoices, cancellation, refunds
- Quota enforcement and entitlements
- Excel employee import with AI-assisted mapping
- Email queue, templates, delivery status
- Agent runtime, supervisor, typed tools, tracing
- Intent detection and bilingual query expansion agent
- Metadata, version, and conflict agents
- Document categories and access policies (beyond what EP5 covers)

---

## 3. Architecture Decisions (Locked)

These decisions are binding for every Feature Issue. They were chosen to fit the existing stack (Node.js/Express/Mongoose, Docker Compose, no cloud accounts currently configured).

| Concern | Decision | Rationale |
|---|---|---|
| **Vector store** | **Qdrant**, added as 6th Docker Compose service | SRS allows Mongo Atlas Vector Search *or* Qdrant; no Atlas account exists, Qdrant runs locally, zero new cloud dependency |
| **Embeddings** | OpenAI `text-embedding-3-small` via pluggable `providers/embedding` interface | Fast to integrate, low cost, keeps existing empty-interface contract for provider swap |
| **LLM** | Anthropic Claude via `@langchain/anthropic`, behind `providers/llm` interface | Matches SRS's OpenAI/Claude option; provider abstraction avoids lock-in |
| **Orchestration** | LangChain.js, fixed supervisor sequence per SRS §3.4: `Retrieval → Answer Draft → Compliance → Final Answer` | Explicitly mandated by SRS; governed, not open-ended agentic |
| **Text extraction** | `pdf-parse` (PDF), `mammoth` (DOCX), native read (TXT/MD) | Standard, no new services required |
| **OCR** | `tesseract.js` | SRS-specified fallback for scanned PDFs |
| **Job queue** | BullMQ on existing Redis instance | Redis already running; BullMQ is natural fit for empty `workers/` service |
| **Chunking** | 600–900 tokens per chunk, metadata: `tenant_id`, `document_id`, `page_number`, `section`, `access_roles` | Directly from SRS FR-ING-04/05 |

---

## 4. Selective Fake Adapters

Three fake adapters are injected at critical dependency bottlenecks to enable parallel work. These convert hard dependencies into soft dependencies, allowing FIs to start earlier with stub implementations.

### Adapter 1: FakeEmbeddingAdapter

| Field | Value |
|---|---|
| **Purpose** | Returns fixed-dimension vectors without OpenAI API calls |
| **Unblocks** | FI-2.1 (Embedding + Qdrant) can start before FI-1.2 (Text Extraction) completes |
| **Location** | `api/src/test/fakes/fake-embedding.adapter.ts` |
| **Interface** | Implements `EmbeddingProvider` port from `providers/embedding` |
| **Behavior** | Returns deterministic 1536-dim vectors based on input hash |
| **Contract test** | `embedding.contract.test.ts` — both fake and production adapter must pass |
| **Replacement** | Swap to `openai-embedding.adapter.ts` when FI-1.2 merges |

### Adapter 2: FakeVectorStoreAdapter

| Field | Value |
|---|---|
| **Purpose** | In-memory vector similarity search without Qdrant |
| **Unblocks** | FI-2.2 (Hybrid Search) can start before FI-2.1 (Qdrant Setup) completes |
| **Location** | `api/src/test/fakes/fake-vector-store.adapter.ts` |
| **Interface** | Implements `VectorStore` port from `providers/vector-store` |
| **Behavior** | In-memory cosine similarity over stored vectors; supports basic filtering |
| **Contract test** | `vector-store.contract.test.ts` — both fake and production adapter must pass |
| **Replacement** | Swap to `qdrant.adapter.ts` when FI-2.1 merges |

### Adapter 3: FakeLLMAdapter

| Field | Value |
|---|---|
| **Purpose** | Returns canned responses without Claude API calls |
| **Unblocks** | FI-3.1 (Chat API Skeleton) can start before FI-3.2 (LLM Provider) completes |
| **Location** | `api/src/test/fakes/fake-llm.adapter.ts` |
| **Interface** | Implements `LLMProvider` port from `providers/llm` |
| **Behavior** | Returns template-based answers with mock citations and confidence scores |
| **Contract test** | `llm.contract.test.ts` — both fake and production adapter must pass |
| **Replacement** | Swap to `claude.adapter.ts` when FI-3.2 merges |

### Fake Adapter Rules

1. Every fake adapter ships in the same PR as the FI that needs it
2. Fake adapters are clearly named with `Fake` prefix and `// TODO: Replace with production adapter` comments
3. Contract tests define the interface both fake and production adapters must satisfy
4. No fake adapter is deployed to production — they exist only in test/local environments
5. When a production adapter merges, its owner also updates the DI container to prefer it over the fake

### Impact on Dependency Graph

```
BEFORE (hard dependencies):
FI-1.2 ──hard──→ FI-2.1 ──hard──→ FI-2.2 ──hard──→ FI-3.1

AFTER (soft dependencies via fakes):
FI-1.2 ──soft (FakeEmbeddingAdapter)──→ FI-2.1
FI-2.1 ──soft (FakeVectorStoreAdapter)──→ FI-2.2
FI-3.1 ──soft (FakeLLMAdapter)──→ FI-3.2
```

This enables **3 additional FIs to start in Sprint 2** instead of waiting for upstream merges.

---

## 5. 22 Enhanced Feature Issues

Each FI follows the enhanced format from FirstApproach: discovery checklist, coding model instructions, acceptance criteria, and verification commands.

---

### FI-1.1: Background Job Engine (BullMQ + Redis)

| Field | Value |
|---|---|
| **Epic** | EP1 — Document Intelligence Pipeline |
| **Points** | 5 |
| **Owner** | @mahmoudrabbas |
| **Sprint** | 1 |
| **Depends On** | None |
| **Branch** | `feature/fi-1.1-background-job-engine` |

#### Mission

Bootstrap the background job processing infrastructure using BullMQ on the existing Redis instance, enabling async document processing.

#### Current Repository State

- `workers/` workspace exists but exits immediately, no queue library installed
- Redis is running in Docker Compose but not connected to any job processing
- Document status never leaves `uploaded` — no pipeline to advance it

#### Discovery Checklist

- [ ] Read `workers/package.json` and `workers/src/` — what exists?
- [ ] Inspect `docker-compose.yml` for Redis configuration
- [ ] Check `api/src/db/models/document.model.ts` for status enum values
- [ ] Identify existing BullMQ or queue-related dependencies
- [ ] Run `git status` and record pre-existing changes

#### Coding Model Instructions

1. Install BullMQ in `workers/` workspace
2. Create `DocumentProcessingJob` queue with typed job data (`documentId`, `tenantId`, `uploadedBy`)
3. Implement worker bootstrap that connects to Redis and registers job processors
4. Create job scheduler in API that enqueues processing jobs on document upload
5. Define status state machine: `uploaded → processing → chunking → embedding → ready/failed`
6. Add retry logic with exponential backoff (3 attempts, 1s/2s/4s delays)
7. Add job progress tracking (percentage complete)
8. Add graceful shutdown (drain queues on SIGTERM)
9. Write unit tests for job creation, retry, and failure handling
10. Update Docker Compose to include worker service in CI

#### Acceptance Criteria

- [ ] Worker connects to Redis and processes jobs
- [ ] Document status advances through state machine on processing
- [ ] Failed jobs retry with exponential backoff
- [ ] Worker handles graceful shutdown without losing jobs
- [ ] Unit tests pass for job creation and retry logic
- [ ] `npm run typecheck` passes in `workers/`
- [ ] Docker Compose includes worker service

#### Verification

```bash
cd workers && npm run typecheck
cd workers && npm run test
docker compose up -d redis && npm run dev:worker
# Upload a document via API and verify status advances
```

---

### FI-1.2: Text Extraction + Document Status State Machine Migration

| Field | Value |
|---|---|
| **Epic** | EP1 — Document Intelligence Pipeline |
| **Points** | 8 |
| **Owner** | @omar1175 |
| **Sprint** | 2 |
| **Depends On** | FI-1.1 |
| **Branch** | `feature/fi-1.2-text-extraction` |

#### Mission

Implement text extraction from PDF, DOCX, and TXT files, and migrate the document status enum to support the full processing pipeline.

#### Current Repository State

- Document upload stores files but never extracts text
- Status enum is `uploaded` only — no `processing`, `chunking`, `embedding`, `ready`, `failed`
- No text extraction libraries installed

#### Discovery Checklist

- [ ] Inspect `api/src/modules/documents/` — what services/controllers exist?
- [ ] Check `api/src/db/models/document.model.ts` for current status enum
- [ ] Look for any existing extraction logic in `processing/` module
- [ ] Identify file storage pattern (local disk vs S3)
- [ ] Run `git status` and record pre-existing changes

#### Coding Model Instructions

1. Install `pdf-parse` for PDF extraction, `mammoth` for DOCX
2. Create `TextExtractor` service with `extract(filePath: string): Promise<ExtractedText>` interface
3. Implement `PdfExtractor`, `DocxExtractor`, `TxtExtractor` adapters
4. Migrate document status enum: `uploaded → processing → chunking → embedding → ready/failed`
5. Create database migration for status enum change (backward compatible — existing `uploaded` stays)
6. Wire extraction into BullMQ worker from FI-1.1
7. Handle extraction failures gracefully (set status to `failed`, log error)
8. Add metadata extraction: page count, word count, character count
9. Write unit tests for each extractor adapter
10. Write integration test for full extraction pipeline

#### Acceptance Criteria

- [ ] PDF, DOCX, and TXT files extract text correctly
- [ ] Status enum migrated without breaking existing `uploaded` documents
- [ ] Extraction handles corrupt/invalid files gracefully
- [ ] Metadata (page count, word count) stored with extracted text
- [ ] Unit tests pass for all extractor adapters
- [ ] Integration test shows upload → extraction → status update
- [ ] `npm run typecheck` and `npm run lint` pass

#### Verification

```bash
cd api && npm run typecheck
cd api && npm run test
# Upload a PDF, DOCX, and TXT file
# Verify status advances: uploaded → processing → chunking
# Verify extracted text is stored in document record
```

---

### FI-1.3: OCR Integration (Scanned/Image PDFs)

| Field | Value |
|---|---|
| **Epic** | EP1 — Document Intelligence Pipeline |
| **Points** | 5 |
| **Owner** | @sohylagomaa |
| **Sprint** | 3 |
| **Depends On** | FI-1.2 |
| **Branch** | `feature/fi-1.3-ocr-integration` |

#### Mission

Add OCR fallback for scanned/image-based PDFs using `tesseract.js`, triggered when text extraction returns minimal content.

#### Discovery Checklist

- [ ] Review FI-1.2's `TextExtractor` interface — where does OCR slot in?
- [ ] Check if `tesseract.js` is already in `package.json`
- [ ] Identify detection logic for scanned vs text-based PDFs
- [ ] Run `git status` and record pre-existing changes

#### Coding Model Instructions

1. Install `tesseract.js` in `api/`
2. Create `OcrAdapter` implementing the `TextExtractor` port
3. Add detection logic: if extracted text < 50 chars per page, trigger OCR
4. Implement page-by-page OCR with language detection (English + Arabic)
5. Merge OCR text with existing extraction pipeline
6. Add configuration for OCR language packs
7. Handle OCR failures gracefully (log warning, continue with partial text)
8. Write unit tests for OCR detection and extraction
9. Write integration test with a scanned PDF fixture
10. Update Docker Compose to include tesseract language data

#### Acceptance Criteria

- [ ] Scanned PDFs trigger OCR automatically
- [ ] OCR extracts text from image-based pages
- [ ] Language detection works for English and Arabic
- [ ] OCR failures don't crash the pipeline
- [ ] Unit tests pass for OCR detection logic
- [ ] Integration test with scanned PDF fixture passes
- [ ] `npm run typecheck` passes

#### Verification

```bash
cd api && npm run typecheck
cd api && npm run test
# Upload a scanned PDF
# Verify OCR is triggered and text is extracted
# Verify status advances through pipeline
```

---

### FI-1.4: Chunking Engine + `documentChunk` Schema

| Field | Value |
|---|---|
| **Epic** | EP1 — Document Intelligence Pipeline |
| **Points** | 5 |
| **Owner** | @sohylagomaa |
| **Sprint** | 3 |
| **Depends On** | FI-1.2 |
| **Branch** | `feature/fi-1.4-chunking-engine` |

#### Mission

Implement semantic chunking that splits extracted text into 600–900 token chunks with metadata, and create the `documentChunk` schema.

#### Discovery Checklist

- [ ] Review FI-1.2's extracted text output format
- [ ] Check `api/src/db/models/` for existing `documentChunk.model.ts`
- [ ] Identify chunking strategy from SRS FR-ING-04/05
- [ ] Import `accessRoles` enum from FI-5.1 (ships first, per `03` §6)
- [ ] Run `git status` and record pre-existing changes

#### Coding Model Instructions

1. Create `documentChunk.model.ts` with fields: `documentId`, `tenantId`, `chunkIndex`, `content`, `tokenCount`, `pageNumber`, `section`, `accessRoles`, `embedding` (placeholder)
2. Implement `ChunkingService` with `chunk(text, metadata): Promise<Chunk[]>` interface
3. Use sliding window approach: 600–900 tokens per chunk, 100-token overlap
4. Preserve page breaks and section headers as chunk boundaries
5. Store chunks in MongoDB with tenant isolation
6. Wire chunking into BullMQ worker after extraction
7. Add chunk count and token stats to document record
8. Write unit tests for chunking logic (edge cases: empty text, very long paragraphs)
9. Write integration test for full pipeline: upload → extract → chunk
10. Create database index on `documentChunk(documentId, tenantId)`

#### Acceptance Criteria

- [ ] Documents chunk into 600–900 token pieces
- [ ] Chunks preserve page/section metadata
- [ ] `accessRoles` field uses same enum as FI-5.1
- [ ] Chunks stored with tenant isolation
- [ ] Unit tests pass for chunking edge cases
- [ ] Integration test shows full pipeline flow
- [ ] Database index exists for efficient queries

#### Verification

```bash
cd api && npm run typecheck
cd api && npm run test
# Upload a multi-page document
# Verify chunks are created with correct metadata
# Verify chunk count and token stats in document record
```

---

### FI-2.1: Embedding Provider + Qdrant Setup + Embedding Job

| Field | Value |
|---|---|
| **Epic** | EP2 — Semantic Retrieval & Knowledge Base |
| **Points** | 8 |
| **Owner** | @Se7so27 |
| **Sprint** | 4 |
| **Depends On** | FI-1.4 |
| **Branch** | `feature/fi-2.1-embedding-qdrant` |

#### Mission

Set up OpenAI embedding generation, Qdrant vector store, and the embedding job that indexes chunks into Qdrant.

#### Current Repository State

- No vector database configured
- No embedding provider installed
- `providers/embedding/` is empty stubs

#### Discovery Checklist

- [ ] Inspect `api/src/providers/embedding/` — what interfaces exist?
- [ ] Check `docker-compose.yml` for Qdrant service (needs to be added)
- [ ] Review FI-1.4's chunk schema for embedding field
- [ ] Identify OpenAI API key configuration pattern
- [ ] Run `git status` and record pre-existing changes

#### Coding Model Instructions

1. Add Qdrant service to Docker Compose (port 6333)
2. Install `@qdrant/js-client-rest` and `openai` packages
3. Implement `OpenAiEmbeddingAdapter` implementing `EmbeddingProvider` port
4. Implement `QdrantVectorStoreAdapter` implementing `VectorStore` port
5. Create Qdrant collection with 1536-dim vectors (text-embedding-3-small)
6. Create embedding job: fetch chunks → generate embeddings → upsert to Qdrant
7. Wire embedding job into BullMQ worker after chunking
8. Add tenant-aware collection or payload filtering for multi-tenancy
9. Write contract tests for embedding and vector store adapters
10. Write integration test for full pipeline: chunk → embed → index

#### Acceptance Criteria

- [ ] Qdrant runs in Docker Compose
- [ ] OpenAI embeddings generate 1536-dim vectors
- [ ] Chunks indexed in Qdrant with tenant metadata
- [ ] Embedding job processes all chunks for a document
- [ ] Contract tests pass for both adapters
- [ ] Integration test shows chunk → embed → index flow
- [ ] Multi-tenant filtering works correctly

#### Verification

```bash
docker compose up -d qdrant
cd api && npm run typecheck
cd api && npm run test
# Upload a document through full pipeline
# Verify chunks appear in Qdrant with embeddings
# Query Qdrant directly to verify vector storage
```

---

### FI-2.2: Hybrid Search & Tenant/Role-Filtered Retrieval API

| Field | Value |
|---|---|
| **Epic** | EP2 — Semantic Retrieval & Knowledge Base |
| **Points** | 8 |
| **Owner** | @Abdallahadel2004 |
| **Sprint** | 5 |
| **Depends On** | FI-2.1 |
| **Branch** | `feature/fi-2.2-hybrid-search` |

#### Mission

Implement hybrid (vector + keyword) search with tenant/role-filtered retrieval through a proper API endpoint.

#### Discovery Checklist

- [ ] Review FI-2.1's Qdrant adapter interface
- [ ] Check `api/src/modules/retrieval/` — what exists?
- [ ] Identify search API route patterns from existing modules
- [ ] Review access control patterns from `authorization.middleware.ts`
- [ ] Run `git status` and record pre-existing changes

#### Coding Model Instructions

1. Create `RetrievalService` with `search(query, tenantId, userRoles): Promise<SearchResult[]>` interface
2. Implement vector search using Qdrant similarity
3. Implement keyword search using MongoDB text index
4. Combine results with reciprocal rank fusion (RRF)
5. Add tenant filtering (mandatory) and role-based filtering (access_roles)
6. Create REST endpoint: `POST /api/v1/retrieval/search`
7. Add request validation (query length, tenant context)
8. Implement result ranking with similarity scores
9. Write unit tests for search logic and filtering
10. Write integration test for end-to-end search flow

#### Acceptance Criteria

- [ ] Hybrid search returns relevant results
- [ ] Tenant isolation enforced (can't see other tenants' chunks)
- [ ] Role-based filtering works (access_roles respected)
- [ ] API endpoint validates input and returns proper errors
- [ ] Search results include similarity scores
- [ ] Unit tests pass for search and filtering logic
- [ ] Integration test shows search across indexed documents

#### Verification

```bash
cd api && npm run typecheck
cd api && npm run test
# Index documents via full pipeline
# Search via API and verify results
# Verify tenant isolation (search as different tenant)
# Verify role filtering (search with different access roles)
```

---

### FI-2.3: Reranking

| Field | Value |
|---|---|
| **Epic** | EP2 — Semantic Retrieval & Knowledge Base |
| **Points** | 3 |
| **Owner** | @Se7so27 |
| **Sprint** | 5 |
| **Depends On** | FI-2.2 |
| **Branch** | `feature/fi-2.3-reranking` |

#### Mission

Add a reranking step to improve retrieval quality by re-scoring top-k results with a more sophisticated model.

#### Discovery Checklist

- [ ] Review FI-2.2's search result format
- [ ] Identify reranking provider options (Cohere, cross-encoder, or custom)
- [ ] Check SRS for reranking requirements
- [ ] Run `git status` and record pre-existing changes

#### Coding Model Instructions

1. Create `Reranker` interface with `rerank(query, results): Promise<RerankedResult[]>` interface
2. Implement cross-encoder reranking using a lightweight model
3. Add reranking step after initial hybrid search
4. Configure top-k reduction (e.g., 20 → 5 results)
5. Add fallback: if reranker fails, return original ranking
6. Write unit tests for reranking logic
7. Write integration test comparing results with/without reranking

#### Acceptance Criteria

- [ ] Reranking improves result quality (measured by relevance)
- [ ] Top-k reduction works correctly
- [ ] Reranker failure doesn't break search
- [ ] Unit tests pass for reranking logic
- [ ] Integration test shows quality improvement

#### Verification

```bash
cd api && npm run typecheck
cd api && npm run test
# Search with and without reranking
# Compare result quality
# Verify graceful fallback on reranker failure
```

---

### FI-3.1: Conversation & Message Data Layer + Chat API Skeleton

| Field | Value |
|---|---|
| **Epic** | EP3 — Conversational RAG Assistant |
| **Points** | 5 |
| **Owner** | @marcoreda56-bot |
| **Sprint** | 1 |
| **Depends On** | None |
| **Branch** | `feature/fi-3.1-chat-api-skeleton` |

#### Mission

Create the conversation/message data models and a chat API skeleton that can accept questions and return placeholder answers.

#### Current Repository State

- `conversation.model.ts` and `message.model.ts` are 0-byte stubs
- `chat/` module is empty
- No chat API routes exist

#### Discovery Checklist

- [ ] Inspect `api/src/db/models/conversation.model.ts` and `message.model.ts`
- [ ] Check `api/src/modules/chat/` for existing structure
- [ ] Review existing API route patterns for consistency
- [ ] Identify authentication middleware patterns
- [ ] Run `git status` and record pre-existing changes

#### Coding Model Instructions

1. Create `conversation.model.ts` with fields: `title`, `tenantId`, `createdBy`, `documentIds`, `createdAt`, `updatedAt`
2. Create `message.model.ts` with fields: `conversationId`, `role`, `content`, `citations`, `confidence`, `refusalReason`, `createdAt`
3. Implement `ChatService` with `createConversation`, `addMessage`, `getConversation` methods
4. Create REST endpoints: `POST /api/v1/chat/conversations`, `GET /api/v1/chat/conversations/:id`, `POST /api/v1/chat/conversations/:id/messages`
5. Add tenant scoping to all queries
6. Use `FakeLLMAdapter` for placeholder answers (see Section 4)
7. Add request validation for message content
8. Write unit tests for conversation/message CRUD
9. Write integration test for chat flow
10. Create database indexes for efficient queries

#### Acceptance Criteria

- [ ] Conversation and message models are complete
- [ ] Chat API accepts questions and returns placeholder answers
- [ ] Tenant isolation enforced on all endpoints
- [ ] Conversation history is retrievable
- [ ] Unit tests pass for CRUD operations
- [ ] Integration test shows full chat flow
- [ ] Database indexes exist for performance

#### Verification

```bash
cd api && npm run typecheck
cd api && npm run test
# Create a conversation via API
# Send a message and receive placeholder answer
# Retrieve conversation history
# Verify tenant isolation
```

---

### FI-3.2: LLM Provider + Supervisor Workflow

| Field | Value |
|---|---|
| **Epic** | EP3 — Conversational RAG Assistant |
| **Points** | 13 |
| **Owner** | @marcoreda56-bot |
| **Sprint** | 5–6 |
| **Depends On** | FI-2.2, FI-3.1 |
| **Branch** | `feature/fi-3.2-llm-supervisor` |

#### Mission

Implement the LLM provider integration and supervisor workflow: Retrieval → Answer Draft → Compliance → Final Answer. This is the largest and most critical issue.

#### Discovery Checklist

- [ ] Review FI-3.1's chat API skeleton
- [ ] Review FI-2.2's retrieval API
- [ ] Inspect `api/src/providers/llm/` — what interfaces exist?
- [ ] Check SRS §3.4 for supervisor workflow specification
- [ ] Identify LangChain.js integration points
- [ ] Run `git status` and record pre-existing changes

#### Coding Model Instructions

1. Install `@langchain/anthropic` and `langchain` packages
2. Implement `ClaudeAdapter` implementing `LLMProvider` port
3. Create `SupervisorWorkflow` with 4 stages:
   - **Retrieval**: Call FI-2.2's search API with the user query
   - **Answer Draft**: Generate initial answer from retrieved context
   - **Compliance**: Check answer against tenant policies, detect hallucinations
   - **Final Answer**: Format answer with citations and confidence score
4. Wire supervisor into chat API (replace `FakeLLMAdapter`)
5. Implement streaming responses using Server-Sent Events (SSE)
6. Add token counting and cost tracking per LLM call
7. Integrate with FI-4.2's usage logging schema
8. Handle LLM failures gracefully (retry, fallback to refusal)
9. Write unit tests for each supervisor stage
10. Write integration test for full supervisor workflow

#### Acceptance Criteria

- [ ] Claude integration works via LangChain.js
- [ ] Supervisor workflow executes all 4 stages
- [ ] Streaming responses work in real-time
- [ ] Token/cost tracking accurate
- [ ] LLM failures handled gracefully
- [ ] Unit tests pass for each stage
- [ ] Integration test shows end-to-end workflow
- [ ] Answer includes citations and confidence score

#### Verification

```bash
cd api && npm run typecheck
cd api && npm run test
# Index documents via full pipeline
# Send a chat message
# Verify streaming response with citations
# Verify token/cost tracking in usage logs
# Test LLM failure scenario
```

---

### FI-3.3: Refusal Mode + Prompt-Injection Guarding

| Field | Value |
|---|---|
| **Epic** | EP3 — Conversational RAG Assistant |
| **Points** | 5 |
| **Owner** | @mahmoudrabbas |
| **Sprint** | 6 |
| **Depends On** | FI-3.2 |
| **Branch** | `feature/fi-3.3-refusal-mode` |

#### Mission

Implement refusal mode for out-of-scope questions and prompt-injection detection.

#### Discovery Checklist

- [ ] Review FI-3.2's supervisor workflow output format
- [ ] Check SRS for refusal mode requirements (FR-GAP-01)
- [ ] Identify prompt-injection detection patterns
- [ ] Run `git status` and record pre-existing changes

#### Coding Model Instructions

1. Create `RefusalDetector` service with `detect(query, context): Promise<RefusalResult>` interface
2. Implement out-of-scope detection (no relevant context found)
3. Implement prompt-injection detection (attempted jailbreaks, role-play attacks)
4. Add refusal response template with polite decline message
5. Log refused queries for knowledge gap analysis
6. Wire refusal detector into supervisor workflow (after retrieval, before drafting)
7. Add configuration for refusal thresholds
8. Write unit tests for detection logic
9. Write integration test with various attack vectors

#### Acceptance Criteria

- [ ] Out-of-scope questions trigger refusal
- [ ] Prompt-injection attempts detected and blocked
- [ ] Refused queries logged for analysis
- [ ] Refusal responses are user-friendly
- [ ] Unit tests pass for detection logic
- [ ] Integration test shows various attack scenarios

#### Verification

```bash
cd api && npm run typecheck
cd api && npm run test
# Send out-of-scope question → verify refusal
# Send prompt-injection attempt → verify block
# Verify refused queries appear in knowledge gaps
```

---

### FI-3.4: Citations (Source/Page/Section Attachment)

| Field | Value |
|---|---|
| **Epic** | EP3 — Conversational RAG Assistant |
| **Points** | 5 |
| **Owner** | @omar1175 |
| **Sprint** | 6 |
| **Depends On** | FI-3.2 |
| **Branch** | `feature/fi-3.4-citations` |

#### Mission

Attach source, page, and section citations to chat answers with compliance verification.

#### Discovery Checklist

- [ ] Review FI-3.2's answer output format
- [ ] Check `api/src/db/models/citation.model.ts` — what exists?
- [ ] Identify citation data available from retrieval results
- [ ] Run `git status` and record pre-existing changes

#### Coding Model Instructions

1. Create `CitationService` with `attachCitations(answer, chunks): Promise<Citation[]>` interface
2. Extract source document, page number, and section from chunk metadata
3. Add compliance verification (citation actually supports the claim)
4. Store citations in `citation.model.ts` with proper schema
5. Include citations in chat message response
6. Add citation confidence scoring
7. Wire citation service into supervisor workflow (after compliance stage)
8. Write unit tests for citation extraction and verification
9. Write integration test for citation accuracy

#### Acceptance Criteria

- [ ] Answers include accurate citations
- [ ] Citations reference correct source, page, section
- [ ] Compliance verification ensures citations support claims
- [ ] Citations stored in database
- [ ] Unit tests pass for citation logic
- [ ] Integration test shows citation accuracy

#### Verification

```bash
cd api && npm run typecheck
cd api && npm run test
# Send a chat question
# Verify answer includes citations
# Verify citations reference correct documents
# Verify compliance check catches unsupported claims
```

---

### FI-3.5: Chat Frontend (Streaming UI, Conversation History)

| Field | Value |
|---|---|
| **Epic** | EP3 — Conversational RAG Assistant |
| **Points** | 8 |
| **Owner** | @sohylagomaa |
| **Sprint** | 1 (shell) → 6 (wiring) |
| **Depends On** | FI-3.1 (shell) / FI-3.2 (wiring) |
| **Branch** | `feature/fi-3.5-chat-frontend` |

#### Mission

Build the chat UI with streaming responses, conversation history, and document selection.

#### Current Repository State

- `/chat` page exists but is empty
- No chat components exist

#### Discovery Checklist

- [ ] Inspect `app/src/app/(dashboard)/chat/` — what exists?
- [ ] Review existing UI component patterns (shadcn/ui)
- [ ] Check i18n setup for chat namespace
- [ ] Run `git status` and record pre-existing changes

#### Coding Model Instructions

**Sprint 1 (Shell Phase):**
1. Create chat layout with sidebar (conversation list) and main area (message list + input)
2. Implement conversation list with create/delete actions
3. Add message input with send button
4. Create placeholder message bubbles (no real data yet)
5. Add loading and empty states

**Sprint 6 (Wiring Phase):**
6. Wire to real chat API endpoints
7. Implement streaming responses using SSE
8. Add citation display (clickable source links)
9. Implement conversation history navigation
10. Add responsive design and RTL/LTR support

#### Acceptance Criteria

- [ ] Chat UI displays conversations and messages
- [ ] Streaming responses display in real-time
- [ ] Citations are clickable and show source details
- [ ] Conversation history is navigable
- [ ] Responsive on mobile and desktop
- [ ] RTL/LTR layouts work correctly
- [ ] Loading, empty, and error states implemented

#### Verification

```bash
cd app && npm run typecheck
cd app && npm run build
# Open chat page in browser
# Create a new conversation
# Send a message and see streaming response
# Click citations to view source
# Test on mobile viewport
```

---

### FI-3.6: Feedback Capture (Thumbs Up/Down)

| Field | Value |
|---|---|
| **Epic** | EP3 — Conversational RAG Assistant |
| **Points** | 3 |
| **Owner** | @sohylagomaa |
| **Sprint** | 7 |
| **Depends On** | FI-3.1, FI-3.5 |
| **Branch** | `feature/fi-3.6-feedback-capture` |

#### Mission

Add thumbs up/down feedback on chat answers for quality tracking.

#### Discovery Checklist

- [ ] Review FI-3.5's message component structure
- [ ] Check `api/src/modules/feedback/` — what exists?
- [ ] Identify feedback data model requirements
- [ ] Run `git status` and record pre-existing changes

#### Coding Model Instructions

1. Create `feedback.model.ts` with fields: `messageId`, `userId`, `rating` (up/down), `comment`, `createdAt`
2. Create `FeedbackService` with `submitFeedback`, `getFeedbackStats` methods
3. Add REST endpoints: `POST /api/v1/chat/messages/:id/feedback`
4. Add thumbs up/down buttons to message component
5. Store feedback with message reference
6. Add feedback aggregation for analytics
7. Write unit tests for feedback CRUD
8. Write integration test for feedback flow

#### Acceptance Criteria

- [ ] Thumbs up/down buttons appear on messages
- [ ] Feedback stored in database
- [ ] Feedback aggregation works for analytics
- [ ] Unit tests pass for feedback logic
- [ ] Integration test shows feedback flow

#### Verification

```bash
cd api && npm run typecheck && npm run test
cd app && npm run build
# Send a chat message
# Click thumbs up/down
# Verify feedback stored
# Verify feedback appears in analytics
```

---

### FI-4.1: Knowledge Gap Detection + Admin Reporting

| Field | Value |
|---|---|
| **Epic** | EP4 — Knowledge Operations & Analytics |
| **Points** | 5 |
| **Owner** | @mahmoudrabbas |
| **Sprint** | 7 |
| **Depends On** | FI-3.3 |
| **Branch** | `feature/fi-4.1-knowledge-gap-detection` |

#### Mission

Detect knowledge gaps from refused queries and provide admin reporting.

#### Discovery Checklist

- [ ] Review FI-3.3's refusal logging format
- [ ] Check `api/src/modules/knowledge-gaps/` — what exists?
- [ ] Check `app/src/app/(dashboard)/knowledge-gaps/` — what exists?
- [ ] Run `git status` and record pre-existing changes

#### Coding Model Instructions

1. Create `knowledgeGap.model.ts` with fields: `query`, `refusalCount`, `tenantId`, `lastSeen`, `status`
2. Implement `KnowledgeGapService` with `detect`, `report`, `resolve` methods
3. Aggregate refused queries into knowledge gaps
4. Create admin dashboard showing top knowledge gaps
5. Add REST endpoints for gap reporting
6. Add resolution workflow (mark as resolved, add to knowledge base)
7. Write unit tests for gap detection logic
8. Write integration test for reporting flow

#### Acceptance Criteria

- [ ] Refused queries aggregated into knowledge gaps
- [ ] Admin dashboard shows top gaps by frequency
- [ ] Resolution workflow works end-to-end
- [ ] Unit tests pass for detection logic
- [ ] Integration test shows reporting flow

#### Verification

```bash
cd api && npm run typecheck && npm run test
cd app && npm run build
# Send queries that trigger refusals
# Verify knowledge gaps appear in admin dashboard
# Resolve a gap and verify it's marked complete
```

---

### FI-4.2: Usage Logging Extension (Token/Cost/Latency Fields)

| Field | Value |
|---|---|
| **Epic** | EP4 — Knowledge Operations & Analytics |
| **Points** | 3 |
| **Owner** | @marcoreda56-bot |
| **Sprint** | 1 (schema) → 5–6 (full) |
| **Depends On** | None (schema early) / FI-3.2 (full instrumentation) |
| **Branch** | `feature/fi-4.2-usage-logging` |

#### Mission

Extend usage logging with token count, cost, and latency fields for LLM call tracking.

#### Discovery Checklist

- [ ] Check `api/src/modules/analytics/` — what exists?
- [ ] Review existing logging patterns
- [ ] Identify LLM call instrumentation points
- [ ] Run `git status` and record pre-existing changes

#### Coding Model Instructions

**Sprint 1 (Schema Phase):**
1. Create `usageLog.model.ts` with fields: `tenantId`, `userId`, `eventType`, `tokenCount`, `cost`, `latencyMs`, `model`, `timestamp`
2. Create database indexes for efficient queries
3. Define logging event contract for FI-3.2 to implement

**Sprint 5–6 (Full Phase):**
4. Wire logging into FI-3.2's LLM calls
5. Add cost calculation based on model pricing
6. Add latency tracking for each LLM call
7. Write unit tests for logging logic
8. Write integration test for end-to-end logging

#### Acceptance Criteria

- [ ] Usage logs capture token count, cost, latency
- [ ] Logging works for all LLM calls
- [ ] Cost calculation accurate
- [ ] Unit tests pass for logging logic
- [ ] Integration test shows logging flow

#### Verification

```bash
cd api && npm run typecheck && npm run test
# Send chat messages
# Verify usage logs contain token/cost/latency data
# Query usage logs via API
```

---

### FI-4.3: Analytics Dashboard (Query API + UI)

| Field | Value |
|---|---|
| **Epic** | EP4 — Knowledge Operations & Analytics |
| **Points** | 5 |
| **Owner** | @omar1175 |
| **Sprint** | 7 |
| **Depends On** | FI-4.2 |
| **Branch** | `feature/fi-4.3-analytics-dashboard` |

#### Mission

Build the analytics dashboard showing usage trends, token/cost/latency metrics.

#### Discovery Checklist

- [ ] Review FI-4.2's usage log schema
- [ ] Check `app/src/app/(dashboard)/analytics/` — what exists?
- [ ] Identify chart library (Recharts, Chart.js, etc.)
- [ ] Run `git status` and record pre-existing changes

#### Coding Model Instructions

1. Create `AnalyticsService` with `getUsageStats`, `getCostTrends`, `getLatencyMetrics` methods
2. Add REST endpoints for analytics queries
3. Build dashboard UI with charts and tables
4. Add date range filtering
5. Add tenant-scoped analytics
6. Implement responsive design
7. Write unit tests for analytics queries
8. Write integration test for dashboard flow

#### Acceptance Criteria

- [ ] Dashboard displays usage trends
- [ ] Charts show token/cost/latency metrics
- [ ] Date range filtering works
- [ ] Tenant isolation enforced
- [ ] Unit tests pass for analytics queries
- [ ] Integration test shows dashboard flow

#### Verification

```bash
cd api && npm run typecheck && npm run test
cd app && npm run build
# Open analytics page in browser
# Verify charts display data
# Filter by date range
# Verify tenant isolation
```

---

### FI-5.1: Document Replace Endpoint + `Document.accessRoles` Field

| Field | Value |
|---|---|
| **Epic** | EP5 — Tenant & Workspace Administration |
| **Points** | 3 |
| **Owner** | @Se7so27 |
| **Sprint** | 1 |
| **Depends On** | None |
| **Branch** | `feature/fi-5.1-document-replace-access-roles` |

#### Mission

Add document replace endpoint and `accessRoles` field to Document schema. Ships the shared roles enum FI-1.4 will import.

#### Discovery Checklist

- [ ] Review `api/src/db/models/document.model.ts` for current schema
- [ ] Check existing document CRUD endpoints
- [ ] Identify access roles enum requirements
- [ ] Run `git status` and record pre-existing changes

#### Coding Model Instructions

1. Add `accessRoles` field to Document schema (array of role strings)
2. Create `DocumentReplaceService` with `replace(documentId, newFile)` method
3. Add REST endpoint: `PUT /api/v1/documents/:id/replace`
4. Implement file replacement with status reset to `uploaded`
5. Create shared `AccessRoles` enum for use across FIs
6. Add validation for access roles
7. Write unit tests for replace logic
8. Write integration test for replace flow

#### Acceptance Criteria

- [ ] Document replace endpoint works
- [ ] `accessRoles` field added to schema
- [ ] Shared enum available for other FIs
- [ ] Unit tests pass for replace logic
- [ ] Integration test shows replace flow

#### Verification

```bash
cd api && npm run typecheck && npm run test
# Replace a document via API
# Verify status resets to uploaded
# Verify accessRoles field is queryable
```

---

### FI-5.2: Tenant Self-Service Settings (Workspace + Profile)

| Field | Value |
|---|---|
| **Epic** | EP5 — Tenant & Workspace Administration |
| **Points** | 3 |
| **Owner** | @omar1175 |
| **Sprint** | 1 |
| **Depends On** | None |
| **Branch** | `feature/fi-5.2-tenant-settings` |

#### Mission

Build tenant self-service settings page for workspace and profile management.

#### Discovery Checklist

- [ ] Check `app/src/app/(dashboard)/settings/` — what exists?
- [ ] Review existing settings UI patterns
- [ ] Identify tenant settings fields from SRS
- [ ] Run `git status` and record pre-existing changes

#### Coding Model Instructions

1. Create settings page with tabs: Workspace, Profile
2. Implement workspace settings: name, logo, default language
3. Implement profile settings: name, email, password
4. Add REST endpoints for settings CRUD
5. Add form validation and error handling
6. Implement responsive design
7. Write unit tests for settings logic
8. Write integration test for settings flow

#### Acceptance Criteria

- [ ] Settings page displays workspace and profile info
- [ ] Settings can be updated
- [ ] Form validation works
- [ ] Responsive on mobile
- [ ] Unit tests pass for settings logic
- [ ] Integration test shows settings flow

#### Verification

```bash
cd app && npm run typecheck && npm run build
# Open settings page in browser
# Update workspace name
# Update profile info
# Verify changes persist
```

---

### FI-6.1: i18n Completion (7 Namespaces)

| Field | Value |
|---|---|
| **Epic** | EP6 — Platform Foundation & Delivery Readiness |
| **Points** | 8 |
| **Owner** | @Se7so27 |
| **Sprint** | 1 (ongoing) → 7 (close) |
| **Depends On** | None |
| **Branch** | `feature/fi-6.1-i18n-completion` |

#### Mission

Complete i18n translation for all 7 missing namespaces: `chat`, `analytics`, `knowledge-gaps`, `settings`, `retrieval`, `processing`, `citations`.

#### Discovery Checklist

- [ ] Review existing i18n setup in `app/src/i18n/`
- [ ] Check which namespaces already exist
- [ ] Identify translation keys needed per namespace
- [ ] Run `git status` and record pre-existing changes

#### Coding Model Instructions

**Rolling approach — sub-slices land per epic as each frontend ships:**
1. Create `chat` namespace (Sprint 1, shell phase)
2. Create `settings` namespace (Sprint 1)
3. Create `processing` namespace (Sprint 2)
4. Create `retrieval` namespace (Sprint 4)
5. Create `citations` namespace (Sprint 6)
6. Create `analytics` namespace (Sprint 7)
7. Create `knowledge-gaps` namespace (Sprint 7)
8. Verify all namespaces have English and Arabic translations
9. Run i18n lint to catch missing keys

#### Acceptance Criteria

- [ ] All 7 namespaces have English translations
- [ ] All 7 namespaces have Arabic translations
- [ ] No missing translation keys
- [ ] RTL/LTR layouts work correctly
- [ ] i18n lint passes

#### Verification

```bash
cd app && npm run build
# Switch language in UI
# Verify all text translates correctly
# Verify RTL layout for Arabic
```

---

### FI-6.2: Production Dockerfiles + Worker CI Job

| Field | Value |
|---|---|
| **Epic** | EP6 — Platform Foundation & Delivery Readiness |
| **Points** | 5 |
| **Owner** | @Abdallahadel2004 |
| **Sprint** | 1 |
| **Depends On** | None |
| **Branch** | `feature/fi-6.2-production-dockerfiles` |

#### Mission

Create production Dockerfiles for API, App, and Worker services, plus CI job for worker builds.

#### Discovery Checklist

- [ ] Review existing `Dockerfile` patterns
- [ ] Check `.github/workflows/ci.yml` for CI structure
- [ ] Identify production vs development differences
- [ ] Run `git status` and record pre-existing changes

#### Coding Model Instructions

1. Create multi-stage Dockerfile for `api/` (build → production)
2. Create multi-stage Dockerfile for `app/` (build → production)
3. Create multi-stage Dockerfile for `workers/` (build → production)
4. Add CI job for worker build and test
5. Optimize image sizes (alpine base, layer caching)
6. Add health check endpoints
7. Document deployment process
8. Write Docker Compose production override

#### Acceptance Criteria

- [ ] All 3 Dockerfiles build successfully
- [ ] CI job runs worker tests
- [ ] Production images are optimized
- [ ] Health checks work
- [ ] Documentation updated

#### Verification

```bash
docker build -t documind-api ./api
docker build -t documind-app ./app
docker build -t documind-workers ./workers
# Verify images start and respond to health checks
```

---

### FI-6.3: Security Hardening (CSRF, Account Lockout, CSP)

| Field | Value |
|---|---|
| **Epic** | EP6 — Platform Foundation & Delivery Readiness |
| **Points** | 5 |
| **Owner** | @Abdallahadel2004 |
| **Sprint** | 1 |
| **Depends On** | None |
| **Branch** | `feature/fi-6.3-security-hardening` |

#### Mission

Add CSRF protection, account lockout after failed attempts, and Content Security Policy headers.

#### Discovery Checklist

- [ ] Review existing middleware stack in `api/src/common/middlewares/`
- [ ] Check for existing CSRF or security headers
- [ ] Identify rate limiting patterns
- [ ] Run `git status` and record pre-existing changes

#### Coding Model Instructions

1. Add CSRF middleware for state-changing endpoints
2. Implement account lockout after 5 failed login attempts
3. Add CSP headers via helmet or custom middleware
4. Add security headers (X-Content-Type-Options, X-Frame-Options, etc.)
5. Add lockout recovery mechanism (time-based or admin reset)
6. Write unit tests for each security control
7. Write integration test for lockout flow

#### Acceptance Criteria

- [ ] CSRF tokens required for state-changing requests
- [ ] Account locks after 5 failed attempts
- [ ] CSP headers present on all responses
- [ ] Lockout recovery works
- [ ] Unit tests pass for security controls
- [ ] Integration test shows lockout flow

#### Verification

```bash
cd api && npm run typecheck && npm run test
# Attempt 5 failed logins → verify account locked
# Verify CSRF token required for POST/PUT/DELETE
# Verify CSP headers in response
```

---

### FI-6.4: Monitoring & Observability (Basic APM/Metrics)

| Field | Value |
|---|---|
| **Epic** | EP6 — Platform Foundation & Delivery Readiness |
| **Points** | 5 |
| **Owner** | @mahmoudrabbas |
| **Sprint** | 2 (scaffolding) → 7 (finalize) |
| **Depends On** | None |
| **Branch** | `feature/fi-6.4-monitoring` |

#### Mission

Add basic APM and metrics for job engine, LLM calls, and API performance.

#### Discovery Checklist

- [ ] Check existing logging/monitoring setup
- [ ] Review FI-1.1's job engine for instrumentation points
- [ ] Review FI-3.2's LLM calls for instrumentation points
- [ ] Run `git status` and record pre-existing changes

#### Coding Model Instructions

**Sprint 2 (Scaffolding):**
1. Add job engine metrics (jobs processed, failed, retry count)
2. Create `/metrics` endpoint for Prometheus scraping
3. Add basic request duration logging

**Sprint 7 (Finalize):**
4. Add LLM call metrics (tokens, cost, latency)
5. Add error rate tracking
6. Create basic dashboard for monitoring
7. Write unit tests for metrics collection

#### Acceptance Criteria

- [ ] Job engine metrics available
- [ ] LLM call metrics available
- [ ] `/metrics` endpoint works
- [ ] Basic dashboard shows key metrics
- [ ] Unit tests pass for metrics

#### Verification

```bash
cd api && npm run typecheck && npm run test
# Process documents via pipeline
# Query /metrics endpoint
# Verify job and LLM metrics present
```

---

## 6. Team Distribution

### Per-Developer Workload Summary

| Developer | Feature Issues | Points | Epics Touched | Spine Role |
|---|---|---|---|---|
| **mahmoudrabbas** | FI-1.1, FI-3.3, FI-4.1, FI-6.4 | **20** | EP1, EP3, EP4, EP6 | Opens spine (FI-1.1); later takes refusal-mode branch |
| **omar1175** | FI-1.2, FI-3.4, FI-4.3, FI-5.2 | **21** | EP1, EP3, EP4, EP5 | Second spine hand-off (FI-1.2); citations branch |
| **sohylagomaa** | FI-1.3, FI-1.4, FI-3.5, FI-3.6 | **21** | EP1, EP3 | Third spine hand-off (FI-1.4); owns entire chat frontend |
| **Se7so27** | FI-2.1, FI-2.3, FI-5.1, FI-6.1 | **22** | EP2, EP5, EP6 | Fourth spine hand-off (FI-2.1) |
| **Abdallahadel2004** | FI-2.2, FI-6.2, FI-6.3 | **18** | EP2, EP6 | Fifth spine hand-off (FI-2.2) |
| **marcoreda56-bot** | FI-3.1, FI-3.2, FI-4.2 | **21** | EP3, EP4 | Sixth spine hand-off — carries largest issue (FI-3.2, 13 pts) |

**Range: 18–22 points (avg 20.5).** This is intentionally not perfectly flat: `marcoreda56-bot` carries the largest single issue (FI-3.2 at 13 pts) and is given lighter loads elsewhere to compensate. Story points, not issue count, are what's balanced.

### Spine Rotation Model

The 7-issue critical path rotates ownership at every hand-off:

```
FI-1.1 (mahmoudrabbas) → FI-1.2 (omar1175) → FI-1.4 (sohylagomaa)
   → FI-2.1 (Se7so27) → FI-2.2 (Abdallahadel2004) → FI-3.2 (marcoreda56-bot)
   → FI-3.3 (mahmoudrabbas) / FI-3.4 (omar1175) [parallel branch]
```

Every developer touches the spine exactly once as primary owner. This means all six people understand the ingestion→retrieval→generation pipeline firsthand by mid-project — no single point of knowledge failure.

### Code Review Pairing

| Author | Primary Reviewer | Backup Reviewer |
|---|---|---|
| mahmoudrabbas | omar1175 | sohylagomaa |
| omar1175 | sohylagomaa | Se7so27 |
| sohylagomaa | Se7so27 | Abdallahadel2004 |
| Se7so27 | Abdallahadel2004 | marcoreda56-bot |
| Abdallahadel2004 | marcoreda56-bot | mahmoudrabbas |
| marcoreda56-bot | mahmoudrabbas | omar1175 |

### Cross-Epic Coupling Risks

| Risk | Mitigation |
|---|---|
| FI-1.4's `documentChunk.access_roles` and FI-5.1's `Document.accessRoles` are the same concept | Both reference the same enum, defined once in FI-5.1 (ships Sprint 1) and imported by FI-1.4 (Sprint 3) |
| FI-3.2 (LLM provider) and FI-4.2 (usage logging) both need to wrap every LLM call | Same developer owns both — `marcoreda56-bot` defines the logging event shape and emits it |

---

## 7. Sprint Plan

### Sprint 1 (Weeks 1–2) — "Foundations & Independent Wins"

| Feature Issue | Owner | Points | Note |
|---|---|---|---|
| FI-1.1 — Background Job Engine | mahmoudrabbas | 5 | **Spine 1/7.** Opens the chain. |
| FI-3.1 — Chat API Skeleton | marcoreda56-bot | 5 | Independent; uses `FakeLLMAdapter`. |
| FI-5.1 — Document Replace + accessRoles | Se7so27 | 3 | Ships shared roles enum FI-1.4 imports. |
| FI-5.2 — Tenant Settings | omar1175 | 3 | Independent. |
| FI-6.2 — Production Dockerfiles | Abdallahadel2004 | 5 | Independent. |
| FI-6.3 — Security Hardening | Abdallahadel2004 | 5 | Independent; same dev, fits one sprint. |
| FI-3.5 — Chat Frontend (shell only) | sohylagomaa | *(of 8)* | Layout, message list, input box — wiring waits for FI-3.2. |
| FI-4.2 — Usage Logging (schema only) | marcoreda56-bot | *(of 3)* | Token/cost/latency schema locked now. |

**Demo:** Tenant settings, document replace/roles, chat shell, CI live.

---

### Sprint 2 (Weeks 3–4) — "Extraction & Status Pipeline"

| Feature Issue | Owner | Points | Note |
|---|---|---|---|
| FI-1.2 — Text Extraction + Status Migration | omar1175 | 8 | **Spine 2/7.** Depends on FI-1.1. |
| FI-6.1 — i18n (Sprint-1 UI namespaces) | Se7so27 | *(slice of 8)* | Rolling — covers settings/roles UI. |
| FI-6.4 — Monitoring (early scaffolding) | mahmoudrabbas | *(of 5)* | Pulled forward for job-engine metrics. |
| — (review + design prep) | Abdallahadel2004 | — | Primary reviewer; drafts FI-2.2 API shape. |
| — (review + shell polish) | sohylagomaa | — | Reviews FI-1.2; continues FI-3.5 shell. |

**Demo:** Real document status pipeline (`uploaded → processing → chunking → embedding → ready/failed`); monitoring dashboard.

---

### Sprint 3 (Weeks 5–6) — "Chunking & OCR"

| Feature Issue | Owner | Points | Note |
|---|---|---|---|
| FI-1.4 — Chunking Engine + documentChunk | sohylagomaa | 5 | **Spine 3/7.** Imports `accessRoles` from FI-5.1. |
| FI-1.3 — OCR Integration | sohylagomaa | 5 | Off-spine, same dev, same sprint. |
| — (review + i18n) | Se7so27 | — | Reviews FI-1.4; continues FI-6.1. |
| — (review + design) | Abdallahadel2004 | — | Reviews FI-1.4/FI-1.3; finalizes FI-2.2 design. |
| — (review) | mahmoudrabbas | — | Reviews sohylagomaa's PRs; continues FI-6.4. |

**Demo:** Chunk viewer shows documents broken into 600–900 token chunks; OCR works for scanned PDFs.

---

### Sprint 4 (Weeks 7–8) — "Embeddings & Vector Index"

| Feature Issue | Owner | Points | Note |
|---|---|---|---|
| FI-2.1 — Embedding + Qdrant + Embedding Job | Se7so27 | 8 | **Spine 4/7.** Depends on FI-1.4. |
| — (review + design) | Abdallahadel2004 | — | Reviews FI-2.1; finishes FI-2.2 design. |
| — (review + prep) | marcoreda56-bot | — | Reviews FI-2.1; sketches supervisor skeleton. |
| — (review) | mahmoudrabbas | — | Reviews FI-2.1; wraps FI-6.4 scaffolding. |
| — (buffer) | sohylagomaa | — | No spine work yet; cross-team support. |

**Demo:** Internal tool lets admins run queries and see top-k retrieved chunks with similarity scores — first "AI-powered" moment.

---

### Sprint 5 (Weeks 9–10) — "Retrieval API & Supervisor Kickoff"

| Feature Issue | Owner | Points | Note |
|---|---|---|---|
| FI-2.2 — Hybrid Search + Retrieval API | Abdallahadel2004 | 8 | **Spine 5/7.** Depends on FI-2.1. |
| FI-2.3 — Reranking | Se7so27 | 3 | Soft dependency on FI-2.2; can slip to Sprint 6. |
| FI-3.2 — LLM Supervisor (start) | marcoreda56-bot | *(of 13)* | **Spine 6/7 begins.** Spans into Sprint 6. |
| FI-4.2 — Usage Logging (full instrumentation) | marcoreda56-bot | *(remaining pts)* | Wraps every LLM call with logging. |
| — (review + wiring prep) | sohylagomaa | — | Reviews FI-2.2; begins FI-3.5 wiring. |

**Demo:** Retrieval API returns hybrid, tenant/role-filtered, reranked results; first internal supervisor drafts visible.

---

### Sprint 6 (Weeks 11–12) — "Conversational Assistant Goes Live"

| Feature Issue | Owner | Points | Note |
|---|---|---|---|
| FI-3.2 — LLM Supervisor (completion) | marcoreda56-bot | *(remaining of 13)* | **Spine 6/7 completes.** |
| FI-3.3 — Refusal Mode + Injection Guard | mahmoudrabbas | 5 | **Spine 7/7 — branch A.** |
| FI-3.4 — Citations | omar1175 | 5 | **Spine 7/7 — branch B.** Parallel with FI-3.3. |
| FI-3.5 — Chat Frontend (wiring) | sohylagomaa | *(remaining of 8)* | Final wiring to real streamed answers. |

**Demo:** Full conversational RAG assistant — streamed answers, citations, refusal mode. First sprint where full value proposition is demoable end-to-end.

---

### Sprint 7 (Weeks 13–14) — "Operations, Feedback & Closeout"

| Feature Issue | Owner | Points | Note |
|---|---|---|---|
| FI-3.6 — Feedback Capture | sohylagomaa | 3 | Depends on FI-3.1, FI-3.5. |
| FI-4.1 — Knowledge Gap Detection | mahmoudrabbas | 5 | Depends on FI-3.3. |
| FI-4.3 — Analytics Dashboard | omar1175 | 5 | Depends on FI-4.2. |
| FI-6.1 — i18n (remaining namespaces, umbrella closes) | Se7so27 | *(remaining of 8)* | Final namespaces for chat, analytics. |
| FI-6.4 — Monitoring (finalize) | mahmoudrabbas | *(remaining of 5)* | Full value with FI-1.1 and FI-3.2 live. |

**Demo:** Analytics dashboard with real data, knowledge-gap report, feedback capture, full i18n, monitoring end-to-end.

---

### Velocity Summary

| Sprint | Points Landed | Spine Progress | Headline Demo |
|---|---|---|---|
| 1 | 21 (+2 partial) | Leg 1/7 | Tenant settings, doc roles, chat shell, CI live |
| 2 | 8 (+partial) | Leg 2/7 | Real document status pipeline |
| 3 | 10 | Leg 3/7 | Chunk viewer + OCR |
| 4 | 8 | Leg 4/7 | Live vector retrieval diagnostic |
| 5 | 11 (+partial) | Leg 5/7, Leg 6/7 begins | Hybrid search API + first drafts |
| 6 | ~18 | Leg 6/7 completes, Leg 7/7 | Full conversational RAG live |
| 7 | ~18 | — (spine complete) | Analytics, feedback, closeout |

---

## 8. Dependency Graph

### Visual Graph

```
                    FI-5.1 ──────────────────────────────────────┐
                    FI-5.2 ──────────────────────────────────────┤ (parallel)
                    FI-6.2 ──────────────────────────────────────┤
                    FI-6.3 ──────────────────────────────────────┤
                    FI-3.1 ──────────────────────────────────────┤
                                                                     │
FI-1.1 ──→ FI-1.2 ──→ FI-1.4 ──→ FI-2.1 ──→ FI-2.2 ──→ FI-3.2 ──┤
                        │              │         │         │    │    │
                        │              │         │         │    ├──→ FI-3.3 ──→ FI-4.1
                        │              │         │         │    ├──→ FI-3.4
                        │              │         │         │    └──→ FI-3.5 (wiring)
                        │              │         │         │
                        └──→ FI-1.3    │         └──→ FI-2.3│
                                       │                     │
                                       └─────────────────────┘

FI-4.2 ──→ FI-4.3
FI-3.5 (shell) ──→ FI-3.6
FI-6.1 (rolling)
FI-6.4 (rolling)
```

### Full Dependency Table

| ID | Depends On | Blocks | Fake Adapter |
|---|---|---|---|
| FI-1.1 | — | FI-1.2 | — |
| FI-1.2 | FI-1.1 | FI-1.3, FI-1.4 | — |
| FI-1.3 | FI-1.2 | — | — |
| FI-1.4 | FI-1.2 | FI-2.1 | — |
| FI-2.1 | FI-1.4 | FI-2.2 | FakeEmbeddingAdapter (unblocks early start) |
| FI-2.2 | FI-2.1 | FI-2.3, FI-3.2 | FakeVectorStoreAdapter (unblocks early start) |
| FI-2.3 | FI-2.2 | (refines FI-3.2) | — |
| FI-3.1 | — | FI-3.2, FI-3.5 (shell) | FakeLLMAdapter (unblocks early start) |
| FI-3.2 | FI-2.2, FI-3.1 | FI-3.3, FI-3.4, FI-3.5 (wiring), FI-4.2 | — |
| FI-3.3 | FI-3.2 | FI-4.1 | — |
| FI-3.4 | FI-3.2 | — | — |
| FI-3.5 | FI-3.1 (shell) / FI-3.2 (wiring) | FI-3.6 | — |
| FI-3.6 | FI-3.1, FI-3.5 | — | — |
| FI-4.1 | FI-3.3 | — | — |
| FI-4.2 | — (schema) / FI-3.2 (full) | FI-4.3 | — |
| FI-4.3 | FI-4.2 | — | — |
| FI-5.1 | — | — | — |
| FI-5.2 | — | — | — |
| FI-6.1 | — | — | — |
| FI-6.2 | — | — | — |
| FI-6.3 | — | — | — |
| FI-6.4 | — | — | — |

### Critical Path

```
FI-1.1 → FI-1.2 → FI-1.4 → FI-2.1 → FI-2.2 → FI-3.2 → FI-3.3 / FI-3.4
```

**7 Feature Issues deep.** With fake adapters, the effective blocking depth is reduced, enabling more parallel work in Sprints 2–4.

---

## 9. Git Workflow & Review Protocol

### Branch Naming

```
feature/fi-{id}-{short-description}
```

Example: `feature/fi-1.1-background-job-engine`

### Commit Messages

```
{type}: {description}

{body}

Refs: FI-{id}
```

Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`

### PR Rules

- One issue → one branch → one PR
- PR title must reference FI ID: `[FI-1.1] Background Job Engine`
- PR description must include:
  - Summary of changes
  - Files added/modified
  - Fake adapters created (if any)
  - Verification steps
  - `git status --short` output
- No self-merges — must be reviewed by assigned reviewer
- Draft PRs allowed for early visibility

### Merge Protocol

1. Author opens PR with all commits squashed or logically grouped
2. Primary reviewer assigned per review ring (Section 6)
3. Reviewer checks:
   - All acceptance criteria met
   - Tests pass
   - No secrets in code
   - Fake adapters labeled and have contract tests
   - Tenant isolation enforced
4. If changes requested: author fixes, reviewer re-reviews
5. If approved: reviewer merges (no auto-merge)
6. Author confirms merge and notifies downstream dev

### Hand-Off Checklist (Spine Rotation)

When handing off a spine leg to the next developer:

1. PR merged and CI green
2. README/inline comments explain non-obvious decisions
3. Fake adapters (if any) documented with replacement instructions
4. API contracts frozen and documented
5. Next developer can start without a live walkthrough

---

## 10. Onboarding Checklist

### Day 1: Setup

- [ ] Clone repository
- [ ] Install dependencies: `npm install` (root, api/, app/, workers/)
- [ ] Start services: `docker compose up -d`
- [ ] Run migrations: `npm run migrate`
- [ ] Seed data: `npm run seed`
- [ ] Verify: `npm run lint && npm run typecheck && npm run test`
- [ ] Start dev servers: `npm run dev`
- [ ] Open browser: `http://localhost:3000`

### Day 1: Understand

- [ ] Read `FINAL_BOSS_PLAN.md` (this document)
- [ ] Read `PROJECT_IMPLEMENTATION_STATUS.md`
- [ ] Read `PROJECT_DISCOVERY_REPORT.md`
- [ ] Identify your assigned FIs and their dependencies
- [ ] Review the dependency graph (Section 8)
- [ ] Review the sprint plan (Section 7)

### Day 1: First Commit

- [ ] Create your first feature branch
- [ ] Pick an independent FI (no dependencies)
- [ ] Follow the FI's discovery checklist
- [ ] Implement the vertical slice
- [ ] Open a draft PR
- [ ] Request review from assigned reviewer

### Ongoing: Daily

- [ ] Check Slack/GitHub for review requests
- [ ] Update your PR status
- [ ] Coordinate with spine upstream/downstream
- [ ] Attend sprint ceremonies

---

## Appendix: Coding Model Workflow

When using a coding model (Cursor, Copilot, etc.) on any FI:

1. Read the complete FI definition
2. Inspect the current repository and tests
3. Run `git status`
4. Write a short file-level implementation plan
5. Implement the vertical slice
6. Add migrations/backfills when data changes
7. Add unit, integration, security, and user-flow tests
8. Run lint, typecheck, tests, and builds
9. Update documentation
10. Return an evidence-based report and `git status --short`

### Coding Model Must Not

- Assume the FI description exactly matches the latest code
- Ask routine questions resolvable by repository inspection
- Weaken authorization or tenant isolation to make tests pass
- Use an agent/LLM decision as permission or deterministic execution
- Insert production credentials
- Leave placeholder pages or mocked metrics as final implementation
- Silently skip failing workspaces or tests

### Final Response From Coding Model

Must include:
- Summary of implemented behavior
- Files added/changed
- Data migrations/backfills and how to run them
- API routes/contracts added or changed
- Security and tenant-isolation decisions
- Fake adapters/fixtures created
- Commands executed with pass/fail/blocked status
- Remaining limitations
- `git status --short`
- Confirmation that no secrets were printed or committed

---

**This document is the single source of truth.** All implementation work references this plan. When in doubt, check this document first.
