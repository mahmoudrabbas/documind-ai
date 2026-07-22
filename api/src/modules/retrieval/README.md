# Retrieval Module

> Module: `api/src/modules/retrieval/`
> Issue: 20 — Tenant-Role Hybrid Retrieval
> Status: **COMPLETE** (fake adapters only; production adapters deferred)

## Overview

Multi-tenant hybrid search engine combining semantic (vector) and keyword (BM25) search over document chunks. Every search is automatically filtered by the user's tenant, role, department, document classification, and the current approved document version.

## Architecture

```
AccessContext ──▶ FilterCompiler ──▶ AdapterFilter
                                           │
RetrievalQuery ──────────────────────▶ HybridRetrievalService
                                           │
                        ┌──────────────────┼──────────────────┐
                        ▼                  ▼                  ▼
                VectorStoreAdapter   KeywordAdapter    FusionEngine (RRF)
                        │                  │                  │
                        ▼                  ▼                  ▼
                   FakeVectorStore    FakeKeyword        Reciprocal Rank
                   (in-memory)        (in-memory BM25)   Fusion (k=60)
                        │                  │                  │
                        └──────────────────┼──────────────────┘
                                           ▼
                                   Re-validate & Hydrate
                                           │
                                           ▼
                                   RetrievalResult
```

### Key Components

| File | Responsibility |
|---|---|
| `retrieval.types.ts` | Domain types: `AccessContext`, `RetrievalQuery`, `RetrievalResult`, `RetrievalCandidate` |
| `filterCompiler.ts` | Derives mandatory filters from auth context (tenantId, role, permissions). Query filters are optional user narrowing. |
| `fusionEngine.ts` | Reciprocal Rank Fusion (RRF) with configurable k and per-strategy weights |
| `retrieval.repository.ts` | MongoDB chunk queries scoped to tenant |
| `retrieval.service.ts` | `createRetrievalService(deps)` — orchestrates the full pipeline |
| `retrieval.controller.ts` | `createRetrievalController(service)` — HTTP handlers |
| `retrieval.routes.ts` | `createRetrievalRoutes(service)` — Express route definitions |
| `retrieval.validator.ts` | Zod schemas for request validation |
| `retrieval.dto.ts` | Request/response DTOs |

### Ports & Adapters

| Port Interface | Fake Adapter | Production Adapter |
|---|---|---|
| `VectorStoreAdapter` (`providers/embedding/vectorStoreAdapter.ts`) | `FakeVectorStoreAdapter` — in-memory cosine similarity | Deferred to future issue |
| `KeywordAdapter` (`providers/embedding/keywordAdapter.ts`) | `FakeKeywordAdapter` — in-memory TF-IDF/BM25 | Deferred to future issue |

## Filter Compiler

The filter compiler has two phases:

1. **Access filters** (`compileAccessFilters`) — mandatory, derived from auth context. Never overridable by request input.
   - `tenantId` — always set
   - `allowAiUse: true` — always set
   - `classification` — role-based defaults: SUPER_ADMIN (none), COMPANY_ADMIN (public/internal/confidential), EMPLOYEE (public/internal). Overridden by explicit permission scopes.
   - `department` — only when `permissionScopes.departmentIds` is non-empty
   - `category` — only when `permissionScopes.documentCategories` is non-empty

2. **Query filters** (`compileQueryFilters`) — optional user narrowing (documentIds, classifications, departments, categories).

3. **Merge** (`mergeFilters`) — intersection for classification/department/category, union for documentIds. TenantId and allowAiUse always come from mandatory.

## API Endpoints

### `GET /retrieval/debug`

SUPER_ADMIN-only diagnostic endpoint.

- **Auth:** SUPER_ADMIN role required (403 otherwise)
- **Query parameters:**

| Param | Type | Required | Description |
|---|---|---|---|
| `q` | string | yes | Search query text |
| `topK` | number (1-100) | no | Max results (default: 10) |
| `documentIds` | string[] | no | Filter to specific document IDs |
| `categories` | string[] | no | Filter by document categories |
| `departments` | string[] | no | Filter by departments |
| `classifications` | string[] | no | Filter by classification levels |

- **Response:**

