# Model Selection Rationale

> Why we chose each AI component for DocuMind AI, and the alternatives we
> evaluated. This covers the LLM, the embedding model, the vector database,
> and OCR.

---

## 1. LLM — Groq + Llama 3.3 70B

**Default model:** `llama-3.3-70b-versatile` via the Groq API.

### Why we chose it

- **Fast inference.** Groq's custom LPU hardware serves Llama 3.3 70B at
  >300 tokens/second, which makes chat feel instant and keeps answers
  streaming-friendly.
- **Free tier.** The Groq free tier is generous enough for evaluation and
  early customers; cost scales predictably with usage.
- **Good Arabic support.** Llama 3.3 is multilingual and handles Arabic
  content well — a core requirement since the product targets Arabic and
  English documents and questions.
- **OpenAI-compatible API.** The existing `openai` SDK adapter works with
  minimal changes, reducing integration and provider-switching cost.
- **Long context.** Supports 128k context, comfortably fitting retrieval
  results plus conversation history.

### Alternatives considered

| Model | Pros | Cons | Verdict |
| --- | --- | --- | --- |
| **Llama 3.3 70B (Groq)** | >300 tok/s, free tier, strong Arabic, OpenAI-compatible | Hosted — no on-prem deployment | ✅ **Selected** |
| OpenAI GPT-4o / GPT-4.1 | Excellent quality, well-supported SDK | Higher cost, weaker Arabic than expected, rate limits | ❌ Cost vs. quality for this use case |
| Claude (Bedrock) | Strong reasoning and safety | Slower, more expensive, Arabic comparable | ❌ Not needed at this scale |
| Self-hosted Llama 3.1 8B | Full control, zero per-token cost | Requires GPU infra, weaker multilingual output | ❌ Operational overhead for a startup |

---

## 2. Embeddings — Jina Embeddings v3

**Default model:** `jina-embeddings-v3` (1024 dimensions).

### Why we chose it

- **Bilingual EN + AR.** Trained for multilingual retrieval; produces
  high-quality semantic matches across English and Arabic — critical for a
  bilingual RAG system.
- **1024 dimensions.** Good balance between expressiveness and storage/cost;
  compatible with MongoDB Atlas Vector Search.
- **Competitive quality at lower cost.** v3 outperforms or matches
  OpenAI's `text-embedding-3-small` on retrieval benchmarks (MTEB) at a
  lower price per token.
- **Task-aware.** Supports query/document asymmetry and a dedicated `text`
  task type, which improves retrieval quality in RAG pipelines.

### Alternatives considered

| Model | Pros | Cons | Verdict |
| --- | --- | --- | --- |
| **Jina Embeddings v3** | Bilingual EN+AR, 1024-dims, cheap, strong MTEB | External API dependency | ✅ **Selected** |
| OpenAI `text-embedding-3-small` | Great quality, easy SDK | 1536 dims costlier; weak Arabic | ❌ Language requirement |
| Cohere embed-v4 (Bedrock) | Strong multilingual | Requires Bedrock access, higher cost | ❌ Extra infra |
| Sentence-transformers (local) | Free, private | Heavy GPU for 1024-dims, harder ops | ❌ Not yet needed |

---

## 3. Vector Database — MongoDB Atlas Vector Search

### Why we chose it

- **No additional infrastructure.** The platform already runs MongoDB Atlas,
  so enabling the vector index adds no new service, network hop, or ops burden.
- **Integrated tenant isolation.** Documents, users, and chunks live in the
  same database; access filters combine naturally with vector queries, so
  multi-tenant isolation is enforced at query time.
- **Atlas Search + Vector together.** Supports hybrid retrieval: BM25 keyword
  search and vector similarity can be fused in a single request, simplifying
  the retrieval pipeline.
- **Operational simplicity.** Backups, monitoring, and scaling are all
  already in place for MongoDB.

### Alternatives considered

| Option | Pros | Cons | Verdict |
| --- | --- | --- | --- |
| **MongoDB Atlas Vector Search** | Zero new infra, native tenant isolation, hybrid search | Not the fastest ANN index | ✅ **Selected** |
| Pinecone | Excellent vector performance | Separate service + per-vector cost; must sync tenant ACLs | ❌ Added complexity |
| Qdrant | Fast, open-source, self-hostable | Requires hosting a second database | ❌ Ops overhead |
| pgvector | Great if already on Postgres | We're on MongoDB; embedding rows don't fit the model | ❌ Wrong foundation |

---

## 4. OCR — Tesseract.js

### Why we chose it

- **Open source.** MIT-licensed; no per-page or per-document licensing cost,
  no external API dependency.
- **Arabic support.** Ships `ara.traineddata` (plus English `eng`), so scanned
  Arabic PDFs are extracted natively.
- **Runs in-process / in our worker.** Keeps document content private — files
  never leave our infrastructure, matching the product's privacy promise.
- **Good enough accuracy.** For clean printed documents (policies, SOPs,
  contracts) Tesseract accuracy is sufficient, especially combined with
  section/table chunking.

### Alternatives considered

| Option | Pros | Cons | Verdict |
| --- | --- | --- | --- |
| **Tesseract.js** | Free, Arabic+English, private, no API cost | Accuracy drops on poor scans | ✅ **Selected** |
| Google Cloud Vision OCR | Very high accuracy, good Arabic | External API, cost per page, data leaves infra | ❌ Privacy + cost |
| AWS Textract | High accuracy, tables/forms | Paid, external, AWS-locked | ❌ Cost |
| PaddleOCR | Strong CJK + Arabic | Heavier runtime, extra native deps | ❌ Ops overhead |

---

## Summary

| Component | Selection | Primary driver |
| --- | --- | --- |
| LLM | Groq + Llama 3.3 70B | Speed + free tier + Arabic |
| Embeddings | Jina v3 (1024-d) | Bilingual quality at low cost |
| Vector DB | MongoDB Atlas Vector Search | No new infra + native tenant isolation |
| OCR | Tesseract.js | Open source, private, Arabic support |

Config note: the API reads these via `AI_PROVIDER=groq`, `GROQ_CHAT_MODEL`,
`JINA_EMBEDDING_MODEL`, and `JINA_EMBEDDING_DIMENSIONS` in `api/src/config/env.ts`.
