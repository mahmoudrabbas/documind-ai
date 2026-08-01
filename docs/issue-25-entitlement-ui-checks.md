# Issue 25 — Manual UI Verification Guide (Entitlement Enforcement)

Manual browser + database checks for the five Issue 25 features:

1. **Token counting** — AI queries consume actual token count against `tokensPerMonth`
2. **Denial audit logging** — every 429/503 entitlement denial writes to `audit_logs`
3. **Concurrency/race tests** — automated only (see "Not UI-testable" below)
4. **Subscription state change mid-reservation** — automated only (see below)
5. **Frontend denial UI** — 403 → "Subscription Inactive" state; 429 → "Quota Exceeded" banner with upgrade CTA

## 0. Prerequisites

```powershell
# Full stack (Docker) — see README
docker compose up --build

# Stripe CLI for checkout/reactivation flows to work
npm run stripe:listen

# Log in as COMPANY_ADMIN (register a company account if none exists)
#   Chat:  http://localhost:3000/dashboard/chat
#   Usage: http://localhost:3000/company/usage
```

Mongo access for the DB manipulation steps:

```
docker exec -it <mongo-container> mongosh docsai
```

(or MongoDB Compass at `mongodb://localhost:27017/docsai`)

### Collection cheat sheet

| Collection | Contents |
|---|---|
| `quotacounters` | usage counters per `(tenantId, dimension, periodStart)` |
| `quotaoverrides` | per-tenant dimension limit overrides (`enabled: true` wins over package quota) |
| `subscriptions` | `status` enum incl. `CANCELED`/`EXPIRED`/`ACTIVE`, `paymentState` |
| `audit_logs` | Issue 25 denial events: `action: "entitlement.denial"` |

Get your tenant id (used by every script below):

```js
db.subscriptions.findOne().tenantId
```

---

## Test A — "Quota Exceeded" banner in chat (429 → UI)

### Step 1 — force exhaustion

The deterministic path uses the `queriesPerMonth` dimension (its fail-closed guard is
wired onto `POST /intent-query/analyze`, which chat calls):

```js
db.quotaoverrides.updateOne(
  { tenantId: ObjectId("<yourTenantId>"), dimension: "queriesPerMonth" },
  { $set: { limit: 0, enabled: true, reason: "UI test" } },
  { upsert: true }
)
```

### Step 2 — in the browser

Go to `/dashboard/chat`, type a message, send.

**Expected:**
- An in-place banner appears **above the input**: "You've reached your
  **queriesPerMonth** limit", with current/limit info and an **Upgrade** CTA → `/checkout`
- Prior conversation stays visible — no fake assistant error bubble
- Sending another message clears the banner (re-triggers on the next denial)

### Step 3 — verify the audit event (feature 2)

```js
db.audit_logs.find({ action: "entitlement.denial" })
  .sort({ createdAt: -1 }).limit(3)
  .forEach(d => printjson({
    dimension: d.resourceType,
    denialType: d.metadata?.denialType,
    tenantId: d.tenantId,
    actorId: d.actorId,
    traceId: d.traceId
  }))
```

**Expected:** entries with `denialType: "429"`, your `tenantId`, the dimension, and a
traceId. The audit write is fire-and-forget — the 429 response is never blocked or
delayed by it.

### Testing the `tokensPerMonth` variant (feature 1)

Only fires when the AI provider reports token usage — with the dev fake model the
query may consume 0 tokens (the designed "no usage metadata → skip" path). With a
real OpenAI/Anthropic key configured:

```js
db.quotaoverrides.updateOne(
  { tenantId: ObjectId("<yourTenantId>"), dimension: "tokensPerMonth" },
  { $set: { limit: 100, enabled: true } },
  { upsert: true }
)
db.quotacounters.updateMany(
  { tenantId: ObjectId("<yourTenantId>"), dimension: "tokensPerMonth" },
  { $set: { value: 90 } }
)
```

One query (≥10 tokens) → 429 → same banner with the `tokensPerMonth` dimension.

