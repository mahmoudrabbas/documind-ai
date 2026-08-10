# DocuMind AI — Presentation Flow

> A 20–30 minute walkthrough of the DocuMind AI project: what it is, what it
> does, how it's built, and what's next. Built from a full exploration of the
> repository (frontend, backend, workers, infrastructure, CI/CD).

---

## One-line pitch

> **DocuMind AI** is a private, multi-tenant AI knowledge assistant for
> companies. Admins upload internal documents (HR policies, SOPs, contracts) in
> **Arabic or English**; employees ask natural-language questions and get
> **cited answers generated only from those documents** — or an honest refusal
> when there isn't enough evidence. Every tenant's data is fully isolated.

---

## Suggested format

| Segment | Duration |
|---|---|
| 1. The Problem | 2 min |
| 2. The Product | 2 min |
| 3. Live Demo | 12–15 min |
| 4. Architecture | 4 min |
| 5. Engineering Highlights | 4 min |
| 6. Quality & Ops | 2 min |
| 7. Status & Roadmap | 1–2 min |
| **Total** | **~27–30 min** |

---

## 1. The Problem (2 min)

- Company knowledge lives in scattered internal documents: HR policies, SOPs,
  contracts — in **two languages** (Arabic + English).
- Employees can't find answers quickly; support tickets pile up; onboarding is
  slow.
- Public AI tools leak confidential data and cite nothing.
- **Hook:** "What if your documents could answer your employees' questions
  themselves — privately, with receipts, in their own language?"

---

## 2. The Product (2 min)

- Upload → ask → get a **cited, source-verified answer or an honest refusal**
  (no hallucination).
- **Bilingual by design**: Arabic + English with full RTL — not an afterthought.
- **Multi-tenant isolation + role-based access** are core promises, not
  features bolted on later.
- Three personas, three experiences:
  - **Company Admin** — uploads & manages the knowledge base, users, roles.
  - **Employee** — just asks questions and gets cited answers.
  - **Super Admin** — operates the platform: tenants, packages, subscriptions,
    health.

---

## 3. Live Demo (12–15 min)

Walk real flows end-to-end. Local stack: frontend `:3000`, API `:5000`,
worker + Redis via `docker compose up --build`.

### 3.1 Landing → Register (2 min)

- Marketing landing page: hero, features, **live pricing** fetched from
  `GET /public/packages` (monthly/annual toggle, trial badges).
- CTA pre-selects a plan via `?package=starter|professional|enterprise|free`.
- `/register`: company name → auto-generated slug, admin name, email, password.
- Result: tenant + `COMPANY_ADMIN` created in `pending_verification`,
  **TRIALING subscription auto-provisioned** from the selected package
  (or default free package).

### 3.2 Email verification → Login (2 min)

- Verification email → one-time token → `/verify-email` activates tenant + user.
- `/login`: company slug + email + password → access token (in-memory) +
  refresh token (httpOnly cookie, rotated on every use).
- **Role-based redirect**: SUPER_ADMIN → `/super-admin`, COMPANY_ADMIN →
  `/dashboard`, EMPLOYEE → `/dashboard/chat`.

### 3.3 Admin uploads a document (3 min)

- `/dashboard/documents`: drag-drop upload with metadata (title, description,
  tags), upload progress, duplicate detection.
- File is scanned for malware, checksummed, stored in S3, record created.
- Show the **5-stage processing pipeline** transition live
  (status badges + real-time progress):
  `uploaded → OCR → extraction → chunking → embedding → indexing → ready`
- The worker consumes queue `documind-jobs`:
  1. **OCR Worker** — tesseract.js, Arabic (`ara`) + English models
  2. **Extraction Worker** — PDF / DOCX / XLSX / TXT / MD
  3. **Chunking Worker** — semantic chunk strategies
  4. **Embedding Worker** — Jina `jina-embeddings-v3`, 1024-dim bilingual
  5. **Indexing Worker** — writes to Atlas Vector Search with tenant isolation

### 3.4 Employee asks a question (4 min)

- `/dashboard/chat`: conversation sidebar, streaming answers.
- **Hybrid retrieval**: vector (Atlas Vector Search) + keyword, fused with
  **RRF**, filtered by the user's document-access permissions, reranked.
- **Cited answer** with source scores; click a citation → **PDF viewer jumps to
  the exact page + highlighted quote**.
- Show **image Q&A** (attach an image to the question) and **voice input**
  (browser speech recognition + audio STT fallback).
- Feedback widget (thumbs up/down) per answer.

### 3.5 The honest refusal (30 sec)

- Ask something NOT covered by the knowledge base.
- The system refuses instead of hallucinating — this is a product differentiator.

### 3.6 Billing (2 min)

- `/checkout`: plan + interval → Stripe Checkout → webhook → subscription sync
  (success page recovers missed webhooks via session_id).
- **Entitlement enforcement**: quota denials surface an `UpgradePrompt`
  pointing back to checkout.
- "Manage Billing" → Stripe billing portal.

### 3.7 Super Admin console (30 sec)

- `/super-admin`: platform overview (companies, users, documents, queries,
  estimated cost, storage).
- Packages CRUD with versioned snapshots; subscription lifecycle transitions;
  system health (API / Mongo / Redis); retrieval debug endpoint.

---

## 4. Architecture (4 min)

> Use the Mermaid diagram in `docs/architecture.md` as the slide background.

