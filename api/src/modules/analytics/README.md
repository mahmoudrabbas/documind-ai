# Analytics & Operational Quality Module (`api/src/modules/analytics`)

Complete vertical-slice implementation of operational, financial, and AI quality analytics for DocuMind AI.

---

## 🏛️ Architecture & Core Components

```
api/src/modules/analytics/
├── README.md                          # Module documentation
├── analytics.controller.ts            # Express REST controllers using endpoint() wrapper
├── analytics.dto.ts                    # Zod validation schemas
├── analytics.export.service.ts        # Async CSV/XLSX export engine with bounded row limits
├── analytics.repository.ts            # Data access layer (UsageEvent, AnalyticsAggregate)
├── analytics.routes.ts                # Express router registered at /analytics
├── analytics.service.ts               # Core business logic layer
├── analytics.types.ts                 # TypeScript interfaces & types
├── analytics.validator.ts             # Express request validation middlewares
├── aggregation.service.ts             # Pre-computed aggregate refresher & pipeline engine
├── cost.service.ts                    # Provider/model pricing calculation service
├── quality.service.ts                 # Quality metrics computation & persistence
├── ports/
│   ├── usageEventWriter.port.ts       # Published interface for event ingestion
│   └── pricingProvider.port.ts        # Published interface for pricing lookup
├── adapters/
│   ├── mongo-usage-event-writer.ts    # Production MongoDB usage event writer with $setOnInsert idempotency
│   ├── in-memory-usage-event-writer.ts# In-memory fake event writer for testing
│   ├── mongo-pricing-provider.ts      # Production MongoDB pricing snapshot lookup
│   └── fake-pricing-provider.ts       # Deterministic fake pricing provider
└── insight/
    ├── insight-agent.types.ts         # Insight proposal definitions & contracts
    ├── insight-agent.service.ts       # Production Insight Agent with real LLM ModelAdapter support
    ├── fake-insight-agent.adapter.ts  # Fake insight adapter for tests
    └── insight-agent.contract.test.ts # Interface contract validation tests
```

---

## 📑 Database Models (`api/src/db/models/`)

- `UsageEventModel` (`usage_events`): Canonical usage event schema capturing all 17 event types (prompt, completion, embedding, ocr_page, agent_run, citation_check, refusal, feedback, entitlement_denial, etc.).
- `PricingSnapshotModel` (`pricing_snapshots`): Provider and model pricing snapshots for real cost calculations vs estimated costs.
- `AnalyticsAggregateModel` (`analytics_aggregates`): Materialized aggregate summaries bucketed by tenant, provider, model, and date.
- `QualityMetricModel` (`quality_metrics`): AI quality metrics (noEvidenceRate, refusalRate, citationCoverage, citationPrecision, feedbackPositiveRate, processingSuccessRate).
- `ExportJobModel` (`export_jobs`): Tracking asynchronous data exports.

---

## 🔐 Security & Access Control

- All endpoints are protected by `authenticate` and `tenantScoping` middlewares.
- Reading analytics requires `ANALYTICS_READ` permission (`analytics:read`).
- Triggering exports requires `ANALYTICS_EXPORT` permission (`analytics:export`).
- Tenant isolation is strictly enforced: `COMPANY_ADMIN` and `EMPLOYEE` roles can only access metrics for their own tenant. `SUPER_ADMIN` can access global cross-tenant metrics.

---

## 🧪 Testing & Verification

```bash
# Run analytics unit and integration tests
npm run test:api
```