---

## Test B — "Subscription Inactive" on usage page (403 → UI)

### Step 1 — cancel the subscription

Quick DB route (Stripe-dashboard cancel also works but requires the webhook sync):

```js
db.subscriptions.updateOne(
  { tenantId: ObjectId("<yourTenantId>") },
  { $set: { status: "CANCELED", cancelledAt: new Date(), paymentState: "paid" } }
)
```

### Step 2 — in the browser

Go to `/company/usage` and refresh.

**Expected:** the usage bars are replaced by a **"Subscription Inactive"** state with a
**reactivation CTA** → `/checkout`. Click it → checkout page loads.

### Bonus — 503 path (features 2 + 4)

While the subscription is CANCELED, send a chat message → the guard cannot resolve a
snapshot → **503 `ENTITLEMENT_UNAVAILABLE`**, audited as `denialType: "503"`. (The
frontend shows the generic error for 503 — by design, `mapEntitlementError` maps only
403 `SUBSCRIPTION_INACTIVE` and 429 `ENTITLEMENT_EXCEEDED`.)

### Restore afterwards

```js
db.subscriptions.updateOne(
  { tenantId: ObjectId("<yourTenantId>") },
  { $set: { status: "ACTIVE" } }
)
```

---

## Test C — Token counting visible (feature 1)

1. On `/company/usage`, note the current `queriesPerMonth` (and `tokensPerMonth`) usage
2. Send 2–3 chat queries
3. Refresh the usage page → `queriesPerMonth` increments on each query;
   `tokensPerMonth` increments only if the AI adapter reports token usage (the dev fake
   model may leave it at 0 — that is the designed "no usage metadata → skip, log
   warning" behavior, itself one of the covered test cases)

---

## Not UI-testable (automated coverage only)

| Feature | Why not UI-testable | Covered by |
|---|---|---|
| Feature 3 — consume/reserve races | Race window is sub-millisecond; needs 10 parallel calls | `api/src/modules/entitlement/__tests__/entitlement.concurrency.test.ts` (5 tests, real Mongo, `Promise.allSettled`) |
| Feature 4 — subscription change mid-reservation | Reservation/commit happens inside one request | `api/src/modules/entitlement/__tests__/entitlement.service.test.ts` — state-change suite (CANCELED mid-flight → reservation released + 503; EXPIRED/refunded during consume → throws pre-increment; ACTIVE → success) |

Run them with:

```powershell
cd api
node ../scripts/run-api-tests.mjs src/modules/entitlement/__tests__/entitlement.concurrency.test.ts src/modules/entitlement/__tests__/entitlement.service.test.ts
```

---

## Cleanup (reset test state)

```js
db.quotaoverrides.deleteMany({ reason: "UI test" })
db.quotacounters.updateMany(
  { tenantId: ObjectId("<yourTenantId>") },
  { $set: { value: 0 } }
)
db.audit_logs.deleteMany({ action: "entitlement.denial" })  // only if you want them gone
```

---

## Quick smoke path

**Test A** (override → 429 banner + audit row) and **Test B** (cancel → inactive UI +
reactivation CTA) cover the two user-facing features end-to-end. Everything else is
proven by the automated suites: api **920/920**, app **578/578**, both typechecks
clean.

## Reference evidence

- Plan: `.omo/plans/issue25-remaining-gaps.md`
- Per-todo evidence: `.omo/evidence/task-{1..5}-issue25-remaining-gaps.md`
- Verification reports: `.omo/evidence/F1/F2/F3-issue25-remaining-gaps.md`
- Key source: `api/src/modules/intent-query/intentQuery.service.ts` (post-consume token counting),
  `api/src/modules/entitlement/entitlement-audit.ts` (denial audit),
  `api/src/modules/entitlement/entitlement.service.ts` (commit re-validation),
  `app/src/lib/entitlement-errors.ts` + `app/src/components/entitlement/UpgradePrompt.tsx` (denial UI)