```json
{
  "success": true,
  "data": {
    "query": "...",
    "candidates": [
      {
        "chunkId": "...",
        "documentId": "...",
        "documentVersionId": "...",
        "tenantId": "...",
        "text": "...",
        "score": 0.85,
        "pageNumber": 1,
        "sectionTitle": "...",
        "classification": "internal",
        "retrievalMethod": "hybrid",
        "scoreBreakdown": {
          "vectorScore": 0.9,
          "keywordScore": 0.7,
          "fusionScore": 0.85
        }
      }
    ],
    "totalCandidates": 5,
    "filterSummary": {
      "tenantFilter": true,
      "roleFilter": "SUPER_ADMIN",
      "permissionScopes": [],
      "explicitFilters": ["categories"],
      "versionFilter": false
    },
    "diagnostics": {
      "vectorLatencyMs": 12,
      "keywordLatencyMs": 8,
      "fusionLatencyMs": 1,
      "totalLatencyMs": 25,
      "vectorCandidateCount": 10,
      "keywordCandidateCount": 10,
      "traceId": "uuid"
    }
  },
  "trace": {
    "requestId": "...",
    "tenantId": "...",
    "resultCount": 5,
    "query": "..."
  }
}
```

- **Error codes:** 401 (UNAUTHORIZED), 403 (FORBIDDEN)

### `POST /retrieval/search`

Authenticated hybrid search (any role with `documents:read` permission).

- **Auth:** Any authenticated user with DOCUMENTS_READ permission
- **Request body:**

```json
{
  "queryText": "search terms",
  "topK": 10,
  "filter": {
    "documentIds": ["..."],
    "categories": ["..."],
    "departments": ["..."],
    "classifications": ["..."]
  }
}
```

- **Response:** Same shape as debug endpoint `data` field (without `trace` wrapper)

## Agent Tool Contract

### `hybrid_search`

- **Tool name:** `hybrid_search`
- **Version:** `1.0.0`
- **Required permission:** `documents:read`
- **Approval required:** No
- **Timeout:** 10s

**Input schema:**

| Field | Type | Required | Description |
|---|---|---|---|
| `queryText` | string | yes | Search query |
| `topK` | number (1-50) | no | Max results (default: 5) |
| `documentIds` | string[] | no | Filter to specific documents |
| `categories` | string[] | no | Filter by categories |
| `departments` | string[] | no | Filter by departments |
| `classifications` | string[] | no | Filter by classifications |

**Output schema:**

```json
{
  "candidates": [
    {
      "chunkId": "string",
      "documentId": "string",
      "text": "string",
      "score": 0.0,
      "retrievalMethod": "string",
      "scoreBreakdown": {
        "vectorScore": 0.0,
        "keywordScore": 0.0,
        "fusionScore": 0.0
      }
    }
  ],
  "totalCandidates": 0
}
```

## Running Tests

```bash
# From api/ directory
node --experimental-strip-types --no-warnings --test --import tsx src/modules/retrieval/phase3-smoke.test.ts
node --experimental-strip-types --no-warnings --test --import tsx src/modules/retrieval/phase4-smoke.test.ts
node --experimental-strip-types --no-warnings --test --import tsx src/modules/retrieval/filterCompiler.test.ts
node --experimental-strip-types --no-warnings --test --import tsx src/modules/retrieval/fusionEngine.test.ts
node --experimental-strip-types --no-warnings --test --import tsx src/modules/retrieval/retrieval.routes.test.ts
node --experimental-strip-types --no-warnings --test --import tsx src/providers/embedding/adapters.contract.test.ts
```

## Audit Events

| Action | When | Outcome |
|---|---|---|
| `RETRIEVAL_SEARCH` | Successful search (hybrid/vector/keyword) | SUCCESS |
| `RETRIEVAL_DENIAL` | Unauthorized access attempt on debug endpoint | DENIED |

Audit entries include `traceId`, method, candidate counts, and latency breakdowns. They do NOT include query text or chunk content.

## Known Limitations

- Fake adapters only (in-memory cosine similarity and TF-IDF). Production vector DB adapters deferred.
- No reranking, evidence packaging, answer generation, or citations (Issue 21/22 scope).
- No employee-facing search UI or public search endpoint.
- `RETRIEVAL` resource type is new; no historical audit data exists before Issue 20.