```
Next.js (app) ──REST /api/v1──▶ Express API (api) ──BullMQ──▶ Workers (workers)
                                    │                              │
                    ┌───────────────┼───────────────┐              │
                    ▼               ▼               ▼              ▼
             MongoDB Atlas    Redis          AWS S3     Atlas Vector Search
             (data)           (queues,       (raw        (chunk embeddings)
                              sessions,       files)
                              rate limits)
                    │
                    ▼
        AI Providers (pluggable adapters)
        Groq (Llama 3.3 70B) · OpenAI · AWS Bedrock (Claude)
        Jina (embeddings v3) · Tesseract.js (OCR)
        Langfuse (LLM tracing) · Stripe (payments) · SMTP (email)
```

- **Frontend**: Next.js 16 App Router, custom Material Design 3 system (no UI
  library), AR/EN i18n with RTL, socket.io real-time notifications.
- **Backend**: Express 5 feature-based monolith — ~37 modules, each shaped
  `routes → controller → service → repository → validator → types`.
- **Data**: MongoDB Atlas (documents, tenants, users, conversations) + Atlas
  Vector Search (inherits Mongo tenant isolation) + Redis (BullMQ queues,
  sessions, rate limits) + S3 (raw files).
- **Workers**: one BullMQ consumer process, in-memory fallback for dev,
  graceful drain, DLQ + completed-job pruning.
- **Payments**: Stripe Checkout, provider-neutral ports, 9-state subscription
  lifecycle (TRIALING → ACTIVE → PAST_DUE → … with legal transition rules).

---

## 5. Engineering Highlights (4 min)

- **Multi-tenancy**: tenant scoping derived from JWT claims (never request
  input), tenant-compounded DB indexes, subscription index invariant check at
  startup.
- **Security**: Argon2 hashing; hashed one-time verification/reset tokens;
  hashed rotating refresh tokens with reuse detection; permission-based RBAC;
  document access policies; malware scan + checksum on upload; generic
  forgot-password responses (no email enumeration); CORS allowlist; auth rate
  limiting.
- **Reliability**: outbox pattern for email + notifications (with DLQ),
  idempotency gates, retry/backoff, processing status state machine
  (`STALE → INDEXING → READY`).
- **Agentic retrieval layer**: intent-query rewriting → supervisor →
  hybrid retrieval (vector + keyword + RRF fusion) → reranking → answer writer
  → **citation verification agent** → cited streaming answer.
- **Entitlements**: per-plan quotas (employees, documents, storage, queries,
  OCR pages) enforced fail-closed with atomic counters.
- **Bilingual quality**: Arabic + English embeddings, OCR language models,
  full RTL UI, and bilingual test corpora in the test fixtures.
- **Observability**: Langfuse LLM tracing, pino structured logging,
  prom-client metrics, health/ready probes (`/healthz`, `/readyz`).

---

## 6. Quality & Ops (2 min)

- **Tests**: 161 web tests + API unit/integration tests (Vitest,
  mongodb-memory-server), Playwright e2e (auth: login/logout/register/
  verify-email/reset/token-state; billing).
- **CI/CD** (`.github/workflows/ci.yml`, single workflow, 5 jobs):
  1. `repository-security` — committed-secret scan + security tests
  2. `validate` — matrix [api, app, workers]: lint → typecheck → test → build
  3. `docker` — builds all 3 images
  4. `compose` — validates `docker compose config`
  5. `ci-success` — merge gate
- **Local dev**: `docker compose up --build` → 4 containers
  (api :5000, app :3000, worker, redis :6379). MongoDB = Atlas via `api/.env`.
- **Secrets**: Docker secrets from gitignored `secrets/*.txt`
  (only `*.example` tracked); no credentials in repo or CI.
- **Deployment**: intentionally no deploy automation in-repo — CI gates merges;
  app → Vercel, api → Render via native GitHub integrations; managed
  Atlas / S3 / Redis data plane.

---

## 7. Status & Roadmap (1–2 min)

Be honest — credibility beats hype.

**Production-solid today:**
- Tenant registration, email verification, login, refresh rotation, logout
- Multi-tenant isolation + RBAC (roles + permissions)
- Document upload / metadata / versioning / access policies
- Package catalog + subscriptions + Stripe billing + entitlement quotas
- Document processing pipeline + bilingual cited RAG chat
- Super Admin platform console (tenants, packages, subscriptions, health)
- CI gate: secret scan, lint, typecheck, test, build, compose validation

**Hardening / next:**
- Wire Playwright e2e into CI (currently local-only)
- Production deploy automation (Vercel/Render native recommended)
- Broader E2E/security coverage (cross-tenant attacks, upload security)
- Notification/email delivery ops maturity

---

## Speaker notes cheat sheet

| If asked… | Answer |
|---|---|
| "How is tenant data isolated?" | Tenant ID derived from JWT claims; every repository query scoped; tenant-compounded indexes; vector search inherits Mongo isolation. |
| "Why no UI library?" | Hand-rolled Material Design 3 tokens — full control over RTL, theming, and bundle size. |
| "Which LLM?" | Provider-agnostic adapters: Groq Llama 3.3 70B default, OpenAI, AWS Bedrock Claude — swappable. |
| "How do you prevent hallucinations?" | Retrieval-grounded generation + refusal when evidence insufficient + citation verification agent. |
| "How is billing modeled?" | 9-state subscription state machine with legal transitions; provider-neutral ports; Stripe adapter. |
| "What happens if Redis dies?" | Worker falls back to in-memory queue in dev; production relies on managed Redis + DLQ. |
| "Arabic support?" | OCR models, bilingual embeddings, full RTL UI, bilingual test corpora — built-in, not bolted on. |
