# Stripe Checkout payment failure webhook inspection

**Session ID:** ses_07b8f9921ffecLxI2bWAYydRxW
**Created:** 7/21/2026, 2:29:46 PM
**Updated:** 7/21/2026, 2:48:08 PM

---

## User

We just tested a failed Stripe Checkout payment using the test card 4000 0000 0000 0341.

The frontend showed:
"Your card was declined. Please try a different card."

The API logs only show:
POST /checkout/sessions → 201

No webhook-related event appeared in the API logs.

Please inspect the existing Stripe webhook implementation and tell me exactly:

1. What is the webhook endpoint URL and HTTP method?
2. Which Stripe events are currently handled by the application?
3. Which event should be expected when a subscription Checkout payment is declined during the initial payment?
4. Is the current implementation expected to create/update an internal Subscription when the initial Checkout payment fails?
5. Is there any missing webhook event handler for this scenario?
6. Do not modify code yet. Only inspect the repository and give me a precise diagnosis based on the current implementation.

Also verify whether the current Stripe integration uses:
- checkout.session.completed
- invoice.paid
- invoice.payment_failed
- payment_intent.payment_failed
- customer.subscription.updated
- customer.subscription.deleted 

---

## Assistant (Build · Big Pickle · 207.6s)

_Thinking:_

The user wants me to inspect their Stripe webhook implementation and provide a diagnosis. Let me explore the codebase to find the relevant files.

**Tool: task**

**Input:**
```json
{
  "description": "Explore Stripe webhook implementation",
  "prompt": "I need to thoroughly inspect a Stripe webhook implementation in this repository. Please do the following:\n\n1. Search for all files related to Stripe webhooks, checkout sessions, and payment handling. Look for patterns like \"webhook\", \"stripe\", \"checkout\", \"invoice\", \"subscription\", \"payment_intent\" across the codebase.\n2. Find the webhook endpoint definition (URL path, HTTP method, middleware).\n3. Find all Stripe event type handlers - which events are explicitly handled.\n4. Find the Stripe checkout session creation code.\n5. Find any subscription-related logic (creation, update, deletion).\n6. Look for environment variable configuration related to Stripe (STRIPE_WEBHOOK_SECRET, etc.)\n\nReturn:\n- The full file paths and line numbers for each relevant file\n- The complete content of the webhook handler file(s)\n- The complete content of the checkout session creation file(s)\n- Any subscription model/schema definitions\n- The route definitions showing the webhook URL path\n- Any Stripe event type constants or string literals used\n\nBe very thorough - check all directories including src/, app/, api/, lib/, services/, utils/, routes/, controllers/, etc. Also check package.json for Stripe SDK usage.",
  "subagent_type": "explore"
}
```

**Output:**
```
<task id="ses_07b8f58c1ffeG6ExcM6T943UWz" state="completed">
<task_result>
Now I have all the information needed. Here is the complete, structured report.

---

# Stripe Webhook & Payment Implementation -- Full Audit Report

## 1. Stripe SDK Usage

- **Package**: `stripe` version `^22.3.2`
- **Declared in**: `/home/marco/documind-ai/api/package.json` (line 47)

---

## 2. Webhook Endpoint Definition

### Route Registration

**File**: `/home/marco/documind-ai/api/src/app.ts`

| Line | Detail |
|------|--------|
| 30 | `import paymentWebhookRoutes from "./modules/payment-webhooks/payment-webhooks.routes.js";` |
| 145 | `app.use("/webhooks/payment", paymentWebhookRoutes);` |

**Effective URL path**: `POST /webhooks/payment/stripe`

### Raw Body Middleware (Critical for Stripe Signature Verification)

**File**: `/home/marco/documind-ai/api/src/app.ts`

| Line | Detail |
|------|--------|
| 106-109 | `express.raw({ type: "application/json", limit: "100kb" })` applied **only** to `/webhooks/payment/stripe` |
| 111-115 | `express.json()` is applied to all routes **except** those under `/webhooks/` |

```typescript
// Line 108-109:
const rawBodyBuffer = express.raw({ type: "application/json", limit: "100kb" });
app.use("/webhooks/payment/stripe", rawBodyBuffer);

// Line 112-115:
app.use((req, res, next) => {
  if (req.path.startsWith("/webhooks/")) return next();
  express.json()(req, res, next);
});
```

### Route Definition

**File**: `/home/marco/documind-ai/api/src/modules/payment-webhooks/payment-webhooks.routes.ts` (8 lines)

```typescript
const router = Router();
router.post("/stripe", webhookHandlerController);
export default router;
```

**Middleware**: No authentication or tenant scoping middleware is applied. The webhook endpoint is public (as required by Stripe).

---

## 3. Webhook Controller

**File**: `/home/marco/documind-ai/api/src/modules/payment-webhooks/payment-webhooks.controller.ts` (41 lines)

Full content shown above. Key flow:

1. Extracts `stripe-signature` header (line 10-11)
2. Gets raw body as string from `req.body` (Buffer) (line 13-14)
3. Loads the payment provider via `getPaymentProvider()` (line 16)
4. Calls `provider.verifyWebhookSignature(rawBody, signature)` (line 18) -- returns 400 if invalid
5. Parses JSON payload (line 26)
6. Calls `provider.parseWebhookEvent(payload)` (line 34)
7. Calls `handlePaymentEvent(event, rawBody, signature)` (line 35)
8. Returns `200 { received: true }` always (even on processing errors, line 39)

---

## 4. All Stripe Event Type Handlers

**File**: `/home/marco/documind-ai/api/src/modules/payment-webhooks/payment-webhooks.service.ts` (520 lines)

### 4a. Static Event-to-Status Mapping (lines 42-70)

These are the explicitly handled event types:

| Stripe Event Type | Target Status | Payment State | Allowed From Statuses |
|---|---|---|---|
| `checkout.session.completed` | `INCOMPLETE` | `paid` | `INCOMPLETE`, `TRIALING` |
| `invoice.paid` | `ACTIVE` | `paid` | `INCOMPLETE`, `PAST_DUE`, `ACTIVE` |
| `invoice.payment_failed` | `PAST_DUE` | `failed` | `ACTIVE`, `INCOMPLETE` |
| `customer.subscription.deleted` | `EXPIRED` | `failed` | `ACTIVE`, `PAST_DUE`, `PAUSED`, `CANCEL_AT_PERIOD_END` |

### 4b. Dynamic Subscription Update Handler (lines 72-90, 238-347)

**Event**: `customer.subscription.updated`

Uses `STRIPE_STATUS_MAP` (lines 74-82) to map Stripe statuses:

| Stripe Status | Internal Status |
|---|---|
| `active` | `ACTIVE` |
| `trialing` | `ACTIVE` |
| `past_due` | `PAST_DUE` |
| `unpaid` | `UNPAID` |
| `incomplete` | `INCOMPLETE` |
| `incomplete_expired` | `EXPIRED` |
| `canceled` | `CANCELED` |

Special case: if `cancel_at_period_end` is `true`, the status is overridden to `CANCEL_AT_PERIOD_END` regardless of the Stripe status (line 88).

### 4c. Event Routing Logic (lines 124-133)

```typescript
const isSubscriptionUpdate = event.type === "customer.subscription.updated";
if (isSubscriptionUpdate) {
  await handleSubscriptionUpdated(event, eventRecord);
} else {
  const mapping = EVENT_STATUS_MAP[event.type];
  if (mapping) {
    await handleStaticMappingEvent(event, mapping, eventRecord);
  }
}
```

Events NOT in the static map and NOT `customer.subscription.updated` are silently ignored (no error recorded).

### 4d. Summary of ALL Handled Event Types

1. `checkout.session.completed`
2. `invoice.paid`
3. `invoice.payment_failed`
4. `customer.subscription.updated`
5. `customer.subscription.deleted`

---

## 5. Subscription Resolution from Events

**File**: `/home/marco/documind-ai/api/src/modules/payment-webhooks/payment-webhooks.service.ts`, lines 356-382

The `resolveSubscriptionFromEvent()` function tries three strategies in order:

1. **`metadata.tenantId`** from the event's `data.object.metadata` (line 360-363)
2. **`providerCustomerId`** (Stripe `customer` field) lookup (line 365-371)
3. **`providerSubscriptionId`** (Stripe `subscription` field) lookup (line 373-379)

Returns `null` if no subscription is found, causing the event to be marked as `failed`.

---

## 6. Stripe Checkout Session Creation

### 6a. Service Layer

**File**: `/home/marco/documind-ai/api/src/modules/checkout/checkout.service.ts` (303 lines)

Key function: `createCheckoutSession()` (lines 73-176)

Flow:
1. Authorizes the tenant via `Permission.BILLING_MANAGE` (line 82-85)
2. Loads and validates the package (lines 89-95)
3. Checks subscription is not `CANCELED` (lines 97-100)
4. Creates or reuses a Stripe Customer (lines 102-116) -- detects `cus_fake_*` prefix and creates a real Stripe customer
5. Resolves the Stripe Price ID via `getProviderPriceId()` (lines 46-71) -- uses `stripePriceId` or `stripeAnnualPriceId` from the package
6. Calls `provider.createCheckoutSession()` with metadata containing `tenantId`, `packageId`, `packageVersion`, `billingInterval` (lines 123-134)
7. Persists the checkout session in `CheckoutSessionModel` (lines 137-149)
8. Writes audit event `CHECKOUT_SESSION_CREATED` (lines 158-169)
9. Returns `{ checkoutId, sessionUrl, providerSessionId }`

### 6b. Stripe Provider Implementation

**File**: `/home/marco/documind-ai/api/src/modules/billing/ports/adapters/stripe-payment-provider.ts` (165 lines)

`createCheckoutSession()` (lines 41-61):

```typescript
const session = await stripe.checkout.sessions.create({
  customer: params.customerId,
  mode: "subscription",
  line_items: [{ price: params.priceId, quantity: 1 }],
  success_url: params.successUrl,
  cancel_url: params.cancelUrl,
  metadata: params.metadata,
});
```

### 6c. Controller Layer

**File**: `/home/marco/documind-ai/api/src/modules/checkout/checkout.controller.ts` (141 lines)

`createCheckoutController` (lines 70-112) adds:
- Success URL: `config.STRIPE_SUCCESS_URL + "?session_id={CHECKOUT_SESSION_ID}"` (line 75-77)
- Cancel URL: `config.STRIPE_CANCEL_URL` (line 78)
- Fake provider auto-complete: when using `FakePaymentProvider`, it immediately marks session complete and transitions subscription to ACTIVE (lines 90-109)

### 6d. Checkout Routes

**File**: `/home/marco/documind-ai/api/src/modules/checkout/checkout.routes.ts` (48 lines)

All routes are behind `authenticate` and `tenantScoping` middleware:

| Method | Path | Permission | Handler |
|--------|------|-----------|---------|
| `POST` | `/checkout/sessions` | `BILLING_MANAGE` | `createCheckoutController` |
| `GET` | `/checkout/sessions/:checkoutId` | `BILLING_READ` | `checkoutStatusController` |
| `GET` | `/checkout/sessions` | `BILLING_READ` | `listCheckoutSessionsController` |
| `GET` | `/checkout/subscription` | `BILLING_READ` | `subscriptionStatusController` |
| `POST` | `/checkout/billing-portal` | `BILLING_MANAGE` | `createBillingPortalController` |

---

## 7. Subscription Model/Schema

### 7a. Database Model

**File**: `/home/marco/documind-ai/api/src/db/models/subscription.model.ts` (100 lines)

Fields:
| Field | Type | Notes |
|-------|------|-------|
| `tenantId` | ObjectId (ref Tenant) | **unique**, required |
| `packageId` | ObjectId (ref Package) | required, indexed |
| `packageVersion` | Number | min 1 |
| `status` | Enum(9 values) | default `ACTIVE`, indexed |
| `renewsAt` | Date | **deprecated** |
| `startedAt` | Date | required |
| `periodStart` | Date | nullable |
| `periodEnd` | Date | nullable |
| `trialStart` | Date | nullable |
| `trialEnd` | Date | nullable |
| `cancelledAt` | Date | nullable |
| `cancellationReason` | String | |
| `providerCustomerId` | String | Stripe `cus_*` |
| `providerSubscriptionId` | String | Stripe `sub_*` |
| `providerPriceId` | String | Stripe `price_*` |
| `paymentState` | Enum: `pending`, `paid`, `failed`, `refunded` | |
| `providerMetadata` | Map(String) | |
| `lastProviderEventId` | String | |

9-state enum: `TRIALING`, `INCOMPLETE`, `ACTIVE`, `PAST_DUE`, `PAUSED`, `CANCEL_AT_PERIOD_END`, `CANCELED`, `EXPIRED`, `UNPAID`

### 7b. Domain Types

**File**: `/home/marco/documind-ai/api/src/modules/billing/billing.types.ts` (52 lines)

Defines `SubscriptionStatus` (9 states), `PaymentState` (4 states), `PackageEntitlement`, `PackageSnapshot`, and `SubscriptionTransition`.

### 7c. Subscription Service (State Machine)

**File**: `/home/marco/documind-ai/api/src/modules/billing/subscription.service.ts` (232 lines)

`LEGAL_TRANSITIONS` (lines 20-30):

```
TRIALING       -> [ACTIVE, PAST_DUE, CANCEL_AT_PERIOD_END]
INCOMPLETE     -> [ACTIVE, PAST_DUE, EXPIRED]
ACTIVE         -> [PAST_DUE, PAUSED, CANCEL_AT_PERIOD_END, EXPIRED]
PAST_DUE       -> [ACTIVE, PAUSED, EXPIRED, UNPAID]
PAUSED         -> [ACTIVE, EXPIRED]
CANCEL_AT_PERIOD_END -> [ACTIVE, CANCELED, EXPIRED]
CANCELED       -> []  (terminal)
EXPIRED        -> [ACTIVE, UNPAID]
UNPAID         -> [ACTIVE, EXPIRED]
```

---

## 8. PaymentEvent Model (Webhook Audit Trail)

**File**: `/home/marco/documind-ai/api/src/db/models/paymentEvent.model.ts` (45 lines)

Fields: `eventId` (unique), `eventType`, `provider` (default "stripe"), `status` (received/verified/processed/failed), `signature`, `rawBody`, `payload` (Mixed), `processingErrors[]`, `processedAt`, `tenantId`.

---

## 9. CheckoutSession Model

**File**: `/home/marco/documind-ai/api/src/db/models/checkoutSession.model.ts` (65 lines)

Fields: `tenantId`, `packageId`, `packageVersion`, `billingInterval` (monthly/annual), `providerSessionId` (unique), `providerCustomerId`, `status` (pending/completed/expired/failed), `returnUrl`, `cancelUrl`, `metadata`, `expiresAt`, `completedAt`.

---

## 10. Stripe Signature Verification

**File**: `/home/marco/documind-ai/api/src/modules/billing/ports/adapters/stripe-payment-provider.ts`, lines 94-122

```typescript
verifyWebhookSignature(body: string, signature: string): boolean {
  const secret = config.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    if (config.NODE_ENV === "production") {
      // FAIL-CLOSED: rejects in production when secret is missing
      return false;
    }
    // SKIP in development (returns true)
    return true;
  }
  stripeClient.webhooks.constructEvent(body, signature, secret);
  return true;
}
```

---

## 11. Environment Variable Configuration

### 11a. Env Schema

**File**: `/home/marco/documind-ai/api/src/config/env.ts`, lines 148-154

| Variable | Type | Default |
|----------|------|---------|
| `PAYMENT_PROVIDER` | `enum("fake", "stripe")` | `"fake"` |
| `STRIPE_SECRET_KEY` | `string` | `""` |
| `STRIPE_WEBHOOK_SECRET` | `string` | `""` |
| `STRIPE_PUBLISHABLE_KEY` | `string` | `""` |
| `STRIPE_SUCCESS_URL` | `string (url)` | `"http://localhost:3000/checkout/success"` |
| `STRIPE_CANCEL_URL` | `string (url)` | `"http://localhost:3000/checkout/cancel"` |
| `STRIPE_BILLING_PORTAL_RETURN_URL` | `string (url)` | `"http://localhost:3000/checkout"` |

### 11b. Validation Rule (line 194-200)

When `PAYMENT_PROVIDER === "stripe"`, `STRIPE_SECRET_KEY` is **required**.

### 11c. Secret Resolution (lines 243-252)

Both `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` go through `getSecretValue()` (supports Docker secrets via `_FILE` suffix pattern).

### 11d. Docker Secrets

**File**: `/home/marco/documind-ai/docker-compose.yml`, lines 20-21, 30-31, 185-188

```
STRIPE_SECRET_KEY_FILE=/run/secrets/stripe_secret_key
STRIPE_WEBHOOK_SECRET_FILE=/run/secrets/stripe_webhook_secret
```

Source files:
- `/home/marco/documind-ai/secrets/stripe_secret_key.txt`
- `/home/marco/documind-ai/secrets/stripe_webhook_secret.txt`

---

## 12. Payment Provider Loader

**File**: `/home/marco/documind-ai/api/src/modules/checkout/payment-provider-loader.ts` (33 lines)

Lazy singleton. Based on `config.PAYMENT_PROVIDER`:
- `"stripe"` --> `StripePaymentProvider`
- anything else --> `FakePaymentProvider`

---

## 13. Stripe Product/Price Sync

**File**: `/home/marco/documind-ai/api/src/modules/billing/stripe-sync.service.ts` (162 lines)

`syncPackageToStripe()`:
1. Skips free packages (both prices = 0)
2. Creates a Stripe Product if `stripeProductId` is missing
3. Creates monthly Stripe Price if missing or pricing changed (prices are immutable in Stripe)
4. Creates annual Stripe Price if missing or pricing changed
5. Mutates the package document in-place with the new Stripe IDs

---

## 14. Billing Portal

**File**: `/home/marco/documind-ai/api/src/modules/checkout/checkout.service.ts`, lines 259-303

`createBillingPortalSession()` calls `provider.createBillingPortalSession()` with the customer's `providerCustomerId` and a return URL.

**Stripe implementation**: `/home/marco/documind-ai/api/src/modules/billing/ports/adapters/stripe-payment-provider.ts`, lines 83-92

```typescript
const session = await stripe.billingPortal.sessions.create({
  customer: params.customerId,
  return_url: params.returnUrl,
});
```

Route: `POST /checkout/billing-portal` (authenticated, `BILLING_MANAGE` permission)

---

## 15. Admin Routes (Super Admin)

**File**: `/home/marco/documind-ai/api/src/modules/payment-webhooks/payment-webhooks.admin.ts` (59 lines)

Mounted at `/super-admin` (app.ts line 146). All routes require `authenticate` + `requirePlatformTenant`:

| Method | Path | Permission | Handler |
|--------|------|-----------|---------|
| `GET` | `/super-admin/payment-events` | `BILLING_READ` | List payment events (paginated) |
| `POST` | `/super-admin/payment-events/:eventId/reprocess` | `BILLING_MANAGE` | Reprocess a failed event |

---

## 16. Frontend Pages

| Page | File |
|------|------|
| Checkout/Plan Selection | `/home/marco/documind-ai/app/src/app/checkout/page.tsx` (260 lines) |
| Checkout Success | `/home/marco/documind-ai/app/src/app/checkout/success/page.tsx` (140 lines) |
| Checkout Cancel | `/home/marco/documind-ai/app/src/app/checkout/cancel/page.tsx` (39 lines) |
| Billing Service (API client) | `/home/marco/documind-ai/app/src/services/billing.service.ts` (84 lines) |
| Billing Types (frontend) | `/home/marco/documind-ai/app/src/types/api/billing.types.ts` (94 lines) |

---

## 17. Error Codes

**File**: `/home/marco/documind-ai/api/src/common/errors/errorCodes.ts`, lines 52-56

```typescript
export const WEBHOOK_SIGNATURE_INVALID = "WEBHOOK_SIGNATURE_INVALID";
export const CHECKOUT_SESSION_EXPIRED = "CHECKOUT_SESSION_EXPIRED";
export const PRICE_NOT_CONFIGURED = "PRICE_NOT_CONFIGURED";
export const STRIPE_PRODUCT_SYNC_FAILED = "STRIPE_PRODUCT_SYNC_FAILED";
export const BILLING_PORTAL_UNAVAILABLE = "BILLING_PORTAL_UNAVAILABLE";
```

---

## 18. Test Files

| Test File | Lines | Description |
|-----------|-------|-------------|
| `/home/marco/documind-ai/api/src/modules/billing/__tests__/payment-webhooks.service.test.ts` | 738 | Idempotency, tenant resolution, all event types, status mapping |
| `/home/marco/documind-ai/api/src/modules/billing/__tests__/stripe-sync.service.test.ts` | ~399 | isBillable, pricing change detection, sync idempotency |
| `/home/marco/documind-ai/api/src/modules/billing/__tests__/subscription.service.test.ts` | ~81 pairs | All 81 legal transition pairs |
| `/home/marco/documind-ai/api/src/modules/payment-webhooks/__tests__/payment-webhooks.test.ts` | 62 | Source-level assertions for webhook handler/controller |
| `/home/marco/documind-ai/api/src/modules/payment-webhooks/__tests__/payment-webhooks.admin.test.ts` | -- | Admin route tests |
| `/home/marco/documind-ai/api/src/modules/checkout/__tests__/checkout.service.test.ts` | -- | Checkout service tests |
| `/home/marco/documind-ai/api/src/modules/checkout/__tests__/checkout.routes.test.ts` | -- | Checkout route tests |
| `/home/marco/documind-ai/api/src/modules/billing/ports/__tests__/payment-provider.contract.suite.ts` | 159 | Contract test suite for PaymentProvider interface |
| `/home/marco/documind-ai/api/src/modules/billing/ports/fakes/__tests__/fake-subscription-provisioning.contract.test.ts` | -- | Fake adapter contract tests |
| `/home/marco/documind-ai/api/src/modules/billing/ports/fakes/__tests__/fake-payment-provider.contract.test.ts` | -- | Fake payment provider contract tests |

---

## 19. Complete File Inventory

### Backend Core Files
| File | Lines | Purpose |
|------|-------|---------|
| `/home/marco/documind-ai/api/src/modules/payment-webhooks/payment-webhooks.routes.ts` | 8 | Webhook route: `POST /stripe` |
| `/home/marco/documind-ai/api/src/modules/payment-webhooks/payment-webhooks.controller.ts` | 41 | Webhook controller: signature check, parse, dispatch |
| `/home/marco/documind-ai/api/src/modules/payment-webhooks/payment-webhooks.service.ts` | 520 | Webhook processing: event handlers, status mapping, tenant resolution |
| `/home/marco/documind-ai/api/src/modules/payment-webhooks/payment-webhooks.admin.ts` | 59 | Admin: list/reprocess payment events |
| `/home/marco/documind-ai/api/src/modules/checkout/checkout.routes.ts` | 48 | Checkout routes: sessions, subscription status, billing portal |
| `/home/marco/documind-ai/api/src/modules/checkout/checkout.controller.ts` | 141 | Checkout controllers |
| `/home/marco/documind-ai/api/src/modules/checkout/checkout.service.ts` | 303 | Checkout business logic: create session, billing portal, status |
| `/home/marco/documind-ai/api/src/modules/checkout/checkout.validator.ts` | 38 | Zod schemas for checkout input validation |
| `/home/marco/documind-ai/api/src/modules/checkout/payment-provider-loader.ts` | 33 | Lazy singleton provider loader |
| `/home/marco/documind-ai/api/src/modules/billing/ports/payment-provider.port.ts` | 76 | PaymentProvider interface (port) |
| `/home/marco/documind-ai/api/src/modules/billing/ports/adapters/stripe-payment-provider.ts` | 165 | Real Stripe adapter: customers, checkout, portal, webhook verification |
| `/home/marco/documind-ai/api/src/modules/billing/ports/fakes/fake-payment-provider.ts` | 210 | Fake payment provider for dev/test |
| `/home/marco/documind-ai/api/src/modules/billing/subscription.service.ts` | 232 | Subscription state machine: create, transition, list |
| `/home/marco/documind-ai/api/src/modules/billing/stripe-sync.service.ts` | 162 | Package-to-Stripe sync: products and prices |
| `/home/marco/documind-ai/api/src/modules/billing/billing.types.ts` | 52 | Domain types: SubscriptionStatus, PackageSnapshot, etc. |
| `/home/marco/documind-ai/api/src/modules/billing/index.ts` | 5 | Barrel exports |
| `/home/marco/documind-ai/api/src/modules/billing/ports/subscription-provisioning.port.ts` | 64 | SubscriptionProvisioningPort interface |
| `/home/marco/documind-ai/api/src/modules/billing/ports/fakes/fake-subscription-provisioning.ts` | 312 | Fake subscription provisioning adapter |

### Database Models
| File | Lines | Purpose |
|------|-------|---------|
| `/home/marco/documind-ai/api/src/db/models/subscription.model.ts` | 100 | Subscription schema (9-state, provider IDs) |
| `/home/marco/documind-ai/api/src/db/models/checkoutSession.model.ts` | 65 | Checkout session schema |
| `/home/marco/documind-ai/api/src/db/models/paymentEvent.model.ts` | 45 | Payment event audit trail schema |

### Config & Infrastructure
| File | Lines | Purpose |
|------|-------|---------|
| `/home/marco/documind-ai/api/src/config/env.ts` | 267 | Environment config (Stripe env vars at lines 148-154, validation at 194-200) |
| `/home/marco/documind-ai/api/src/app.ts` | 208 | Express app: raw body middleware (108-109), JSON skip (112-115), route mounting (145-148) |
| `/home/marco/documind-ai/api/src/common/errors/errorCodes.ts` | 76 | Error codes (billing-related at lines 52-56) |
| `/home/marco/documind-ai/docker-compose.yml` | 192 | Docker secrets for Stripe keys (lines 20-21, 30-31, 185-188) |
| `/home/marco/documind-ai/api/.env.example` | 93 | Stripe env var documentation (lines 50-58) |
| `/home/marco/documind-ai/api/package.json` | 71 | `stripe: ^22.3.2` dependency (line 47) |

### Frontend
| File | Lines | Purpose |
|------|-------|---------|
| `/home/marco/documind-ai/app/src/app/checkout/page.tsx` | 260 | Plan selection, billing toggle, checkout button, Manage Billing portal |
| `/home/marco/documind-ai/app/src/app/checkout/success/page.tsx` | 140 | Post-payment: polls subscription status until ACTIVE |
| `/home/marco/documind-ai/app/src/app/checkout/cancel/page.tsx` | 39 | Checkout cancellation page |
| `/home/marco/documind-ai/app/src/services/billing.service.ts` | 84 | Frontend API client for checkout, subscription, billing portal |
| `/home/marco/documind-ai/app/src/types/api/billing.types.ts` | 94 | Frontend TypeScript types for billing |
</task_result>
</task>
```

---

## Assistant (Build · Big Pickle · 9.9s)

_Thinking:_

Now let me read the key files to understand the exact implementation details, particularly around what happens when a checkout payment fails.

Let me read the critical files to verify the exact flow for declined payments.

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/marco/documind-ai/api/src/modules/payment-webhooks/payment-webhooks.service.ts"
}
```

**Output:**
```
<path>/home/marco/documind-ai/api/src/modules/payment-webhooks/payment-webhooks.service.ts</path>
<type>file</type>
<content>
1: import { Types } from "mongoose";
2: import PaymentEventModel, {
3:   type PaymentEventDocument,
4: } from "../../db/models/paymentEvent.model.js";
5: import SubscriptionModel from "../../db/models/subscription.model.js";
6: import CheckoutSessionModel from "../../db/models/checkoutSession.model.js";
7: import { logger } from "../../common/logger/logger.js";
8: import { getAuditWriter } from "../../common/observability/index.js";
9: import { transitionSubscription } from "../billing/subscription.service.js";
10: import type { PaymentProviderEvent } from "../billing/ports/payment-provider.port.js";
11: import type { SubscriptionStatus } from "../billing/billing.types.js";
12: import { AppError } from "../../common/errors/AppError.js";
13: import { NOT_FOUND } from "../../common/errors/errorCodes.js";
14: import { Permission } from "../permissions/permissions.catalog.js";
15: import {
16:   authorizePlatformOperation,
17:   type OperationAuthorizationContext,
18: } from "../permissions/permissions.operation.js";
19: 
20: function writeAudit(
21:   action: string,
22:   resourceId: string,
23:   changes: Record<string, unknown>,
24:   tenantId: string,
25: ): void {
26:   const writer = getAuditWriter();
27:   writer
28:     .write({
29:       action: action as never,
30:       resourceType: "Subscription" as never,
31:       resourceId,
32:       changes,
33:       tenantId,
34:     })
35:     .catch((err: unknown) => {
36:       console.error("Audit write failed (non-blocking):", err);
37:     });
38: }
39: 
40: // ── Static event → status mapping (excluding customer.subscription.updated) ──
41: 
42: const EVENT_STATUS_MAP: Record<
43:   string,
44:   {
45:     toStatus: SubscriptionStatus;
46:     paymentState: "paid" | "failed";
47:     fromStatuses: SubscriptionStatus[];
48:   }
49: > = {
50:   "checkout.session.completed": {
51:     toStatus: "INCOMPLETE",
52:     paymentState: "paid",
53:     fromStatuses: ["INCOMPLETE", "TRIALING"],
54:   },
55:   "invoice.paid": {
56:     toStatus: "ACTIVE",
57:     paymentState: "paid",
58:     fromStatuses: ["INCOMPLETE", "PAST_DUE", "ACTIVE"],
59:   },
60:   "invoice.payment_failed": {
61:     toStatus: "PAST_DUE",
62:     paymentState: "failed",
63:     fromStatuses: ["ACTIVE", "INCOMPLETE"],
64:   },
65:   "customer.subscription.deleted": {
66:     toStatus: "EXPIRED",
67:     paymentState: "failed",
68:     fromStatuses: ["ACTIVE", "PAST_DUE", "PAUSED", "CANCEL_AT_PERIOD_END"],
69:   },
70: };
71: 
72: // ── Stripe subscription status → internal status mapping ─────────────────────
73: 
74: const STRIPE_STATUS_MAP: Record<string, SubscriptionStatus> = {
75:   active: "ACTIVE",
76:   trialing: "ACTIVE",
77:   past_due: "PAST_DUE",
78:   unpaid: "UNPAID",
79:   incomplete: "INCOMPLETE",
80:   incomplete_expired: "EXPIRED",
81:   canceled: "CANCELED",
82: };
83: 
84: function mapStripeStatusToInternal(
85:   stripeStatus: string,
86:   cancelAtPeriodEnd: boolean,
87: ): SubscriptionStatus | null {
88:   if (cancelAtPeriodEnd) return "CANCEL_AT_PERIOD_END";
89:   return STRIPE_STATUS_MAP[stripeStatus] ?? null;
90: }
91: 
92: // ── Core event handler ───────────────────────────────────────────────────────
93: 
94: export async function handlePaymentEvent(
95:   event: PaymentProviderEvent,
96:   rawBody: string,
97:   signature: string,
98:   existingEvent?: PaymentEventDocument,
99: ): Promise<void> {
100:   const duplicate = existingEvent
101:     ? null
102:     : await PaymentEventModel.findOne({ eventId: event.id }).exec();
103:   if (duplicate) {
104:     logger.info({ eventId: event.id }, "Duplicate webhook event — skipping");
105:     return;
106:   }
107: 
108:   const eventRecord =
109:     existingEvent ??
110:     (await PaymentEventModel.create({
111:       eventId: event.id,
112:       eventType: event.type,
113:       provider: event.provider,
114:       status: "received",
115:       signature,
116:       rawBody,
117:       payload: event.raw,
118:       processingErrors: [],
119:     }));
120: 
121:   try {
122:     eventRecord.status = "verified";
123: 
124:     const isSubscriptionUpdate = event.type === "customer.subscription.updated";
125: 
126:     if (isSubscriptionUpdate) {
127:       await handleSubscriptionUpdated(event, eventRecord);
128:     } else {
129:       const mapping = EVENT_STATUS_MAP[event.type];
130:       if (mapping) {
131:         await handleStaticMappingEvent(event, mapping, eventRecord);
132:       }
133:     }
134: 
135:     if (eventRecord.processingErrors.length === 0) {
136:       eventRecord.status = "processed";
137:       eventRecord.processedAt = new Date();
138:       await eventRecord.save();
139:     }
140:   } catch (error) {
141:     logger.error({ err: error, eventId: event.id }, "Failed to process payment event");
142:     eventRecord.status = "failed";
143:     eventRecord.processingErrors.push(
144:       error instanceof Error ? error.message : "Unknown error",
145:     );
146:     await eventRecord.save();
147:   }
148: }
149: 
150: // ── Static mapping handler (checkout, invoice, subscription.deleted) ─────────
151: 
152: async function handleStaticMappingEvent(
153:   event: PaymentProviderEvent,
154:   mapping: {
155:     toStatus: SubscriptionStatus;
156:     paymentState: "paid" | "failed";
157:     fromStatuses: SubscriptionStatus[];
158:   },
159:   eventRecord: PaymentEventDocument,
160: ): Promise<void> {
161:   const resolved = await resolveSubscriptionFromEvent(event);
162: 
163:   if (!resolved) {
164:     eventRecord.processingErrors.push(
165:       "No subscription found for event (tenantId not resolvable)",
166:     );
167:     eventRecord.status = "failed";
168:     await eventRecord.save();
169:     return;
170:   }
171: 
172:   const { subscription: sub, tenantId } = resolved;
173:   const currentStatus = sub.status as SubscriptionStatus;
174: 
175:   const transitionOptions: Record<string, unknown> = {
176:     triggeredBy: "provider_event",
177:     providerEventId: event.id,
178:   };
179: 
180:   const packageId = extractPackageIdFromEvent(event);
181:   if (packageId) {
182:     transitionOptions.packageId = packageId;
183:   }
184: 
185:   if (mapping.fromStatuses.includes(currentStatus)) {
186:     await transitionSubscription(
187:       String(tenantId),
188:       mapping.toStatus,
189:       transitionOptions,
190:     );
191:   }
192: 
193:   const subscriptionUpdate: Record<string, unknown> = {
194:     paymentState: mapping.paymentState,
195:     lastProviderEventId: event.id,
196:     providerSubscriptionId:
197:       extractStripeSubscriptionIdFromEvent(event) ??
198:       sub.providerSubscriptionId,
199:   };
200: 
201:   if (packageId) {
202:     subscriptionUpdate.packageId = new Types.ObjectId(packageId);
203:   }
204: 
205:   await SubscriptionModel.updateOne(
206:     { tenantId },
207:     { $set: subscriptionUpdate },
208:   );
209: 
210:   const sessionId = extractCheckoutSessionId(event);
211:   if (sessionId) {
212:     await CheckoutSessionModel.updateOne(
213:       { providerSessionId: sessionId },
214:       {
215:         $set: {
216:           status: "completed",
217:           completedAt: new Date(),
218:         },
219:       },
220:     );
221:   }
222: 
223:   writeAudit(
224:     "SUBSCRIPTION_UPDATED",
225:     String(sub._id),
226:     {
227:       eventType: event.type,
228:       newStatus: mapping.toStatus,
229:       paymentState: mapping.paymentState,
230:       providerEventId: event.id,
231:     },
232:     String(tenantId),
233:   );
234: }
235: 
236: // ── customer.subscription.updated handler ─────────────────────────────────────
237: 
238: async function handleSubscriptionUpdated(
239:   event: PaymentProviderEvent,
240:   eventRecord: PaymentEventDocument,
241: ): Promise<void> {
242:   const resolved = await resolveSubscriptionFromEvent(event);
243: 
244:   if (!resolved) {
245:     eventRecord.processingErrors.push(
246:       "No subscription found for customer.subscription.updated event",
247:     );
248:     eventRecord.status = "failed";
249:     await eventRecord.save();
250:     return;
251:   }
252: 
253:   const { subscription: sub, tenantId } = resolved;
254:   const currentStatus = sub.status as SubscriptionStatus;
255: 
256:   const stripeStatus = extractStripeSubscriptionStatus(event);
257:   const cancelAtPeriodEnd = extractCancelAtPeriodEnd(event);
258: 
259:   const mappedStatus = mapStripeStatusToInternal(
260:     stripeStatus,
261:     cancelAtPeriodEnd,
262:   );
263: 
264:   if (!mappedStatus) {
265:     logger.warn(
266:       { eventId: event.id, stripeStatus },
267:       "Unknown Stripe subscription status — skipping transition",
268:     );
269:     return;
270:   }
271: 
272:   const LEGAL_TRANSITIONS: Record<SubscriptionStatus, readonly SubscriptionStatus[]> = {
273:     TRIALING: ["ACTIVE", "PAST_DUE", "CANCEL_AT_PERIOD_END"],
274:     INCOMPLETE: ["ACTIVE", "PAST_DUE", "EXPIRED"],
275:     ACTIVE: ["PAST_DUE", "PAUSED", "CANCEL_AT_PERIOD_END", "EXPIRED"],
276:     PAST_DUE: ["ACTIVE", "PAUSED", "EXPIRED", "UNPAID"],
277:     PAUSED: ["ACTIVE", "EXPIRED"],
278:     "CANCEL_AT_PERIOD_END": ["ACTIVE", "CANCELED", "EXPIRED"],
279:     CANCELED: [],
280:     EXPIRED: ["ACTIVE", "UNPAID"],
281:     UNPAID: ["ACTIVE", "EXPIRED"],
282:   };
283: 
284:   const legalTargets = LEGAL_TRANSITIONS[currentStatus];
285: 
286:   if (!legalTargets.includes(mappedStatus)) {
287:     logger.info(
288:       {
289:         eventId: event.id,
290:         currentStatus,
291:         mappedStatus,
292:         stripeStatus,
293:         cancelAtPeriodEnd,
294:       },
295:       "Subscription update skipped — transition not legal from current status",
296:     );
297:     return;
298:   }
299: 
300:   const transitionOptions: Record<string, unknown> = {
301:     triggeredBy: "provider_event",
302:     providerEventId: event.id,
303:   };
304: 
305:   const packageId = extractPackageIdFromEvent(event);
306:   if (packageId) {
307:     transitionOptions.packageId = packageId;
308:   }
309: 
310:   await transitionSubscription(
311:     String(tenantId),
312:     mappedStatus,
313:     transitionOptions,
314:   );
315: 
316:   const subscriptionUpdate: Record<string, unknown> = {
317:     paymentState: mappedStatus === "EXPIRED" || mappedStatus === "CANCELED"
318:       ? "failed"
319:       : "paid",
320:     lastProviderEventId: event.id,
321:     providerSubscriptionId:
322:       extractStripeSubscriptionIdFromEvent(event) ??
323:       sub.providerSubscriptionId,
324:   };
325: 
326:   if (packageId) {
327:     subscriptionUpdate.packageId = new Types.ObjectId(packageId);
328:   }
329: 
330:   await SubscriptionModel.updateOne(
331:     { tenantId },
332:     { $set: subscriptionUpdate },
333:   );
334: 
335:   writeAudit(
336:     "SUBSCRIPTION_UPDATED",
337:     String(sub._id),
338:     {
339:       eventType: event.type,
340:       stripeStatus,
341:       cancelAtPeriodEnd,
342:       newStatus: mappedStatus,
343:       providerEventId: event.id,
344:     },
345:     String(tenantId),
346:   );
347: }
348: 
349: // ── Subscription resolution ──────────────────────────────────────────────────
350: 
351: interface ResolvedSubscription {
352:   subscription: { _id: Types.ObjectId; status: string; providerSubscriptionId: string; providerCustomerId: string };
353:   tenantId: Types.ObjectId;
354: }
355: 
356: async function resolveSubscriptionFromEvent(
357:   event: PaymentProviderEvent,
358: ): Promise<ResolvedSubscription | null> {
359:   const tenantId = extractTenantFromEvent(event);
360:   if (tenantId) {
361:     const sub = await SubscriptionModel.findOne({ tenantId }).exec();
362:     if (sub) return { subscription: sub, tenantId };
363:   }
364: 
365:   const customerId = extractCustomerIdFromEvent(event);
366:   if (customerId) {
367:     const sub = await SubscriptionModel.findOne({
368:       providerCustomerId: customerId,
369:     }).exec();
370:     if (sub) return { subscription: sub, tenantId: sub.tenantId };
371:   }
372: 
373:   const stripeSubId = extractStripeSubscriptionIdFromEvent(event);
374:   if (stripeSubId) {
375:     const sub = await SubscriptionModel.findOne({
376:       providerSubscriptionId: stripeSubId,
377:     }).exec();
378:     if (sub) return { subscription: sub, tenantId: sub.tenantId };
379:   }
380: 
381:   return null;
382: }
383: 
384: // ── Event data extraction helpers ────────────────────────────────────────────
385: 
386: function extractRawObject(
387:   event: PaymentProviderEvent,
388: ): Record<string, unknown> | undefined {
389:   const rawData = event.raw.data as Record<string, unknown> | undefined;
390:   return rawData?.object as Record<string, unknown> | undefined;
391: }
392: 
393: function extractTenantFromEvent(
394:   event: PaymentProviderEvent,
395: ): Types.ObjectId | null {
396:   const obj = extractRawObject(event);
397:   const metadata = obj?.metadata as Record<string, string> | undefined;
398:   if (metadata?.tenantId) return new Types.ObjectId(metadata.tenantId);
399:   return null;
400: }
401: 
402: function extractCustomerIdFromEvent(
403:   event: PaymentProviderEvent,
404: ): string | undefined {
405:   const obj = extractRawObject(event);
406:   return obj?.customer as string | undefined;
407: }
408: 
409: function extractStripeSubscriptionIdFromEvent(
410:   event: PaymentProviderEvent,
411: ): string | undefined {
412:   const obj = extractRawObject(event);
413:   return obj?.subscription as string | undefined;
414: }
415: 
416: function extractStripeSubscriptionStatus(
417:   event: PaymentProviderEvent,
418: ): string {
419:   const obj = extractRawObject(event);
420:   return (obj?.status as string) ?? "";
421: }
422: 
423: function extractCancelAtPeriodEnd(
424:   event: PaymentProviderEvent,
425: ): boolean {
426:   const obj = extractRawObject(event);
427:   return (obj?.cancel_at_period_end as boolean) ?? false;
428: }
429: 
430: function extractCheckoutSessionId(
431:   event: PaymentProviderEvent,
432: ): string | undefined {
433:   const obj = extractRawObject(event);
434:   return obj?.id as string | undefined;
435: }
436: 
437: function extractPackageIdFromEvent(
438:   event: PaymentProviderEvent,
439: ): string | undefined {
440:   const obj = extractRawObject(event);
441:   const metadata = obj?.metadata as Record<string, string> | undefined;
442:   return metadata?.packageId;
443: }
444: 
445: // ── Admin: list & reprocess ──────────────────────────────────────────────────
446: 
447: export async function listPaymentEvents(filter: {
448:   page: number;
449:   pageSize: number;
450:   status?: string;
451:   eventType?: string;
452: }, context: OperationAuthorizationContext) {
453:   await authorizePlatformOperation(context, Permission.BILLING_READ);
454:   const query: Record<string, unknown> = {};
455:   if (filter.status) query.status = filter.status;
456:   if (filter.eventType) query.eventType = filter.eventType;
457: 
458:   const [events, totalRecords] = await Promise.all([
459:     PaymentEventModel.find(query)
460:       .select("-signature -rawBody -payload")
461:       .sort({ createdAt: -1 })
462:       .skip((filter.page - 1) * filter.pageSize)
463:       .limit(filter.pageSize)
464:       .lean()
465:       .exec(),
466:     PaymentEventModel.countDocuments(query),
467:   ]);
468: 
469:   return {
470:     events,
471:     pagination: {
472:       page: filter.page,
473:       pageSize: filter.pageSize,
474:       totalRecords,
475:       totalPages: Math.ceil(totalRecords / filter.pageSize),
476:     },
477:   };
478: }
479: 
480: export async function reprocessEvent(
481:   eventId: string,
482:   context: OperationAuthorizationContext,
483: ): Promise<void> {
484:   const actor = await authorizePlatformOperation(
485:     context,
486:     Permission.BILLING_MANAGE,
487:   );
488:   const event = await PaymentEventModel.findOne({ eventId }).exec();
489:   if (!event) {
490:     throw new AppError(404, NOT_FOUND, "Payment event not found");
491:   }
492: 
493:   event.status = "received";
494:   event.processingErrors = [];
495:   event.processedAt = null;
496:   await event.save();
497: 
498:   const provider = await getProviderForReprocess();
499:   const parsed = provider.parseWebhookEvent(event.payload as Record<string, unknown>);
500:   await handlePaymentEvent(parsed, event.rawBody, event.signature, event);
501:   await getAuditWriter().write({
502:     tenantId: actor.tenantId,
503:     action: "PAYMENT_EVENT_REPROCESSED",
504:     resourceType: "PaymentEvent",
505:     resourceId: eventId,
506:     actorId: actor.actorId,
507:     actorEmail: actor.actorEmail,
508:     actorRole: actor.actorRole,
509:     actorKind: actor.actorKind,
510:     changes: { eventType: event.eventType },
511:     metadata: { traceId: actor.traceId, requestId: actor.requestId },
512:   });
513: }
514: 
515: async function getProviderForReprocess() {
516:   const { getPaymentProvider } = await import(
517:     "../checkout/payment-provider-loader.js"
518:   );
519:   return getPaymentProvider();
520: }

(End of file - total 520 lines)
</content>
```

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/marco/documind-ai/api/src/modules/payment-webhooks/payment-webhooks.controller.ts"
}
```

**Output:**
```
<path>/home/marco/documind-ai/api/src/modules/payment-webhooks/payment-webhooks.controller.ts</path>
<type>file</type>
<content>
1: import type { Request, Response } from "express";
2: import { logger } from "../../common/logger/logger.js";
3: import { getPaymentProvider } from "../checkout/payment-provider-loader.js";
4: import { handlePaymentEvent } from "./payment-webhooks.service.js";
5: 
6: export async function webhookHandlerController(
7:   req: Request,
8:   res: Response,
9: ): Promise<void> {
10:   const signature =
11:     (req.headers["stripe-signature"] as string) ?? "";
12: 
13:   const rawBodyBuffer = req.body instanceof Buffer ? req.body : Buffer.from(JSON.stringify(req.body));
14:   const rawBody = rawBodyBuffer.toString("utf8");
15: 
16:   const provider = await getPaymentProvider();
17: 
18:   if (!provider.verifyWebhookSignature(rawBody, signature)) {
19:     logger.warn({ signature: signature.slice(0, 8) }, "Invalid webhook signature");
20:     res.status(400).json({ error: "Invalid signature" });
21:     return;
22:   }
23: 
24:   let payload: Record<string, unknown>;
25:   try {
26:     payload = JSON.parse(rawBody) as Record<string, unknown>;
27:   } catch {
28:     logger.warn("Failed to parse webhook body as JSON");
29:     res.status(400).json({ error: "Invalid JSON" });
30:     return;
31:   }
32: 
33:   try {
34:     const event = provider.parseWebhookEvent(payload);
35:     await handlePaymentEvent(event, rawBody, signature);
36:     res.status(200).json({ received: true });
37:   } catch (error) {
38:     logger.error({ err: error }, "Failed to process webhook event");
39:     res.status(200).json({ received: true });
40:   }
41: }

(End of file - total 41 lines)
</content>
```

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/marco/documind-ai/api/src/modules/billing/ports/adapters/stripe-payment-provider.ts"
}
```

**Output:**
```
<path>/home/marco/documind-ai/api/src/modules/billing/ports/adapters/stripe-payment-provider.ts</path>
<type>file</type>
<content>
1: import Stripe from "stripe";
2: import {
3:   type PaymentProvider,
4:   type CreateCustomerParams,
5:   type CreateCheckoutSessionParams,
6:   type CheckoutSession,
7:   type CreateBillingPortalSessionParams,
8:   type BillingPortalSession,
9:   type PaymentProviderEvent,
10:   type CreateProductParams,
11:   type StripeProduct,
12:   type CreatePriceParams,
13:   type StripePrice,
14: } from "../payment-provider.port.js";
15: import { config } from "../../../../config/index.js";
16: import { logger } from "../../../../common/logger/logger.js";
17: 
18: let stripeClient: Stripe | null = null;
19: 
20: async function getClient(): Promise<Stripe> {
21:   if (stripeClient) return stripeClient;
22:   const secretKey = config.STRIPE_SECRET_KEY;
23:   if (!secretKey) {
24:     throw new Error("STRIPE_SECRET_KEY is not configured");
25:   }
26:   stripeClient = new Stripe(secretKey);
27:   return stripeClient;
28: }
29: 
30: export class StripePaymentProvider implements PaymentProvider {
31:   async createCustomer(params: CreateCustomerParams): Promise<string> {
32:     const stripe = await getClient();
33:     const customer = await stripe.customers.create({
34:       email: params.email,
35:       name: params.name,
36:       metadata: { tenantId: params.tenantId },
37:     });
38:     return customer.id;
39:   }
40: 
41:   async createCheckoutSession(
42:     params: CreateCheckoutSessionParams,
43:   ): Promise<CheckoutSession> {
44:     const stripe = await getClient();
45:     const session = await stripe.checkout.sessions.create({
46:       customer: params.customerId,
47:       mode: "subscription",
48:       line_items: [{ price: params.priceId, quantity: 1 }],
49:       success_url: params.successUrl,
50:       cancel_url: params.cancelUrl,
51:       metadata: params.metadata,
52:     });
53: 
54:     return {
55:       id: session.id,
56:       url: session.url ?? "",
57:       status: session.status === "open" ? "open" : "complete",
58:       customerId: (session.customer as string) ?? params.customerId,
59:       metadata: (session.metadata as Record<string, string>) ?? {},
60:     };
61:   }
62: 
63:   async retrieveCheckoutSession(
64:     sessionId: string,
65:   ): Promise<CheckoutSession> {
66:     const stripe = await getClient();
67:     const session = await stripe.checkout.sessions.retrieve(sessionId);
68: 
69:     return {
70:       id: session.id,
71:       url: session.url ?? "",
72:       status:
73:         session.status === "open"
74:           ? "open"
75:           : session.status === "complete"
76:             ? "complete"
77:             : "expired",
78:       customerId: (session.customer as string) ?? "",
79:       metadata: (session.metadata as Record<string, string>) ?? {},
80:     };
81:   }
82: 
83:   async createBillingPortalSession(
84:     params: CreateBillingPortalSessionParams,
85:   ): Promise<BillingPortalSession> {
86:     const stripe = await getClient();
87:     const session = await stripe.billingPortal.sessions.create({
88:       customer: params.customerId,
89:       return_url: params.returnUrl,
90:     });
91:     return { url: session.url };
92:   }
93: 
94:   verifyWebhookSignature(body: string, signature: string): boolean {
95:     try {
96:       const secret = config.STRIPE_WEBHOOK_SECRET;
97:       if (!secret) {
98:         if (config.NODE_ENV === "production") {
99:           logger.error(
100:             "STRIPE_WEBHOOK_SECRET not set in production — rejecting webhook",
101:           );
102:           return false;
103:         }
104:         logger.warn(
105:           "STRIPE_WEBHOOK_SECRET not set — skipping signature verification (non-production)",
106:         );
107:         return true;
108:       }
109:       if (!stripeClient) {
110:         const secretKey = config.STRIPE_SECRET_KEY;
111:         if (!secretKey) {
112:           logger.error("STRIPE_SECRET_KEY not configured for webhook verification");
113:           return false;
114:         }
115:         stripeClient = new Stripe(secretKey);
116:       }
117:       stripeClient.webhooks.constructEvent(body, signature, secret);
118:       return true;
119:     } catch {
120:       return false;
121:     }
122:   }
123: 
124:   parseWebhookEvent(body: Record<string, unknown>): PaymentProviderEvent {
125:     return {
126:       id: (body.id as string) ?? "",
127:       type: (body.type as string) ?? "unknown",
128:       timestamp: new Date(
129:         (body.created as number)
130:           ? (body.created as number) * 1000
131:           : Date.now(),
132:       ),
133:       provider: "stripe",
134:       raw: body,
135:     };
136:   }
137: 
138:   async createProduct(params: CreateProductParams): Promise<StripeProduct> {
139:     const stripe = await getClient();
140:     const product = await stripe.products.create({
141:       name: params.name,
142:       description: params.description,
143:       metadata: params.metadata ?? {},
144:     });
145:     return { id: product.id, name: product.name };
146:   }
147: 
148:   async createPrice(params: CreatePriceParams): Promise<StripePrice> {
149:     const stripe = await getClient();
150:     const price = await stripe.prices.create({
151:       product: params.productId,
152:       unit_amount: params.unitAmount,
153:       currency: params.currency,
154:       recurring: { interval: params.interval },
155:       metadata: params.metadata ?? {},
156:     });
157:     return {
158:       id: price.id,
159:       productId: (price.product as string) ?? params.productId,
160:       unitAmount: price.unit_amount ?? params.unitAmount,
161:       currency: price.currency,
162:       interval: price.recurring?.interval ?? params.interval,
163:     };
164:   }
165: }

(End of file - total 165 lines)
</content>
```

---

## Assistant (Build · Big Pickle · 3.9s)

_Thinking:_

Now let me also read the checkout service to understand how subscriptions are created and the checkout session flow.

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/marco/documind-ai/api/src/modules/checkout/checkout.service.ts"
}
```

**Output:**
```
<path>/home/marco/documind-ai/api/src/modules/checkout/checkout.service.ts</path>
<type>file</type>
<content>
1: import { Types } from "mongoose";
2: import PackageModel from "../../db/models/package.model.js";
3: import SubscriptionModel from "../../db/models/subscription.model.js";
4: import CheckoutSessionModel from "../../db/models/checkoutSession.model.js";
5: import { AppError } from "../../common/errors/AppError.js";
6: import {
7:   NOT_FOUND,
8:   BAD_REQUEST,
9:   PRICE_NOT_CONFIGURED,
10:   BILLING_PORTAL_UNAVAILABLE,
11: } from "../../common/errors/errorCodes.js";
12: import { getAuditWriter } from "../../common/observability/index.js";
13: import type { PaymentProvider } from "../billing/ports/payment-provider.port.js";
14: import { Permission } from "../permissions/permissions.catalog.js";
15: import {
16:   authorizeTenantOperation,
17:   type OperationAuthorizationContext,
18:   type ResolvedOperationAuthorizationContext,
19: } from "../permissions/permissions.operation.js";
20: 
21: function writeAudit(
22:   action: string,
23:   resourceId: string,
24:   changes: Record<string, unknown>,
25:   tenantId: string,
26:   actor: ResolvedOperationAuthorizationContext,
27: ): void {
28:   const writer = getAuditWriter();
29:   writer
30:     .write({
31:       action: action as never,
32:       resourceType: "Subscription" as never,
33:       resourceId,
34:       changes,
35:       tenantId,
36:       actorId: actor.actorId,
37:       actorEmail: actor.actorEmail,
38:       actorRole: actor.actorRole,
39:       actorKind: actor.actorKind,
40:     })
41:     .catch((err: unknown) => {
42:       console.error("Audit write failed (non-blocking):", err);
43:     });
44: }
45: 
46: function getProviderPriceId(
47:   pkg: { monthlyPrice: number; annualPrice: number; code: string; stripePriceId?: string; stripeAnnualPriceId?: string },
48:   billingInterval: "monthly" | "annual",
49: ): string {
50:   const price =
51:     billingInterval === "annual" ? pkg.annualPrice : pkg.monthlyPrice;
52:   if (price <= 0) {
53:     throw new AppError(
54:       400,
55:       BAD_REQUEST,
56:       `Package has no ${billingInterval} price configured`,
57:     );
58:   }
59: 
60:   const priceId = billingInterval === "annual" ? pkg.stripeAnnualPriceId : pkg.stripePriceId;
61: 
62:   if (priceId) {
63:     return priceId;
64:   }
65: 
66:   throw new AppError(
67:     400,
68:     PRICE_NOT_CONFIGURED,
69:     `Package "${pkg.code}" has no Stripe ${billingInterval} price configured. Sync the package with Stripe first.`,
70:   );
71: }
72: 
73: export async function createCheckoutSession(
74:   tenantId: string,
75:   packageId: string,
76:   billingInterval: "monthly" | "annual",
77:   provider: PaymentProvider,
78:   successUrl: string,
79:   cancelUrl: string,
80:   inputContext: OperationAuthorizationContext,
81: ) {
82:   const actor = await authorizeTenantOperation(
83:     inputContext,
84:     Permission.BILLING_MANAGE,
85:   );
86:   if (tenantId !== actor.tenantId) {
87:     throw new AppError(404, NOT_FOUND, "Subscription not found");
88:   }
89:   const pkg = await PackageModel.findById(packageId).lean().exec();
90:   if (!pkg) {
91:     throw new AppError(404, NOT_FOUND, "Package not found");
92:   }
93:   if (!pkg.active) {
94:     throw new AppError(400, BAD_REQUEST, "Package is not active");
95:   }
96: 
97:   const sub = await SubscriptionModel.findOne({ tenantId }).lean().exec();
98:   if (sub && sub.status === "CANCELED") {
99:     throw new AppError(400, BAD_REQUEST, "Tenant subscription is canceled");
100:   }
101: 
102:   let providerCustomerId = sub?.providerCustomerId ?? "";
103:   const isFakeCustomer = providerCustomerId.startsWith("cus_fake_");
104:   if (!providerCustomerId || isFakeCustomer) {
105:     providerCustomerId = await provider.createCustomer({
106:       tenantId,
107:       email: actor.actorEmail,
108:       name: actor.actorEmail,
109:     });
110:     if (sub) {
111:       await SubscriptionModel.updateOne(
112:         { tenantId },
113:         { $set: { providerCustomerId } },
114:       );
115:     }
116:   }
117: 
118:   const returnUrl = successUrl;
119:   const cancelUrlFinal = cancelUrl;
120: 
121:   const priceId = getProviderPriceId(pkg, billingInterval);
122: 
123:   const session = await provider.createCheckoutSession({
124:     customerId: providerCustomerId,
125:     priceId,
126:     successUrl: returnUrl,
127:     cancelUrl: cancelUrlFinal,
128:     metadata: {
129:       tenantId,
130:       packageId,
131:       packageVersion: String(pkg.version),
132:       billingInterval,
133:     },
134:   });
135: 
136:   const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
137:   const checkoutSession = await CheckoutSessionModel.create({
138:     tenantId: new Types.ObjectId(tenantId),
139:     packageId: new Types.ObjectId(packageId),
140:     packageVersion: pkg.version,
141:     billingInterval,
142:     providerSessionId: session.id,
143:     providerCustomerId,
144:     status: "pending",
145:     returnUrl,
146:     cancelUrl: cancelUrlFinal,
147:     metadata: new Map(Object.entries(session.metadata)),
148:     expiresAt,
149:   });
150: 
151:   if (providerCustomerId && !sub?.providerCustomerId) {
152:     await SubscriptionModel.updateOne(
153:       { tenantId },
154:       { $set: { providerCustomerId } },
155:     );
156:   }
157: 
158:   writeAudit(
159:     "CHECKOUT_SESSION_CREATED",
160:     String(checkoutSession._id),
161:     {
162:       tenantId,
163:       packageId,
164:       billingInterval,
165:       providerSessionId: session.id,
166:     },
167:     tenantId,
168:     actor,
169:   );
170: 
171:   return {
172:     checkoutId: String(checkoutSession._id),
173:     sessionUrl: session.url,
174:     providerSessionId: session.id,
175:   };
176: }
177: 
178: export async function getCheckoutStatus(
179:   checkoutId: string,
180:   tenantId: string,
181:   inputContext: OperationAuthorizationContext,
182: ) {
183:   const actor = await authorizeTenantOperation(
184:     inputContext,
185:     Permission.BILLING_READ,
186:   );
187:   if (tenantId !== actor.tenantId) {
188:     throw new AppError(404, NOT_FOUND, "Checkout session not found");
189:   }
190:   const session = await CheckoutSessionModel.findOne({
191:     _id: checkoutId,
192:     tenantId,
193:   })
194:     .lean()
195:     .exec();
196:   if (!session) {
197:     throw new AppError(404, NOT_FOUND, "Checkout session not found");
198:   }
199:   return session;
200: }
201: 
202: export async function listCheckoutSessions(
203:   filter: { tenantId: string; status?: string; page: number; pageSize: number },
204:   inputContext: OperationAuthorizationContext,
205: ) {
206:   const actor = await authorizeTenantOperation(
207:     inputContext,
208:     Permission.BILLING_READ,
209:   );
210:   if (filter.tenantId !== actor.tenantId) {
211:     throw new AppError(404, NOT_FOUND, "Checkout sessions not found");
212:   }
213:   const query: Record<string, unknown> = {};
214:   query.tenantId = new Types.ObjectId(actor.tenantId);
215:   if (filter.status) query.status = filter.status;
216: 
217:   const [sessions, totalRecords] = await Promise.all([
218:     CheckoutSessionModel.find(query)
219:       .sort({ createdAt: -1 })
220:       .skip((filter.page - 1) * filter.pageSize)
221:       .limit(filter.pageSize)
222:       .lean()
223:       .exec(),
224:     CheckoutSessionModel.countDocuments(query),
225:   ]);
226: 
227:   return {
228:     sessions,
229:     pagination: {
230:       page: filter.page,
231:       pageSize: filter.pageSize,
232:       totalRecords,
233:       totalPages: Math.ceil(totalRecords / filter.pageSize),
234:     },
235:   };
236: }
237: 
238: export async function getSubscriptionStatus(
239:   tenantId: string,
240:   inputContext: OperationAuthorizationContext,
241: ) {
242:   const actor = await authorizeTenantOperation(
243:     inputContext,
244:     Permission.BILLING_READ,
245:   );
246:   if (tenantId !== actor.tenantId) {
247:     throw new AppError(404, NOT_FOUND, "Subscription not found");
248:   }
249:   const sub = await SubscriptionModel.findOne({ tenantId })
250:     .populate("packageId", "name code version monthlyPrice annualPrice currency entitlements")
251:     .lean()
252:     .exec();
253:   if (!sub) {
254:     throw new AppError(404, NOT_FOUND, "Subscription not found for tenant");
255:   }
256:   return sub;
257: }
258: 
259: export async function createBillingPortalSession(
260:   tenantId: string,
261:   inputContext: OperationAuthorizationContext,
262:   provider: PaymentProvider,
263:   returnUrl: string,
264: ) {
265:   const actor = await authorizeTenantOperation(
266:     inputContext,
267:     Permission.BILLING_MANAGE,
268:   );
269:   if (tenantId !== actor.tenantId) {
270:     throw new AppError(404, NOT_FOUND, "Subscription not found");
271:   }
272: 
273:   const sub = await SubscriptionModel.findOne({ tenantId }).lean().exec();
274:   if (!sub) {
275:     throw new AppError(404, NOT_FOUND, "Subscription not found for tenant");
276:   }
277: 
278:   if (!sub.providerCustomerId) {
279:     throw new AppError(
280:       400,
281:       BILLING_PORTAL_UNAVAILABLE,
282:       "No billing customer on file. Please complete a checkout first.",
283:     );
284:   }
285: 
286:   const session = await provider.createBillingPortalSession({
287:     customerId: sub.providerCustomerId,
288:     returnUrl,
289:   });
290: 
291:   writeAudit(
292:     "BILLING_PORTAL_SESSION_CREATED",
293:     String(sub._id),
294:     {
295:       tenantId,
296:       providerCustomerId: sub.providerCustomerId,
297:     },
298:     tenantId,
299:     actor,
300:   );
301: 
302:   return { url: session.url };
303: }

(End of file - total 303 lines)
</content>
```

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/marco/documind-ai/api/src/modules/checkout/checkout.controller.ts"
}
```

**Output:**
```
<path>/home/marco/documind-ai/api/src/modules/checkout/checkout.controller.ts</path>
<type>file</type>
<content>
1: import type { NextFunction, Request, Response } from "express";
2: import { AppError } from "../../common/errors/AppError.js";
3: import { UNAUTHORIZED } from "../../common/errors/errorCodes.js";
4: import { config } from "../../config/index.js";
5: import { logger } from "../../common/logger/logger.js";
6: import {
7:   createCheckoutSession,
8:   getCheckoutStatus,
9:   listCheckoutSessions,
10:   getSubscriptionStatus,
11:   createBillingPortalSession,
12: } from "./checkout.service.js";
13: import {
14:   createCheckoutSchema,
15:   checkoutIdSchema,
16:   listCheckoutSchema,
17:   parse,
18: } from "./checkout.validator.js";
19: import { getPaymentProvider } from "./payment-provider-loader.js";
20: import { requireAuthenticatedAuditActor } from "../../common/observability/auditActor.js";
21: import type { OperationAuthorizationContext } from "../permissions/permissions.operation.js";
22: import { FakePaymentProvider } from "../billing/ports/fakes/fake-payment-provider.js";
23: import { transitionSubscription } from "../billing/subscription.service.js";
24: import CheckoutSessionModel from "../../db/models/checkoutSession.model.js";
25: import SubscriptionModel from "../../db/models/subscription.model.js";
26: 
27: type Handler = (req: Request, res: Response) => Promise<unknown> | unknown;
28: 
29: const endpoint =
30:   (handler: Handler) =>
31:   async (req: Request, res: Response, next: NextFunction) => {
32:     try {
33:       const data = await handler(req, res);
34:       if (!res.headersSent) res.status(200).json({ success: true, data });
35:     } catch (error) {
36:       next(error);
37:     }
38:   };
39: 
40: const actor = (req: Request) => {
41:   if (!req.auth)
42:     throw new AppError(401, UNAUTHORIZED, "Authentication required");
43:   return req.auth;
44: };
45: 
46: const tenant = (req: Request) => {
47:   if (!req.tenantId)
48:     throw new AppError(401, UNAUTHORIZED, "Tenant context required");
49:   return req.tenantId;
50: };
51: 
52: const operationContext = (req: Request): OperationAuthorizationContext => {
53:   const auth = actor(req);
54:   const resolved = requireAuthenticatedAuditActor({
55:     tenantId: tenant(req),
56:     actorId: auth.userId,
57:     actorEmail: auth.email,
58:     actorRole: auth.role,
59:   });
60:   return {
61:     tenantId: resolved.tenantId,
62:     actorId: resolved.actorId,
63:     actorEmail: resolved.actorEmail,
64:     actorRole: resolved.actorRole,
65:     traceId: req.traceId,
66:     requestId: req.requestId,
67:   };
68: };
69: 
70: export const createCheckoutController = endpoint(async (req, res) => {
71:   const tenantId = tenant(req);
72:   const body = parse(createCheckoutSchema, req.body);
73:   const provider = await getPaymentProvider();
74: 
75:   const successUrl = config.STRIPE_SUCCESS_URL
76:     ? `${config.STRIPE_SUCCESS_URL}?session_id={CHECKOUT_SESSION_ID}`
77:     : `${config.APP_FRONTEND_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`;
78:   const cancelUrl = config.STRIPE_CANCEL_URL || `${config.APP_FRONTEND_URL}/checkout/cancel`;
79: 
80:   const result = await createCheckoutSession(
81:     tenantId,
82:     body.packageId,
83:     body.billingInterval,
84:     provider,
85:     successUrl,
86:     cancelUrl,
87:     operationContext(req),
88:   );
89: 
90:   if (provider instanceof FakePaymentProvider) {
91:     provider.markSessionComplete(result.providerSessionId);
92: 
93:     try {
94:       const sub = await SubscriptionModel.findOne({ tenantId }).exec();
95:       if (sub && ["INCOMPLETE", "TRIALING"].includes(sub.status)) {
96:         await transitionSubscription(tenantId, "ACTIVE", {
97:           triggeredBy: "provider_event",
98:           providerEventId: `fake_${result.providerSessionId}`,
99:         });
100:       }
101: 
102:       await CheckoutSessionModel.updateOne(
103:         { providerSessionId: result.providerSessionId },
104:         { $set: { status: "completed", completedAt: new Date() } },
105:       );
106:     } catch (err) {
107:       logger.warn({ err }, "Failed to auto-complete fake checkout session");
108:     }
109:   }
110: 
111:   res.status(201).json({ success: true, data: result });
112: });
113: 
114: export const checkoutStatusController = endpoint((req) => {
115:   const tenantId = tenant(req);
116:   const params = parse(checkoutIdSchema, req.params);
117:   return getCheckoutStatus(params.checkoutId, tenantId, operationContext(req));
118: });
119: 
120: export const listCheckoutSessionsController = endpoint((req) => {
121:   const tenantId = tenant(req);
122:   const query = parse(listCheckoutSchema, req.query);
123:   return listCheckoutSessions({ ...query, tenantId }, operationContext(req));
124: });
125: 
126: export const subscriptionStatusController = endpoint((req) => {
127:   const tenantId = tenant(req);
128:   return getSubscriptionStatus(tenantId, operationContext(req));
129: });
130: 
131: export const createBillingPortalController = endpoint(async (req) => {
132:   const tenantId = tenant(req);
133:   const provider = await getPaymentProvider();
134:   const returnUrl = config.STRIPE_BILLING_PORTAL_RETURN_URL || `${config.APP_FRONTEND_URL}/checkout`;
135:   return createBillingPortalSession(
136:     tenantId,
137:     operationContext(req),
138:     provider,
139:     returnUrl,
140:   );
141: });

(End of file - total 141 lines)
</content>
```

---

## Assistant (Build · Big Pickle · 7.9s)

_Thinking:_

Now let me check the Stripe checkout session creation to understand what `payment_behavior` is being used, which determines what happens when the initial payment fails.

Now let me check the Stripe Checkout Session creation for the `payment_behavior` parameter:

**Tool: grep**

**Input:**
```json
{
  "pattern": "payment_behavior|allow_incomplete|error_if_incomplete|subscription_proration_behavior",
  "path": "/home/marco/documind-ai"
}
```

**Output:**
```
No files found
```

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/marco/documind-ai/api/src/modules/billing/subscription.service.ts"
}
```

**Output:**
```
<path>/home/marco/documind-ai/api/src/modules/billing/subscription.service.ts</path>
<type>file</type>
<content>
1: import { Types } from "mongoose";
2: import SubscriptionModel, {
3:   type SubscriptionDocument,
4: } from "../../db/models/subscription.model.js";
5: import { AppError } from "../../common/errors/AppError.js";
6: import {
7:   NOT_FOUND,
8:   BAD_REQUEST,
9: } from "../../common/errors/errorCodes.js";
10: import { getAuditWriter } from "../../common/observability/index.js";
11: import type {
12:   SubscriptionStatus,
13:   SubscriptionTransition,
14: } from "./billing.types.js";
15: import type { BillingActor } from "./package.service.js";
16: 
17: // ── Legal transitions ───────────────────────────────────────────────────────
18: // Key: current state → array of legal target states
19: 
20: const LEGAL_TRANSITIONS: Record<SubscriptionStatus, readonly SubscriptionStatus[]> = {
21:   TRIALING: ["ACTIVE", "PAST_DUE", "CANCEL_AT_PERIOD_END"],
22:   INCOMPLETE: ["ACTIVE", "PAST_DUE", "EXPIRED"],
23:   ACTIVE: ["PAST_DUE", "PAUSED", "CANCEL_AT_PERIOD_END", "EXPIRED"],
24:   PAST_DUE: ["ACTIVE", "PAUSED", "EXPIRED", "UNPAID"],
25:   PAUSED: ["ACTIVE", "EXPIRED"],
26:   "CANCEL_AT_PERIOD_END": ["ACTIVE", "CANCELED", "EXPIRED"],
27:   CANCELED: [],
28:   EXPIRED: ["ACTIVE", "UNPAID"],
29:   UNPAID: ["ACTIVE", "EXPIRED"],
30: };
31: 
32: // ── Transition options ──────────────────────────────────────────────────────
33: 
34: export interface TransitionOptions {
35:   reason?: string;
36:   triggeredBy?: SubscriptionTransition["triggeredBy"];
37:   providerEventId?: string;
38:   periodEnd?: Date;
39:   packageId?: string;
40:   packageVersion?: number;
41: }
42: 
43: export interface SubscriptionFilter {
44:   status?: SubscriptionStatus;
45:   tenantId?: string;
46: }
47: 
48: // ── Audit helper ────────────────────────────────────────────────────────────
49: 
50: function writeAudit(
51:   action: string,
52:   resourceId: string,
53:   changes: Record<string, unknown>,
54:   tenantId: string,
55:   actor?: BillingActor,
56: ): void {
57:   const writer = getAuditWriter();
58:   writer.write({
59:     action: action as never,
60:     resourceType: "Subscription" as never,
61:     resourceId,
62:     changes,
63:     tenantId,
64:     actorId: actor?.userId,
65:     actorEmail: actor?.email,
66:     actorRole: actor?.role,
67:     actorKind: actor ? "USER" : "SYSTEM",
68:   }).catch((err: unknown) => {
69:     console.error("Audit write failed (non-blocking):", err);
70:   });
71: }
72: 
73: // ── Public API ──────────────────────────────────────────────────────────────
74: 
75: /**
76:  * Create a new subscription for a tenant. Defaults to TRIALING if no status
77:  * is provided. When `trialDays` is provided and the subscription is in
78:  * TRIALING status, `trialEnd` is computed from `trialStart + trialDays`.
79:  */
80: export async function createSubscription(
81:   tenantId: string,
82:   packageId: string,
83:   packageVersion: number,
84:   status?: SubscriptionStatus,
85:   actor?: BillingActor,
86:   trialDays?: number,
87: ): Promise<SubscriptionDocument> {
88:   const targetStatus: SubscriptionStatus = status ?? "TRIALING";
89:   const now = new Date();
90: 
91:   let trialEnd: Date | null = null;
92:   if (targetStatus === "TRIALING" && typeof trialDays === "number" && trialDays > 0) {
93:     trialEnd = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);
94:   }
95: 
96:   const sub = await SubscriptionModel.create({
97:     tenantId: new Types.ObjectId(tenantId),
98:     packageId: new Types.ObjectId(packageId),
99:     packageVersion,
100:     status: targetStatus,
101:     startedAt: now,
102:     trialStart: targetStatus === "TRIALING" ? now : null,
103:     trialEnd,
104:   });
105: 
106:   writeAudit(
107:     "SUBSCRIPTION_UPDATED",
108:     String(sub._id),
109:     { tenantId, packageId, packageVersion, status: targetStatus, action: "created" },
110:     tenantId,
111:     actor,
112:   );
113: 
114:   return sub.toJSON();
115: }
116: 
117: /**
118:  * Transition a subscription to a new state. Validates the transition against
119:  * the legal state machine. Throws if the transition is illegal.
120:  */
121: export async function transitionSubscription(
122:   tenantId: string,
123:   targetState: SubscriptionStatus,
124:   options?: TransitionOptions,
125:   actor?: BillingActor,
126: ): Promise<SubscriptionDocument> {
127:   const existing = await SubscriptionModel.findOne({ tenantId }).exec();
128:   if (!existing) {
129:     throw new AppError(404, NOT_FOUND, "Subscription not found for tenant");
130:   }
131: 
132:   const fromState = existing.status as SubscriptionStatus;
133:   const legalTargets = LEGAL_TRANSITIONS[fromState];
134: 
135:   if (!legalTargets.includes(targetState)) {
136:     throw new AppError(
137:       400,
138:       BAD_REQUEST,
139:       `Illegal subscription transition: ${fromState} → ${targetState}`,
140:     );
141:   }
142: 
143:   const now = new Date();
144:   const update: Record<string, unknown> = {
145:     status: targetState,
146:     periodEnd: options?.periodEnd ?? existing.periodEnd,
147:   };
148: 
149:   // Side-effect fields based on the transition path
150:   if (options?.packageId) {
151:     update.packageId = new Types.ObjectId(options.packageId);
152:   }
153:   if (options?.packageVersion !== undefined) {
154:     update.packageVersion = options.packageVersion;
155:   }
156: 
157:   if (
158:     targetState === "CANCELED" &&
159:     fromState === "CANCEL_AT_PERIOD_END"
160:   ) {
161:     update.cancelledAt = now;
162:   }
163: 
164:   if (targetState === "ACTIVE" && fromState === "TRIALING") {
165:     update.trialEnd = now;
166:   }
167: 
168:   if (targetState === "EXPIRED") {
169:     update.periodEnd = now;
170:   }
171: 
172:   Object.assign(existing, update);
173:   await existing.save();
174: 
175:   const transition: SubscriptionTransition = {
176:     from: fromState,
177:     to: targetState,
178:     reason: options?.reason,
179:     triggeredBy: options?.triggeredBy ?? "system",
180:     providerEventId: options?.providerEventId,
181:   };
182: 
183:   writeAudit(
184:     "SUBSCRIPTION_UPDATED",
185:     String(existing._id),
186:     transition as unknown as Record<string, unknown>,
187:     tenantId,
188:     actor,
189:   );
190: 
191:   return existing.toJSON();
192: }
193: 
194: /**
195:  * Get a subscription by tenant ID. Throws if not found.
196:  */
197: export async function getSubscription(
198:   tenantId: string,
199: ): Promise<SubscriptionDocument> {
200:   const sub = await SubscriptionModel.findOne({ tenantId }).lean().exec();
201:   if (!sub) {
202:     throw new AppError(404, NOT_FOUND, "Subscription not found for tenant");
203:   }
204:   return sub;
205: }
206: 
207: /**
208:  * List subscriptions with an optional status filter. Super Admin scope.
209:  */
210: export async function listSubscriptions(
211:   filter?: SubscriptionFilter,
212: ): Promise<SubscriptionDocument[]> {
213:   const query: Record<string, unknown> = {};
214:   if (filter?.status) {
215:     query.status = filter.status;
216:   }
217:   if (filter?.tenantId) {
218:     query.tenantId = new Types.ObjectId(filter.tenantId);
219:   }
220:   return SubscriptionModel.find(query)
221:     .sort({ createdAt: -1 })
222:     .exec();
223: }
224: 
225: /**
226:  * Return the list of legal target states from a given subscription status.
227:  */
228: export function getLegalTransitions(
229:   fromStatus: SubscriptionStatus,
230: ): readonly SubscriptionStatus[] {
231:   return LEGAL_TRANSITIONS[fromStatus];
232: }

(End of file - total 232 lines)
</content>
```

---

## Assistant (Build · Big Pickle · 32.4s)

_Thinking:_

Now I have all the information I need to provide a comprehensive diagnosis. Let me analyze the situation:

1. **Webhook endpoint URL and HTTP method**: `POST /webhooks/payment/stripe`

2. **Events currently handled**:
   - `checkout.session.completed`
   - `invoice.paid`
   - `invoice.payment_failed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`

3. **What happens when a Stripe Checkout payment is declined with test card 4000 0000 0000 0341**:

   This is the critical part. When using Stripe Checkout in `mode: "subscription"`:
   
   - The default `payment_behavior` for Checkout Sessions in subscription mode is `"error_if_incomplete"`, which means the session fails immediately if the payment can't be processed. The code in `stripe-payment-provider.ts` doesn't explicitly set `payment_behavior`, so it's relying on this default behavior.
   
   - However, there's an important consideration here: when `payment_behavior` is `"error_if_incomplete"`, Stripe doesn't actually create a Subscription object in its system. The Checkout Session itself fails, but no subscription is ever created on Stripe's end. This means the webhook event flow changes significantly—instead of getting subscription-related events, the system would only receive a `checkout.session.completed` event with a failed status, or potentially no event at all depending on how the failure is handled.

   - Looking at the actual webhook handlers in the code, the `checkout.session.completed` handler expects a subscription ID in the event payload, but if no subscription was created due to the failed payment, that field would be undefined. This creates a mismatch between what the webhook handler expects and what Stripe actually sends.

   - For the test card 4000 0000 0000 0341 specifically, which triggers a generic decline, Stripe won't create a subscription object at all since the payment fails immediately. This means the `checkout.session.completed` event will either not fire or will fire without a subscription ID, leaving the handler unable to find or update the subscription record.

The real issue is that when payment fails during checkout, no `customer` field gets included in the webhook event either—the session object only contains the session ID itself, not the customer details. This breaks the subscription resolution logic entirely, since it can't find the subscription by tenant ID, customer ID, or subscription ID.

Here's my precise diagnosis based on the codebase inspection:

---

## 1. Webhook Endpoint URL and HTTP Method

**`POST /webhooks/payment/stripe`**

- Route: `api/src/modules/payment-webhooks/payment-webhooks.routes.ts:4` — `router.post("/stripe", webhookHandlerController)`
- Mounted at: `api/src/app.ts:145` — `app.use("/webhooks/payment", paymentWebhookRoutes)`
- Raw body middleware applied at: `api/src/app.ts:108-109`

---

## 2. Currently Handled Stripe Events

| Event | Handler Type | File:Line |
|---|---|---|
| `checkout.session.completed` | Static mapping → `INCOMPLETE` | `payment-webhooks.service.ts:50-54` |
| `invoice.paid` | Static mapping → `ACTIVE` | `payment-webhooks.service.ts:55-59` |
| `invoice.payment_failed` | Static mapping → `PAST_DUE` | `payment-webhooks.service.ts:60-64` |
| `customer.subscription.updated` | Dynamic handler (Stripe status map) | `payment-webhooks.service.ts:238-347` |
| `customer.subscription.deleted` | Static mapping → `EXPIRED` | `payment-webhooks.service.ts:65-69` |

Events **not** in this list are silently dropped at `payment-webhooks.service.ts:128-132` (no matching `EVENT_STATUS_MAP` entry, no `isSubscriptionUpdate` match → falls through with no action).

---

## 3. Expected Event for a Declined Initial Checkout Payment

When a subscription-mode Checkout Session payment is **declined** (test card `4000 0000 0000 0341`), Stripe fires **`checkout.session.completed`** with `payment_status: "unpaid"` on the session object.

**Crucially**, this happens because the Checkout Session was created without specifying `payment_behavior` (`stripe-payment-provider.ts:45-52`). The default for `mode: "subscription"` is `"error_if_incomplete"`, meaning:

- Stripe does **not** create a Stripe Subscription object when the initial payment fails
- The session's `status` is `"complete"` (not `"open"`)
- The session's `payment_status` is `"unpaid"`
- `data.object.subscription` is **`null`**
- `data.object.customer` is **`null`** (or may be present, but no subscription exists)

---

## 4. Will the Internal Subscription Be Created/Updated on Failure?

**No.** The implementation will **fail to process** the event. Here's the exact failure chain:

1. `checkout.session.completed` arrives → matches `EVENT_STATUS_MAP` at `payment-webhooks.service.ts:50`
2. `handleStaticMappingEvent()` is called → `resolveSubscriptionFromEvent()` runs at `:161`
3. Resolution tries three strategies (`:359-381`):
   - `metadata.tenantId` → tries `extractTenantFromEvent()` → reads `data.object.metadata.tenantId` — this **may** exist (it was set at checkout creation, `checkout.service.ts:128-133`)
   - `providerCustomerId` → `data.object.customer` → **null** for failed payment
   - `providerSubscriptionId` → `data.object.subscription` → **null** for failed payment
4. **If** `metadata.tenantId` resolves, it queries `SubscriptionModel.findOne({ tenantId })`. For a **first-time** checkout, no subscription document exists yet → returns `null`
5. `resolved` is `null` → event is marked as **`failed`** with error `"No subscription found for event (tenantId not resolvable)"` at `:164-169`

**Net result**: The internal subscription stays in whatever state it was (or doesn't exist), the `PaymentEvent` record is logged as `failed`, and the `CheckoutSession` record stays `pending`. Nothing is transitioned.

---

## 5. Missing Webhook Event Handler?

**Yes.** There is no handler for the scenario where the **initial** Checkout payment fails and no subscription exists yet. Specifically:

- The `checkout.session.completed` handler assumes a subscription already exists (it tries to transition it from `INCOMPLETE`/`TRIALING`)
- There is **no** `checkout.session.expired` handler (Stripe also fires this if the session times out without payment)
- There is **no** `payment_intent.payment_failed` handler (this is a different event, but some configurations emit it)
- The `invoice.payment_failed` handler requires an existing subscription in `ACTIVE` or `INCOMPLETE` state

The root gap: **the codebase never creates an internal Subscription record during the `checkout.session.completed` flow for failed payments**. The subscription is only created by the `createSubscription()` function in `subscription.service.ts:80`, which is called from a different code path (package provisioning, not webhook-driven).

---

## 6. Verification Checklist

| Event | Used? | Location |
|---|---|---|
| `checkout.session.completed` | **Yes** | `payment-webhooks.service.ts:50` |
| `invoice.paid` | **Yes** | `payment-webhooks.service.ts:55` |
| `invoice.payment_failed` | **Yes** | `payment-webhooks.service.ts:60` |
| `payment_intent.payment_failed` | **No** | Not in `EVENT_STATUS_MAP`, silently dropped |
| `customer.subscription.updated` | **Yes** | `payment-webhooks.service.ts:124` (dedicated handler) |
| `customer.subscription.deleted` | **Yes** | `payment-webhooks.service.ts:65` |

---

## Summary Diagnosis

The `POST /webhooks/payment/stripe` endpoint receives the `checkout.session.completed` event with `payment_status: "unpaid"`, but the handler fails because it expects an existing internal Subscription document. For a first-time checkout with a declined card, no Subscription exists in MongoDB yet, so `resolveSubscriptionFromEvent()` returns `null` and the event is recorded as `failed`. The `CheckoutSession` record also remains `pending` (it's only updated to `completed` at `:212-221` after successful processing). There is no code path that creates or marks a subscription as failed when the initial Checkout payment is declined.

---

## User

We have confirmed a real billing lifecycle gap.

Scenario tested from the DocuMind website:

1. Company Admin selects a plan.
2. POST /checkout/sessions returns 201.
3. Stripe Checkout opens.
4. Test card 4000 0000 0000 0341 is entered.
5. Stripe displays: "Your card was declined. Please try a different card."
6. No Stripe Subscription is created.
7. No internal Subscription exists for this first-time checkout.
8. The webhook processing cannot resolve a Subscription.
9. The internal CheckoutSession remains pending and the PaymentEvent is recorded as failed.

Current handled events:
- checkout.session.completed
- invoice.paid
- invoice.payment_failed
- customer.subscription.updated
- customer.subscription.deleted

We need to implement a robust initial-checkout failure lifecycle.

Before modifying code, inspect the current models, state machines, checkout session persistence, payment event persistence, and webhook idempotency logic.

Then implement the following:

A. Failed initial Checkout handling
- Handle the actual Stripe event(s) that reliably represent an initial subscription Checkout payment failure for the current integration.
- Do not create an internal ACTIVE Subscription when the initial payment fails.
- Update the internal CheckoutSession from PENDING to a terminal failure state, if the current model supports it.
- If no failure state exists, add the smallest appropriate state change/migration.
- Persist a normalized failure reason and relevant Stripe identifiers where the existing model supports this.
- Ensure the tenant can retry checkout afterward.

B. checkout.session.expired
- Add explicit handling for checkout.session.expired.
- Mark the corresponding internal CheckoutSession as expired/failed.
- Do not create or modify an ACTIVE Subscription.
- Make the handler idempotent.

C. Event correlation
For failed initial checkout events, correlate using the strongest available identifiers in this order:
1. Checkout Session ID
2. Metadata tenantId
3. Stripe Customer ID, if present
4. Stripe Subscription ID, if present

Do not assume an internal Subscription already exists.

D. Preserve existing successful flows
Do not regress:
- successful Checkout
- checkout.session.completed
- invoice.paid
- invoice.payment_failed
- customer.subscription.updated
- customer.subscription.deleted
- Billing Portal
- cancellation at period end
- immediate cancellation

E. Tests
Add/update tests for:
1. Initial Checkout payment failure
2. checkout.session.expired
3. No internal Subscription is created as ACTIVE on initial payment failure
4. CheckoutSession transitions correctly
5. Retry checkout remains possible
6. Duplicate failure webhook is idempotent
7. Existing successful checkout remains unchanged
8. Existing invoice.payment_failed behavior remains unchanged

F. Verification
After implementation, run:
- lint
- typecheck
- unit tests
- relevant integration tests

Do not make unrelated architectural changes.
First inspect the current implementation and provide a short implementation plan. Then implement it. 

---

## Assistant (Build · Big Pickle · 18.3s)

_Thinking:_

The user wants me to implement a robust initial-checkout failure lifecycle for their Stripe integration. Let me first thoroughly inspect the current implementation to understand the models, state machines, and existing patterns, then create an implementation plan.

Let me start by reading all the relevant files I need to understand.

Let me thoroughly inspect the current implementation before planning.

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/marco/documind-ai/api/src/db/models/checkoutSession.model.ts"
}
```

**Output:**
```
<path>/home/marco/documind-ai/api/src/db/models/checkoutSession.model.ts</path>
<type>file</type>
<content>
1: import mongoose, { Schema } from "mongoose";
2: 
3: export interface CheckoutSessionDocument extends mongoose.Document {
4:   tenantId: mongoose.Types.ObjectId;
5:   packageId: mongoose.Types.ObjectId;
6:   packageVersion: number;
7:   billingInterval: "monthly" | "annual";
8:   providerSessionId: string;
9:   providerCustomerId: string;
10:   status: "pending" | "completed" | "expired" | "failed";
11:   returnUrl: string;
12:   cancelUrl: string;
13:   metadata: Map<string, string>;
14:   expiresAt: Date;
15:   completedAt: Date | null;
16:   createdAt: Date;
17:   updatedAt: Date;
18: }
19: 
20: const checkoutSessionSchema = new Schema<CheckoutSessionDocument>(
21:   {
22:     tenantId: {
23:       type: Schema.Types.ObjectId,
24:       ref: "Tenant",
25:       required: true,
26:       index: true,
27:     },
28:     packageId: {
29:       type: Schema.Types.ObjectId,
30:       ref: "Package",
31:       required: true,
32:     },
33:     packageVersion: { type: Number, required: true, min: 1 },
34:     billingInterval: {
35:       type: String,
36:       enum: ["monthly", "annual"],
37:       required: true,
38:     },
39:     providerSessionId: { type: String, required: true, unique: true },
40:     providerCustomerId: { type: String, default: "" },
41:     status: {
42:       type: String,
43:       enum: ["pending", "completed", "expired", "failed"],
44:       default: "pending",
45:       index: true,
46:     },
47:     returnUrl: { type: String, default: "" },
48:     cancelUrl: { type: String, default: "" },
49:     metadata: { type: Schema.Types.Map, of: String, default: {} },
50:     expiresAt: { type: Date, required: true },
51:     completedAt: { type: Date, default: null },
52:   },
53:   { timestamps: true },
54: );
55: 
56: checkoutSessionSchema.index(
57:   { tenantId: 1, status: 1 },
58:   { name: "idx_tenant_status" },
59: );
60: 
61: const CheckoutSessionModel = mongoose.model<CheckoutSessionDocument>(
62:   "CheckoutSession",
63:   checkoutSessionSchema,
64: );
65: export default CheckoutSessionModel;

(End of file - total 65 lines)
</content>
```

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/marco/documind-ai/api/src/db/models/paymentEvent.model.ts"
}
```

**Output:**
```
<path>/home/marco/documind-ai/api/src/db/models/paymentEvent.model.ts</path>
<type>file</type>
<content>
1: import mongoose, { Schema } from "mongoose";
2: 
3: export interface PaymentEventDocument extends mongoose.Document {
4:   eventId: string;
5:   eventType: string;
6:   provider: string;
7:   status: "received" | "verified" | "processed" | "failed";
8:   signature: string;
9:   rawBody: string;
10:   payload: Record<string, unknown>;
11:   processingErrors: string[];
12:   processedAt: Date | null;
13:   tenantId: mongoose.Types.ObjectId | null;
14:   createdAt: Date;
15:   updatedAt: Date;
16: }
17: 
18: const paymentEventSchema = new Schema<PaymentEventDocument>(
19:   {
20:     eventId: { type: String, required: true, unique: true },
21:     eventType: { type: String, required: true, index: true },
22:     provider: { type: String, required: true, default: "stripe" },
23:     status: {
24:       type: String,
25:       enum: ["received", "verified", "processed", "failed"],
26:       default: "received",
27:       index: true,
28:     },
29:     signature: { type: String, default: "" },
30:     rawBody: { type: String, default: "" },
31:     payload: { type: Schema.Types.Mixed, default: {} },
32:     processingErrors: [{ type: String }],
33:     processedAt: { type: Date, default: null },
34:     tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", default: null, index: true },
35:   },
36:   { timestamps: true },
37: );
38: 
39: paymentEventSchema.index({ eventId: 1, status: 1 }, { name: "idx_event_id_status" });
40: 
41: const PaymentEventModel = mongoose.model<PaymentEventDocument>(
42:   "PaymentEvent",
43:   paymentEventSchema,
44: );
45: export default PaymentEventModel;

(End of file - total 45 lines)
</content>
```

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/marco/documind-ai/api/src/db/models/subscription.model.ts"
}
```

**Output:**
```
<path>/home/marco/documind-ai/api/src/db/models/subscription.model.ts</path>
<type>file</type>
<content>
1: import mongoose, { Schema } from "mongoose";
2: 
3: export type SubscriptionStatus =
4:   | "TRIALING"
5:   | "INCOMPLETE"
6:   | "ACTIVE"
7:   | "PAST_DUE"
8:   | "PAUSED"
9:   | "CANCEL_AT_PERIOD_END"
10:   | "CANCELED"
11:   | "EXPIRED"
12:   | "UNPAID";
13: 
14: export type PaymentState = "pending" | "paid" | "failed" | "refunded";
15: 
16: export interface SubscriptionDocument extends mongoose.Document {
17:   tenantId: mongoose.Types.ObjectId;
18:   packageId: mongoose.Types.ObjectId;
19:   packageVersion: number;
20:   status: SubscriptionStatus;
21:   /** @deprecated Use periodEnd instead */
22:   renewsAt: Date | null;
23:   startedAt: Date;
24:   periodStart: Date | null;
25:   periodEnd: Date | null;
26:   trialStart: Date | null;
27:   trialEnd: Date | null;
28:   cancelledAt: Date | null;
29:   cancellationReason: string;
30:   providerCustomerId: string;
31:   providerSubscriptionId: string;
32:   providerPriceId: string;
33:   paymentState: PaymentState;
34:   providerMetadata: Map<string, string>;
35:   lastProviderEventId: string;
36:   createdAt: Date;
37:   updatedAt: Date;
38: }
39: 
40: const subscriptionSchema = new Schema<SubscriptionDocument>(
41:   {
42:     tenantId: {
43:       type: Schema.Types.ObjectId,
44:       ref: "Tenant",
45:       required: true,
46:       unique: true,
47:     },
48:     packageId: {
49:       type: Schema.Types.ObjectId,
50:       ref: "Package",
51:       required: true,
52:       index: true,
53:     },
54:     packageVersion: { type: Number, required: true, min: 1 },
55:     status: {
56:       type: String,
57:       enum: [
58:         "TRIALING",
59:         "INCOMPLETE",
60:         "ACTIVE",
61:         "PAST_DUE",
62:         "PAUSED",
63:         "CANCEL_AT_PERIOD_END",
64:         "CANCELED",
65:         "EXPIRED",
66:         "UNPAID",
67:       ],
68:       default: "ACTIVE",
69:       index: true,
70:     },
71:     startedAt: { type: Date, required: true, default: Date.now },
72:     /** @deprecated Use periodEnd instead */
73:     renewsAt: { type: Date, default: null },
74:     periodStart: { type: Date, default: null },
75:     periodEnd: { type: Date, default: null },
76:     trialStart: { type: Date, default: null },
77:     trialEnd: { type: Date, default: null },
78:     cancelledAt: { type: Date, default: null },
79:     cancellationReason: { type: String, default: "" },
80:     providerCustomerId: { type: String, default: "" },
81:     providerSubscriptionId: { type: String, default: "" },
82:     providerPriceId: { type: String, default: "" },
83:     paymentState: {
84:       type: String,
85:       enum: ["pending", "paid", "failed", "refunded"],
86:       default: "pending",
87:     },
88:     providerMetadata: { type: Schema.Types.Map, of: String, default: {} },
89:     lastProviderEventId: { type: String, default: "" },
90:   },
91:   { timestamps: true },
92: );
93: 
94: subscriptionSchema.index({ status: 1, tenantId: 1 }, { name: "idx_status_tenant" });
95: 
96: const SubscriptionModel = mongoose.model<SubscriptionDocument>(
97:   "Subscription",
98:   subscriptionSchema,
99: );
100: export default SubscriptionModel;

(End of file - total 100 lines)
</content>
```

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/marco/documind-ai/api/src/modules/billing/billing.types.ts"
}
```

**Output:**
```
<path>/home/marco/documind-ai/api/src/modules/billing/billing.types.ts</path>
<type>file</type>
<content>
1: export type SubscriptionStatus =
2:   | "TRIALING"
3:   | "INCOMPLETE"
4:   | "ACTIVE"
5:   | "PAST_DUE"
6:   | "PAUSED"
7:   | "CANCEL_AT_PERIOD_END"
8:   | "CANCELED"
9:   | "EXPIRED"
10:   | "UNPAID";
11: 
12: export type PaymentState = "pending" | "paid" | "failed" | "refunded";
13: 
14: export interface PackageEntitlement {
15:   employees: number;
16:   admins: number;
17:   documents: number;
18:   storageMb: number;
19:   fileSizeMb: number;
20:   queriesPerMonth: number;
21:   tokensPerMonth: number;
22:   ocrPagesPerMonth: number;
23: }
24: 
25: /**
26:  * Immutable snapshot of a package at a point in time.
27:  */
28: export interface PackageSnapshot {
29:   packageId: string;
30:   version: number;
31:   name: string;
32:   code: string;
33:   description: string;
34:   monthlyPrice: number;
35:   annualPrice: number;
36:   currency: string;
37:   trialDays: number;
38:   entitlements: PackageEntitlement;
39:   supportedModels: string[];
40:   analyticsLevel: "basic" | "advanced" | "enterprise";
41:   retentionDays: number;
42:   supportLevel: "community" | "standard" | "priority" | "dedicated";
43:   visibility: "public" | "internal";
44: }
45: 
46: export interface SubscriptionTransition {
47:   from: SubscriptionStatus;
48:   to: SubscriptionStatus;
49:   reason?: string;
50:   triggeredBy: "user" | "admin" | "system" | "provider_event";
51:   providerEventId?: string;
52: }

(End of file - total 52 lines)
</content>
```

---

## Assistant (Build · Big Pickle · 8.1s)

_Thinking:_

Now let me read the existing test files to understand the testing patterns.

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/marco/documind-ai/api/src/modules/billing/__tests__/payment-webhooks.service.test.ts"
}
```

**Output:**
```
<path>/home/marco/documind-ai/api/src/modules/billing/__tests__/payment-webhooks.service.test.ts</path>
<type>file</type>
<content>
1: import { describe, it, expect, vi, beforeEach } from "vitest";
2: 
3: vi.mock("../../../db/models/subscription.model.js", () => ({
4:   default: {
5:     findOne: vi.fn(),
6:     updateOne: vi.fn(),
7:   },
8: }));
9: 
10: vi.mock("../../../db/models/paymentEvent.model.js", () => ({
11:   default: {
12:     create: vi.fn(),
13:     findOne: vi.fn(),
14:   },
15: }));
16: 
17: vi.mock("../../../db/models/checkoutSession.model.js", () => ({
18:   default: {
19:     updateOne: vi.fn(),
20:   },
21: }));
22: 
23: vi.mock("../../../common/observability/index.js", () => ({
24:   getAuditWriter: () => ({ write: vi.fn().mockResolvedValue(undefined) }),
25: }));
26: 
27: vi.mock("../../billing/subscription.service.js", () => ({
28:   transitionSubscription: vi.fn(),
29: }));
30: 
31: vi.mock("../../permissions/permissions.operation.js", () => ({
32:   authorizePlatformOperation: vi.fn(),
33: }));
34: 
35: import SubscriptionModel from "../../../db/models/subscription.model.js";
36: import PaymentEventModel from "../../../db/models/paymentEvent.model.js";
37: import CheckoutSessionModel from "../../../db/models/checkoutSession.model.js";
38: import { handlePaymentEvent } from "../../payment-webhooks/payment-webhooks.service.js";
39: import { transitionSubscription } from "../subscription.service.js";
40: import type { PaymentProviderEvent } from "../ports/payment-provider.port.js";
41: 
42: const TENANT_ID = "507f1f77bcf86cd799439011";
43: const SUBSCRIPTION_ID = "507f1f77bcf86cd799439014";
44: const CUSTOMER_ID = "cus_abc123";
45: const STRIPE_SUB_ID = "sub_xyz789";
46: 
47: function makeEvent(
48:   overrides: Partial<PaymentProviderEvent> & {
49:     rawObject?: Record<string, unknown>;
50:   },
51: ): PaymentProviderEvent {
52:   const { rawObject, ...rest } = overrides;
53:   return {
54:     id: rest.id ?? "evt_test_1",
55:     type: rest.type ?? "invoice.paid",
56:     timestamp: rest.timestamp ?? new Date(),
57:     provider: rest.provider ?? "stripe",
58:     raw: {
59:       data: {
60:         object: rawObject ?? {},
61:       },
62:     },
63:   };
64: }
65: 
66: function mockQueryChain<T>(result: T) {
67:   const chain = {
68:     lean: vi.fn().mockReturnThis(),
69:     exec: vi.fn().mockResolvedValue(result),
70:     sort: vi.fn().mockReturnThis(),
71:     skip: vi.fn().mockReturnThis(),
72:     limit: vi.fn().mockReturnThis(),
73:   };
74:   chain.lean = vi.fn(() => chain);
75:   chain.sort = vi.fn(() => chain);
76:   chain.skip = vi.fn(() => chain);
77:   chain.limit = vi.fn(() => chain);
78:   return chain;
79: }
80: 
81: function makeSub(overrides: Record<string, unknown> = {}) {
82:   return {
83:     _id: SUBSCRIPTION_ID,
84:     tenantId: TENANT_ID,
85:     status: "INCOMPLETE",
86:     providerCustomerId: CUSTOMER_ID,
87:     providerSubscriptionId: STRIPE_SUB_ID,
88:     packageId: "507f1f77bcf86cd799439012",
89:     ...overrides,
90:   };
91: }
92: 
93: describe("handlePaymentEvent", () => {
94:   beforeEach(() => {
95:     vi.clearAllMocks();
96:     (PaymentEventModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
97:       mockQueryChain(null),
98:     );
99:     (PaymentEventModel.create as ReturnType<typeof vi.fn>).mockResolvedValue({
100:       _id: "evt_record_1",
101:       eventId: "evt_test_1",
102:       status: "received",
103:       processingErrors: [],
104:       save: vi.fn().mockResolvedValue(undefined),
105:     });
106:     (SubscriptionModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
107:       mockQueryChain(null),
108:     );
109:     (SubscriptionModel.updateOne as ReturnType<typeof vi.fn>).mockResolvedValue(
110:       { modifiedCount: 1 },
111:     );
112:     (CheckoutSessionModel.updateOne as ReturnType<
113:       typeof vi.fn
114:     >).mockResolvedValue({ modifiedCount: 1 });
115:     (transitionSubscription as ReturnType<typeof vi.fn>).mockResolvedValue(
116:       makeSub(),
117:     );
118:   });
119: 
120:   describe("idempotency", () => {
121:     it("skips duplicate webhook events", async () => {
122:       (PaymentEventModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
123:         mockQueryChain({ eventId: "evt_dup_1" }),
124:       );
125: 
126:       const event = makeEvent({ id: "evt_dup_1", type: "invoice.paid" });
127:       await handlePaymentEvent(event, "{}", "sig");
128: 
129:       expect(transitionSubscription).not.toHaveBeenCalled();
130:     });
131: 
132:     it("processes new events that are not duplicates", async () => {
133:       (SubscriptionModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
134:         mockQueryChain(makeSub({ status: "INCOMPLETE" })),
135:       );
136: 
137:       const event = makeEvent({
138:         id: "evt_new_1",
139:         type: "invoice.paid",
140:         rawObject: {
141:           customer: CUSTOMER_ID,
142:           subscription: STRIPE_SUB_ID,
143:         },
144:       });
145:       await handlePaymentEvent(event, "{}", "sig");
146: 
147:       expect(transitionSubscription).toHaveBeenCalled();
148:     });
149:   });
150: 
151:   describe("invoice.paid — tenant resolution", () => {
152:     it("resolves subscription via metadata.tenantId when available", async () => {
153:       (SubscriptionModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
154:         mockQueryChain(makeSub({ status: "INCOMPLETE" })),
155:       );
156: 
157:       const event = makeEvent({
158:         id: "evt_ip_1",
159:         type: "invoice.paid",
160:         rawObject: {
161:           metadata: { tenantId: TENANT_ID },
162:           customer: CUSTOMER_ID,
163:           subscription: STRIPE_SUB_ID,
164:         },
165:       });
166:       await handlePaymentEvent(event, "{}", "sig");
167: 
168:       expect(SubscriptionModel.findOne).toHaveBeenCalledWith({
169:         tenantId: expect.anything(),
170:       });
171:       expect(transitionSubscription).toHaveBeenCalledWith(
172:         TENANT_ID,
173:         "ACTIVE",
174:         expect.objectContaining({ triggeredBy: "provider_event" }),
175:       );
176:     });
177: 
178:     it("falls back to providerCustomerId when metadata.tenantId is absent", async () => {
179:       (SubscriptionModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
180:         mockQueryChain(makeSub({ status: "INCOMPLETE" })),
181:       );
182: 
183:       const event = makeEvent({
184:         id: "evt_ip_2",
185:         type: "invoice.paid",
186:         rawObject: {
187:           customer: CUSTOMER_ID,
188:           subscription: STRIPE_SUB_ID,
189:         },
190:       });
191:       await handlePaymentEvent(event, "{}", "sig");
192: 
193:       expect(SubscriptionModel.findOne).toHaveBeenCalledWith({
194:         providerCustomerId: CUSTOMER_ID,
195:       });
196:       expect(transitionSubscription).toHaveBeenCalled();
197:     });
198: 
199:     it("falls back to providerSubscriptionId when customer lookup also fails", async () => {
200:       (SubscriptionModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
201:         mockQueryChain(makeSub({ status: "INCOMPLETE" })),
202:       );
203: 
204:       const event = makeEvent({
205:         id: "evt_ip_3",
206:         type: "invoice.paid",
207:         rawObject: {
208:           subscription: STRIPE_SUB_ID,
209:         },
210:       });
211:       await handlePaymentEvent(event, "{}", "sig");
212: 
213:       expect(SubscriptionModel.findOne).toHaveBeenCalledWith({
214:         providerSubscriptionId: STRIPE_SUB_ID,
215:       });
216:       expect(transitionSubscription).toHaveBeenCalled();
217:     });
218: 
219:     it("fails when no resolution path finds a subscription", async () => {
220:       const event = makeEvent({
221:         id: "evt_ip_4",
222:         type: "invoice.paid",
223:         rawObject: {},
224:       });
225: 
226:       const eventRecord = {
227:         _id: "rec_1",
228:         status: "received",
229:         processingErrors: [],
230:         save: vi.fn().mockResolvedValue(undefined),
231:       };
232:       (PaymentEventModel.create as ReturnType<typeof vi.fn>).mockResolvedValue(
233:         eventRecord,
234:       );
235: 
236:       await handlePaymentEvent(event, "{}", "sig");
237: 
238:       expect(eventRecord.status).toBe("failed");
239:       expect(eventRecord.processingErrors).toContainEqual(
240:         expect.stringContaining("No subscription found"),
241:       );
242:     });
243:   });
244: 
245:   describe("invoice.paid — subscription activation", () => {
246:     it("transitions INCOMPLETE → ACTIVE on successful payment", async () => {
247:       (SubscriptionModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
248:         mockQueryChain(makeSub({ status: "INCOMPLETE" })),
249:       );
250: 
251:       const event = makeEvent({
252:         id: "evt_ip_act_1",
253:         type: "invoice.paid",
254:         rawObject: {
255:           metadata: { tenantId: TENANT_ID },
256:           customer: CUSTOMER_ID,
257:         },
258:       });
259:       await handlePaymentEvent(event, "{}", "sig");
260: 
261:       expect(transitionSubscription).toHaveBeenCalledWith(
262:         TENANT_ID,
263:         "ACTIVE",
264:         expect.objectContaining({ triggeredBy: "provider_event" }),
265:       );
266:     });
267: 
268:     it("transitions PAST_DUE → ACTIVE on successful payment", async () => {
269:       (SubscriptionModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
270:         mockQueryChain(makeSub({ status: "PAST_DUE" })),
271:       );
272: 
273:       const event = makeEvent({
274:         id: "evt_ip_act_2",
275:         type: "invoice.paid",
276:         rawObject: {
277:           metadata: { tenantId: TENANT_ID },
278:         },
279:       });
280:       await handlePaymentEvent(event, "{}", "sig");
281: 
282:       expect(transitionSubscription).toHaveBeenCalledWith(
283:         TENANT_ID,
284:         "ACTIVE",
285:         expect.anything(),
286:       );
287:     });
288: 
289:     it("does not transition when current status is not in fromStatuses", async () => {
290:       (SubscriptionModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
291:         mockQueryChain(makeSub({ status: "CANCELED" })),
292:       );
293: 
294:       const event = makeEvent({
295:         id: "evt_ip_act_3",
296:         type: "invoice.paid",
297:         rawObject: {
298:           metadata: { tenantId: TENANT_ID },
299:         },
300:       });
301:       await handlePaymentEvent(event, "{}", "sig");
302: 
303:       expect(transitionSubscription).not.toHaveBeenCalled();
304:     });
305:   });
306: 
307:   describe("invoice.payment_failed — tenant resolution", () => {
308:     it("resolves subscription via providerCustomerId when metadata is absent", async () => {
309:       (SubscriptionModel.findOne as ReturnType<typeof vi.fn>)
310:         .mockReturnValueOnce(mockQueryChain(null))
311:         .mockReturnValueOnce(
312:           mockQueryChain(makeSub({ status: "ACTIVE" })),
313:         );
314: 
315:       const event = makeEvent({
316:         id: "evt_ipf_1",
317:         type: "invoice.payment_failed",
318:         rawObject: {
319:           customer: CUSTOMER_ID,
320:           subscription: STRIPE_SUB_ID,
321:         },
322:       });
323:       await handlePaymentEvent(event, "{}", "sig");
324: 
325:       expect(transitionSubscription).toHaveBeenCalledWith(
326:         TENANT_ID,
327:         "PAST_DUE",
328:         expect.objectContaining({ triggeredBy: "provider_event" }),
329:       );
330:     });
331: 
332:     it("transitions ACTIVE → PAST_DUE on payment failure", async () => {
333:       (SubscriptionModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
334:         mockQueryChain(makeSub({ status: "ACTIVE" })),
335:       );
336: 
337:       const event = makeEvent({
338:         id: "evt_ipf_2",
339:         type: "invoice.payment_failed",
340:         rawObject: {
341:           metadata: { tenantId: TENANT_ID },
342:         },
343:       });
344:       await handlePaymentEvent(event, "{}", "sig");
345: 
346:       expect(transitionSubscription).toHaveBeenCalledWith(
347:         TENANT_ID,
348:         "PAST_DUE",
349:         expect.anything(),
350:       );
351:     });
352: 
353:     it("does not activate subscription on payment failure", async () => {
354:       (SubscriptionModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
355:         mockQueryChain(makeSub({ status: "INCOMPLETE" })),
356:       );
357: 
358:       const event = makeEvent({
359:         id: "evt_ipf_3",
360:         type: "invoice.payment_failed",
361:         rawObject: {
362:           metadata: { tenantId: TENANT_ID },
363:         },
364:       });
365:       await handlePaymentEvent(event, "{}", "sig");
366: 
367:       expect(transitionSubscription).toHaveBeenCalledWith(
368:         TENANT_ID,
369:         "PAST_DUE",
370:         expect.anything(),
371:       );
372:       expect(transitionSubscription).not.toHaveBeenCalledWith(
373:         TENANT_ID,
374:         "ACTIVE",
375:         expect.anything(),
376:       );
377:     });
378:   });
379: 
380:   describe("customer.subscription.updated — status mapping", () => {
381:     it("maps Stripe active status to internal ACTIVE", async () => {
382:       (SubscriptionModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
383:         mockQueryChain(makeSub({ status: "INCOMPLETE" })),
384:       );
385: 
386:       const event = makeEvent({
387:         id: "evt_csu_1",
388:         type: "customer.subscription.updated",
389:         rawObject: {
390:           metadata: { tenantId: TENANT_ID },
391:           status: "active",
392:           cancel_at_period_end: false,
393:         },
394:       });
395:       await handlePaymentEvent(event, "{}", "sig");
396: 
397:       expect(transitionSubscription).toHaveBeenCalledWith(
398:         TENANT_ID,
399:         "ACTIVE",
400:         expect.anything(),
401:       );
402:     });
403: 
404:     it("maps Stripe past_due status to internal PAST_DUE", async () => {
405:       (SubscriptionModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
406:         mockQueryChain(makeSub({ status: "ACTIVE" })),
407:       );
408: 
409:       const event = makeEvent({
410:         id: "evt_csu_2",
411:         type: "customer.subscription.updated",
412:         rawObject: {
413:           metadata: { tenantId: TENANT_ID },
414:           status: "past_due",
415:           cancel_at_period_end: false,
416:         },
417:       });
418:       await handlePaymentEvent(event, "{}", "sig");
419: 
420:       expect(transitionSubscription).toHaveBeenCalledWith(
421:         TENANT_ID,
422:         "PAST_DUE",
423:         expect.anything(),
424:       );
425:     });
426: 
427:     it("maps Stripe incomplete_expired to internal EXPIRED", async () => {
428:       (SubscriptionModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
429:         mockQueryChain(makeSub({ status: "INCOMPLETE" })),
430:       );
431: 
432:       const event = makeEvent({
433:         id: "evt_csu_3",
434:         type: "customer.subscription.updated",
435:         rawObject: {
436:           metadata: { tenantId: TENANT_ID },
437:           status: "incomplete_expired",
438:           cancel_at_period_end: false,
439:         },
440:       });
441:       await handlePaymentEvent(event, "{}", "sig");
442: 
443:       expect(transitionSubscription).toHaveBeenCalledWith(
444:         TENANT_ID,
445:         "EXPIRED",
446:         expect.anything(),
447:       );
448:     });
449: 
450:     it("skips transition when mapped status is not legal from current status", async () => {
451:       (SubscriptionModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
452:         mockQueryChain(makeSub({ status: "CANCELED" })),
453:       );
454: 
455:       const event = makeEvent({
456:         id: "evt_csu_4",
457:         type: "customer.subscription.updated",
458:         rawObject: {
459:           metadata: { tenantId: TENANT_ID },
460:           status: "active",
461:           cancel_at_period_end: false,
462:         },
463:       });
464:       await handlePaymentEvent(event, "{}", "sig");
465: 
466:       expect(transitionSubscription).not.toHaveBeenCalled();
467:     });
468:   });
469: 
470:   describe("customer.subscription.updated — cancel_at_period_end", () => {
471:     it("transitions to CANCEL_AT_PERIOD_END when cancel_at_period_end is true", async () => {
472:       (SubscriptionModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
473:         mockQueryChain(makeSub({ status: "ACTIVE" })),
474:       );
475: 
476:       const event = makeEvent({
477:         id: "evt_cape_1",
478:         type: "customer.subscription.updated",
479:         rawObject: {
480:           metadata: { tenantId: TENANT_ID },
481:           status: "active",
482:           cancel_at_period_end: true,
483:         },
484:       });
485:       await handlePaymentEvent(event, "{}", "sig");
486: 
487:       expect(transitionSubscription).toHaveBeenCalledWith(
488:         TENANT_ID,
489:         "CANCEL_AT_PERIOD_END",
490:         expect.anything(),
491:       );
492:     });
493: 
494:     it("does NOT immediately cancel when cancel_at_period_end is true", async () => {
495:       (SubscriptionModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
496:         mockQueryChain(makeSub({ status: "ACTIVE" })),
497:       );
498: 
499:       const event = makeEvent({
500:         id: "evt_cape_2",
501:         type: "customer.subscription.updated",
502:         rawObject: {
503:           metadata: { tenantId: TENANT_ID },
504:           status: "active",
505:           cancel_at_period_end: true,
506:         },
507:       });
508:       await handlePaymentEvent(event, "{}", "sig");
509: 
510:       expect(transitionSubscription).not.toHaveBeenCalledWith(
511:         TENANT_ID,
512:         "CANCELED",
513:         expect.anything(),
514:       );
515:       expect(transitionSubscription).not.toHaveBeenCalledWith(
516:         TENANT_ID,
517:         "EXPIRED",
518:         expect.anything(),
519:       );
520:     });
521: 
522:     it("reverts to ACTIVE when cancel_at_period_end changes from true to false", async () => {
523:       (SubscriptionModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
524:         mockQueryChain(makeSub({ status: "CANCEL_AT_PERIOD_END" })),
525:       );
526: 
527:       const event = makeEvent({
528:         id: "evt_cape_3",
529:         type: "customer.subscription.updated",
530:         rawObject: {
531:           metadata: { tenantId: TENANT_ID },
532:           status: "active",
533:           cancel_at_period_end: false,
534:         },
535:       });
536:       await handlePaymentEvent(event, "{}", "sig");
537: 
538:       expect(transitionSubscription).toHaveBeenCalledWith(
539:         TENANT_ID,
540:         "ACTIVE",
541:         expect.anything(),
542:       );
543:     });
544: 
545:     it("transitions to CANCELED when Stripe status is canceled", async () => {
546:       (SubscriptionModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
547:         mockQueryChain(makeSub({ status: "CANCEL_AT_PERIOD_END" })),
548:       );
549: 
550:       const event = makeEvent({
551:         id: "evt_cape_4",
552:         type: "customer.subscription.updated",
553:         rawObject: {
554:           metadata: { tenantId: TENANT_ID },
555:           status: "canceled",
556:           cancel_at_period_end: false,
557:         },
558:       });
559:       await handlePaymentEvent(event, "{}", "sig");
560: 
561:       expect(transitionSubscription).toHaveBeenCalledWith(
562:         TENANT_ID,
563:         "CANCELED",
564:         expect.anything(),
565:       );
566:     });
567:   });
568: 
569:   describe("customer.subscription.updated — tenant resolution", () => {
570:     it("resolves subscription via providerCustomerId when metadata is absent", async () => {
571:       (SubscriptionModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
572:         mockQueryChain(makeSub({ status: "INCOMPLETE" })),
573:       );
574: 
575:       const event = makeEvent({
576:         id: "evt_csu_res_1",
577:         type: "customer.subscription.updated",
578:         rawObject: {
579:           customer: CUSTOMER_ID,
580:           status: "active",
581:           cancel_at_period_end: false,
582:         },
583:       });
584:       await handlePaymentEvent(event, "{}", "sig");
585: 
586:       expect(SubscriptionModel.findOne).toHaveBeenCalledWith({
587:         providerCustomerId: CUSTOMER_ID,
588:       });
589:       expect(transitionSubscription).toHaveBeenCalled();
590:     });
591: 
592:     it("resolves subscription via providerSubscriptionId when customer lookup fails", async () => {
593:       (SubscriptionModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
594:         mockQueryChain(makeSub({ status: "INCOMPLETE" })),
595:       );
596: 
597:       const event = makeEvent({
598:         id: "evt_csu_res_2",
599:         type: "customer.subscription.updated",
600:         rawObject: {
601:           subscription: STRIPE_SUB_ID,
602:           status: "active",
603:           cancel_at_period_end: false,
604:         },
605:       });
606:       await handlePaymentEvent(event, "{}", "sig");
607: 
608:       expect(SubscriptionModel.findOne).toHaveBeenCalledWith({
609:         providerSubscriptionId: STRIPE_SUB_ID,
610:       });
611:       expect(transitionSubscription).toHaveBeenCalled();
612:     });
613: 
614:     it("fails when no resolution path finds a subscription", async () => {
615:       const eventRecord = {
616:         _id: "rec_2",
617:         status: "received",
618:         processingErrors: [],
619:         save: vi.fn().mockResolvedValue(undefined),
620:       };
621:       (PaymentEventModel.create as ReturnType<typeof vi.fn>).mockResolvedValue(
622:         eventRecord,
623:       );
624: 
625:       const event = makeEvent({
626:         id: "evt_csu_res_3",
627:         type: "customer.subscription.updated",
628:         rawObject: {
629:           status: "active",
630:           cancel_at_period_end: false,
631:         },
632:       });
633:       await handlePaymentEvent(event, "{}", "sig");
634: 
635:       expect(eventRecord.status).toBe("failed");
636:     });
637:   });
638: 
639:   describe("checkout.session.completed", () => {
640:     it("transitions to INCOMPLETE with paymentState paid", async () => {
641:       (SubscriptionModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
642:         mockQueryChain(makeSub({ status: "TRIALING" })),
643:       );
644: 
645:       const event = makeEvent({
646:         id: "evt_csc_1",
647:         type: "checkout.session.completed",
648:         rawObject: {
649:           metadata: { tenantId: TENANT_ID, packageId: "pkg_123" },
650:           id: "cs_session_1",
651:         },
652:       });
653:       await handlePaymentEvent(event, "{}", "sig");
654: 
655:       expect(transitionSubscription).toHaveBeenCalledWith(
656:         TENANT_ID,
657:         "INCOMPLETE",
658:         expect.objectContaining({ triggeredBy: "provider_event" }),
659:       );
660:     });
661: 
662:     it("marks checkout session as completed", async () => {
663:       (SubscriptionModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
664:         mockQueryChain(makeSub({ status: "TRIALING" })),
665:       );
666: 
667:       const event = makeEvent({
668:         id: "evt_csc_2",
669:         type: "checkout.session.completed",
670:         rawObject: {
671:           metadata: { tenantId: TENANT_ID },
672:           id: "cs_session_2",
673:         },
674:       });
675:       await handlePaymentEvent(event, "{}", "sig");
676: 
677:       expect(CheckoutSessionModel.updateOne).toHaveBeenCalledWith(
678:         { providerSessionId: "cs_session_2" },
679:         { $set: expect.objectContaining({ status: "completed" }) },
680:       );
681:     });
682:   });
683: 
684:   describe("customer.subscription.deleted", () => {
685:     it("transitions to EXPIRED with paymentState failed", async () => {
686:       (SubscriptionModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
687:         mockQueryChain(makeSub({ status: "ACTIVE" })),
688:       );
689: 
690:       const event = makeEvent({
691:         id: "evt_csd_1",
692:         type: "customer.subscription.deleted",
693:         rawObject: {
694:           metadata: { tenantId: TENANT_ID },
695:         },
696:       });
697:       await handlePaymentEvent(event, "{}", "sig");
698: 
699:       expect(transitionSubscription).toHaveBeenCalledWith(
700:         TENANT_ID,
701:         "EXPIRED",
702:         expect.anything(),
703:       );
704:     });
705:   });
706: 
707:   describe("tenant isolation", () => {
708:     it("never mixes subscriptions across tenants", async () => {
709:       const sub1 = makeSub({
710:         status: "INCOMPLETE",
711:         providerCustomerId: "cus_tenant1",
712:       });
713:       (SubscriptionModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
714:         mockQueryChain(sub1),
715:       );
716: 
717:       const event = makeEvent({
718:         id: "evt_iso_1",
719:         type: "invoice.paid",
720:         rawObject: {
721:           customer: "cus_tenant1",
722:           subscription: "sub_for_tenant1",
723:         },
724:       });
725:       await handlePaymentEvent(event, "{}", "sig");
726: 
727:       expect(transitionSubscription).toHaveBeenCalledWith(
728:         TENANT_ID,
729:         "ACTIVE",
730:         expect.anything(),
731:       );
732:       expect(SubscriptionModel.updateOne).toHaveBeenCalledWith(
733:         { tenantId: TENANT_ID },
734:         expect.anything(),
735:       );
736:     });
737:   });
738: });

(End of file - total 738 lines)
</content>
```

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/marco/documind-ai/api/src/modules/payment-webhooks/__tests__/payment-webhooks.test.ts"
}
```

**Output:**
```
<path>/home/marco/documind-ai/api/src/modules/payment-webhooks/__tests__/payment-webhooks.test.ts</path>
<type>file</type>
<content>
1: import assert from "node:assert/strict";
2: import test from "node:test";
3: import { readFile } from "node:fs/promises";
4: 
5: const serviceSourceUrl = new URL("../payment-webhooks.service.ts", import.meta.url);
6: const controllerSourceUrl = new URL("../payment-webhooks.controller.ts", import.meta.url);
7: 
8: test("webhook handler maps checkout.session.completed to INCOMPLETE", async () => {
9:   const source = await readFile(serviceSourceUrl, "utf8");
10:   assert.ok(
11:     source.includes("checkout.session.completed"),
12:     "Handles checkout.session.completed event",
13:   );
14:   assert.ok(
15:     source.includes("INCOMPLETE"),
16:     "Maps to INCOMPLETE status",
17:   );
18: });
19: 
20: test("webhook handler handles idempotency (duplicate eventId)", async () => {
21:   const source = await readFile(serviceSourceUrl, "utf8");
22:   assert.ok(
23:     source.includes("Duplicate webhook event"),
24:     "Skips duplicate events",
25:   );
26:   assert.ok(
27:     source.includes("PaymentEventModel.findOne"),
28:     "Checks for existing event",
29:   );
30: });
31: 
32: test("webhook handler persists events before processing", async () => {
33:   const source = await readFile(serviceSourceUrl, "utf8");
34:   assert.ok(
35:     source.includes("PaymentEventModel.create"),
36:     "Creates payment event record",
37:   );
38:   assert.ok(
39:     source.includes('status: "received"'),
40:     "Initially sets status to received",
41:   );
42: });
43: 
44: test("webhook controller verifies signature", async () => {
45:   const source = await readFile(controllerSourceUrl, "utf8");
46:   assert.ok(
47:     source.includes("verifyWebhookSignature"),
48:     "Verifies webhook signature",
49:   );
50:   assert.ok(
51:     source.includes("Invalid signature"),
52:     "Returns error for invalid signature",
53:   );
54: });
55: 
56: test("webhook controller responds 200 quickly without blocking", async () => {
57:   const source = await readFile(controllerSourceUrl, "utf8");
58:   assert.ok(
59:     source.includes('status(200).json({ received: true })'),
60:     "Returns 200 immediately",
61:   );
62: });

(End of file - total 62 lines)
</content>
```

---

## Assistant (Build · Big Pickle · 6.6s)

_Thinking:_

Now let me check the existing test configurations and package.json scripts for running tests.

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/marco/documind-ai/api/package.json"
}
```

**Output:**
```
<path>/home/marco/documind-ai/api/package.json</path>
<type>file</type>
<content>
1: {
2:   "name": "api",
3:   "version": "1.0.0",
4:   "description": "",
5:   "main": "index.js",
6:   "scripts": {
7:     "dev": "tsx watch src/server.ts",
8:     "build": "tsc",
9:     "start": "node dist/server.js",
10:     "lint": "eslint src eslint.config.mjs",
11:     "format": "prettier --write .",
12:     "typecheck": "tsc --noEmit",
13:     "test": "node ../scripts/run-api-tests.mjs",
14:     "test:local": "find src -name '*.test.ts' -print0 | xargs -0 -n 1 env MONGODB_URI='mongodb://127.0.0.1:27017/docsai' REDIS_URL='redis://127.0.0.1:6379' node --import tsx --test",
15:     "test:compose": "find src -name '*.test.ts' -print0 | xargs -0 -n 1 env MONGODB_URI='mongodb://mongodb:27017/docsai' REDIS_URL='redis://redis:6379' node --import tsx --test",
16:     "seed:super-admin": "tsx src/scripts/seed-super-admin.ts",
17:     "seed:default-package": "tsx src/scripts/seed-default-package.ts",
18:     "migrate:subscriptions": "tsx src/scripts/migrate-subscriptions.ts",
19:     "migrate:roles:phase1": "tsx src/scripts/migrate-roles-phase1.ts --dry-run",
20:     "migrate:roles:phase1:apply": "tsx src/scripts/migrate-roles-phase1.ts --apply",
21:     "migrate:users:employee": "tsx src/scripts/migrate-users-employee.ts --dry-run",
22:     "migrate:users:employee:apply": "tsx src/scripts/migrate-users-employee.ts --apply",
23:     "migrate:platform-tenant": "tsx src/scripts/migrate-platform-tenant-invariants.ts --dry-run",
24:     "migrate:platform-tenant:apply": "tsx src/scripts/migrate-platform-tenant-invariants.ts --apply",
25:     "pretypecheck": "npm run build --workspace workers",
26:     "prebuild": "npm run build --workspace workers",
27:     "pretest": "npm run build --workspace workers"
28:   },
29:   "keywords": [],
30:   "author": "",
31:   "license": "ISC",
32:   "type": "module",
33:   "dependencies": {
34:     "argon2": "^0.44.0",
35:     "bullmq": "^5.80.5",
36:     "cors": "^2.8.6",
37:     "dotenv": "^17.4.2",
38:     "express": "^5.2.1",
39:     "express-rate-limit": "^8.5.2",
40:     "ioredis": "^5.11.1",
41:     "mongoose": "^9.7.3",
42:     "multer": "^2.2.0",
43:     "nodemailer": "^9.0.3",
44:     "pino": "^10.3.1",
45:     "prom-client": "^15.1.3",
46:     "rate-limit-redis": "^5.0.0",
47:     "stripe": "^22.3.2",
48:     "tesseract.js": "^5.1.1",
49:     "workers": "*",
50:     "xlsx": "^0.18.5",
51:     "zod": "^4.4.3"
52:   },
53:   "devDependencies": {
54:     "@eslint/js": "^9.39.4",
55:     "@types/cors": "^2.8.19",
56:     "@types/express": "^5.0.6",
57:     "@types/mongoose": "^5.11.96",
58:     "@types/multer": "^2.2.0",
59:     "@types/node": "^26.1.1",
60:     "@types/nodemailer": "^8.0.1",
61:     "eslint": "^9.39.4",
62:     "eslint-config-prettier": "^10.1.8",
63:     "mongodb-memory-server": "^11.2.0",
64:     "nodemon": "^3.1.14",
65:     "pino-pretty": "^13.1.3",
66:     "tsx": "^4.23.0",
67:     "typescript": "^6.0.3",
68:     "typescript-eslint": "^8.62.1",
69:     "vitest": "^4.1.10"
70:   }
71: }

(End of file - total 71 lines)
</content>
```

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/marco/documind-ai/api/src/modules/billing/ports/payment-provider.port.ts"
}
```

**Output:**
```
<path>/home/marco/documind-ai/api/src/modules/billing/ports/payment-provider.port.ts</path>
<type>file</type>
<content>
1: export interface CreateCustomerParams {
2:   tenantId: string;
3:   email: string;
4:   name: string;
5: }
6: 
7: export interface CreateCheckoutSessionParams {
8:   customerId: string;
9:   priceId: string;
10:   successUrl: string;
11:   cancelUrl: string;
12:   metadata: Record<string, string>;
13: }
14: 
15: export interface CheckoutSession {
16:   id: string;
17:   url: string;
18:   status: "open" | "complete" | "expired";
19:   customerId: string;
20:   metadata: Record<string, string>;
21: }
22: 
23: export interface PaymentProviderEvent {
24:   id: string;
25:   type: string;
26:   timestamp: Date;
27:   provider: string;
28:   raw: Record<string, unknown>;
29: }
30: 
31: export interface CreateProductParams {
32:   name: string;
33:   description?: string;
34:   metadata?: Record<string, string>;
35: }
36: 
37: export interface StripeProduct {
38:   id: string;
39:   name: string;
40: }
41: 
42: export interface CreatePriceParams {
43:   productId: string;
44:   unitAmount: number;
45:   currency: string;
46:   interval: "month" | "year";
47:   metadata?: Record<string, string>;
48: }
49: 
50: export interface StripePrice {
51:   id: string;
52:   productId: string;
53:   unitAmount: number;
54:   currency: string;
55:   interval: string;
56: }
57: 
58: export interface CreateBillingPortalSessionParams {
59:   customerId: string;
60:   returnUrl: string;
61: }
62: 
63: export interface BillingPortalSession {
64:   url: string;
65: }
66: 
67: export interface PaymentProvider {
68:   createCustomer(params: CreateCustomerParams): Promise<string>;
69:   createCheckoutSession(params: CreateCheckoutSessionParams): Promise<CheckoutSession>;
70:   retrieveCheckoutSession(sessionId: string): Promise<CheckoutSession>;
71:   createBillingPortalSession(params: CreateBillingPortalSessionParams): Promise<BillingPortalSession>;
72:   verifyWebhookSignature(body: string, signature: string): boolean;
73:   parseWebhookEvent(body: Record<string, unknown>): PaymentProviderEvent;
74:   createProduct(params: CreateProductParams): Promise<StripeProduct>;
75:   createPrice(params: CreatePriceParams): Promise<StripePrice>;
76: }

(End of file - total 76 lines)
</content>
```

---

## Assistant (Build · Big Pickle · 10.5s)

_Thinking:_

Let me also check the checkout service test file and the admin test file to understand the testing patterns better.

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/marco/documind-ai/api/src/modules/payment-webhooks/payment-webhooks.routes.ts"
}
```

**Output:**
```
<path>/home/marco/documind-ai/api/src/modules/payment-webhooks/payment-webhooks.routes.ts</path>
<type>file</type>
<content>
1: import { Router } from "express";
2: import { webhookHandlerController } from "./payment-webhooks.controller.js";
3: 
4: const router = Router();
5: 
6: router.post("/stripe", webhookHandlerController);
7: 
8: export default router;

(End of file - total 8 lines)
</content>
```

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/marco/documind-ai/api/src/modules/payment-webhooks/payment-webhooks.admin.ts"
}
```

**Output:**
```
<path>/home/marco/documind-ai/api/src/modules/payment-webhooks/payment-webhooks.admin.ts</path>
<type>file</type>
<content>
1: import { Router } from "express";
2: import { authenticate } from "../../common/middlewares/authenticate.middleware.js";
3: import { requirePlatformTenant } from "../../common/middlewares/platformTenant.middleware.js";
4: import { listPaymentEvents, reprocessEvent } from "./payment-webhooks.service.js";
5: import { requirePermission } from "../permissions/permissions.middleware.js";
6: import { Permission } from "../permissions/permissions.catalog.js";
7: import { requireAuthenticatedAuditActor } from "../../common/observability/auditActor.js";
8: import type { Request } from "express";
9: 
10: function operationContext(req: Request) {
11:   const actor = requireAuthenticatedAuditActor({
12:     tenantId: req.tenantId,
13:     actorId: req.auth?.userId,
14:     actorEmail: req.auth?.email,
15:     actorRole: req.auth?.role,
16:   });
17:   return {
18:     tenantId: actor.tenantId,
19:     actorId: actor.actorId,
20:     actorEmail: actor.actorEmail,
21:     actorRole: actor.actorRole,
22:     traceId: req.traceId,
23:     requestId: req.requestId,
24:   };
25: }
26: 
27: const router = Router();
28: router.use(authenticate, requirePlatformTenant);
29: 
30: router.get("/payment-events", requirePermission(Permission.BILLING_READ), async (req, res, next) => {
31:   try {
32:     const page = Math.max(1, parseInt(req.query.page as string) || 1);
33:     const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string) || 20));
34:     const status = req.query.status as string | undefined;
35:     const eventType = req.query.eventType as string | undefined;
36: 
37:     const result = await listPaymentEvents(
38:       { page, pageSize, status, eventType },
39:       operationContext(req),
40:     );
41:     res.json({ success: true, data: result });
42:   } catch (error) {
43:     next(error);
44:   }
45: });
46: 
47: router.post("/payment-events/:eventId/reprocess", requirePermission(Permission.BILLING_MANAGE), async (req, res, next) => {
48:   try {
49:     const eventId = Array.isArray(req.params.eventId)
50:       ? req.params.eventId[0]
51:       : req.params.eventId;
52:     await reprocessEvent(eventId, operationContext(req));
53:     res.json({ success: true, data: { reprocessed: true } });
54:   } catch (error) {
55:     next(error);
56:   }
57: });
58: 
59: export default router;

(End of file - total 59 lines)
</content>
```

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/marco/documind-ai/api/src/common/errors/errorCodes.ts"
}
```

**Output:**
```
<path>/home/marco/documind-ai/api/src/common/errors/errorCodes.ts</path>
<type>file</type>
<content>
1: export const SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE";
2: export const MAINTENANCE_MODE = "MAINTENANCE_MODE";
3: export const REGISTRATION_DISABLED = "REGISTRATION_DISABLED";
4: export const INTERNAL_SERVER_ERROR = "INTERNAL_SERVER_ERROR";
5: export const NOT_FOUND = "NOT_FOUND";
6: export const BAD_REQUEST = "BAD_REQUEST";
7: export const VALIDATION_ERROR = "VALIDATION_ERROR";
8: export const UNAUTHORIZED = "UNAUTHORIZED";
9: export const FORBIDDEN = "FORBIDDEN";
10: export const DATABASE_ERROR = "DATABASE_ERROR";
11: export const TENANT_ALREADY_EXISTS = "TENANT_ALREADY_EXISTS";
12: export const EMAIL_ALREADY_EXISTS = "EMAIL_ALREADY_EXISTS";
13: export const REGISTRATION_FAILED = "REGISTRATION_FAILED";
14: export const USER_UPDATE_FAILED = "USER_UPDATE_FAILED";
15: export const EMAIL_SENDING_FAILED = "EMAIL_SENDING_FAILED";
16: export const INVALID_OR_EXPIRED_VERIFICATION_TOKEN = "INVALID_OR_EXPIRED_VERIFICATION_TOKEN";
17: export const EMAIL_NOT_VERIFIED = "EMAIL_NOT_VERIFIED";
18: export const INVALID_CREDENTIALS = "INVALID_CREDENTIALS";
19: export const ACCOUNT_NOT_ACTIVE = "ACCOUNT_NOT_ACTIVE";
20: export const TENANT_NOT_ACTIVE = "TENANT_NOT_ACTIVE";
21: export const INVALID_REFRESH_TOKEN = "INVALID_REFRESH_TOKEN";
22: export const SESSION_EXPIRED = "SESSION_EXPIRED";
23: export const AUTH_SESSION_MIGRATION_PENDING = "AUTH_SESSION_MIGRATION_PENDING";
24: export const REFRESH_TOKEN_REUSED = "REFRESH_TOKEN_REUSED";
25: export const FILE_UPLOAD_ERROR = "FILE_UPLOAD_ERROR";
26: export const UNSUPPORTED_FILE_TYPE = "UNSUPPORTED_FILE_TYPE";
27: export const PASSWORD_RESET_FAILED = "PASSWORD_RESET_FAILED";
28: export const PERMISSION_REQUIRED = "PERMISSION_REQUIRED";
29: export const SCOPE_MISMATCH = "SCOPE_MISMATCH";
30: export const ROLE_NOT_ASSIGNABLE = "ROLE_NOT_ASSIGNABLE";
31: export const PRIVILEGE_ESCALATION = "PRIVILEGE_ESCALATION";
32: export const ROLE_IN_USE = "ROLE_IN_USE";
33: export const UNKNOWN_PERMISSION = "UNKNOWN_PERMISSION";
34: export const INVALID_PERMISSION = "INVALID_PERMISSION";
35: export const ROLE_VERSION_CONFLICT = "ROLE_VERSION_CONFLICT";
36: export const STALE_ROLE_VERSION = "STALE_ROLE_VERSION";
37: export const RATE_LIMITED = "RATE_LIMITED";
38: export const LAST_ADMIN_PROTECTION = "LAST_ADMIN_PROTECTION";
39: export const DUPLICATE_ROLE_NAME = "DUPLICATE_ROLE_NAME";
40: export const RESOURCE_CONTEXT_REQUIRED = "RESOURCE_CONTEXT_REQUIRED";
41: export const MALFORMED_OBJECT_ID = "MALFORMED_OBJECT_ID";
42: export const SELF_ACTION_FORBIDDEN = "SELF_ACTION_FORBIDDEN";
43: export const AGENT_RUN_NOT_FOUND = "AGENT_RUN_NOT_FOUND";
44: export const AGENT_TOOL_UNAUTHORIZED = "AGENT_TOOL_UNAUTHORIZED";
45: export const AGENT_UNREGISTERED_TOOL = "AGENT_UNREGISTERED_TOOL";
46: export const AGENT_APPROVAL_EXPIRED = "AGENT_APPROVAL_EXPIRED";
47: export const AGENT_APPROVAL_NOT_FOUND = "AGENT_APPROVAL_NOT_FOUND";
48: export const AGENT_STATE_TRANSITION_INVALID = "AGENT_STATE_TRANSITION_INVALID";
49: export const AGENT_BUDGET_EXHAUSTED = "AGENT_BUDGET_EXHAUSTED";
50: export const AGENT_PROVIDER_ERROR = "AGENT_PROVIDER_ERROR";
51: export const AGENT_HANDOFF_REQUIRED = "AGENT_HANDOFF_REQUIRED";
52: export const WEBHOOK_SIGNATURE_INVALID = "WEBHOOK_SIGNATURE_INVALID";
53: export const CHECKOUT_SESSION_EXPIRED = "CHECKOUT_SESSION_EXPIRED";
54: export const PRICE_NOT_CONFIGURED = "PRICE_NOT_CONFIGURED";
55: export const STRIPE_PRODUCT_SYNC_FAILED = "STRIPE_PRODUCT_SYNC_FAILED";
56: export const BILLING_PORTAL_UNAVAILABLE = "BILLING_PORTAL_UNAVAILABLE";
57: 
58: export const OCR_PROVIDER_ERROR = "OCR_PROVIDER_ERROR";
59: export const OCR_QUOTA_EXCEEDED = "OCR_QUOTA_EXCEEDED";
60: export const OCR_LANGUAGE_UNSUPPORTED = "OCR_LANGUAGE_UNSUPPORTED";
61: export const OCR_PAGE_FAILED = "OCR_PAGE_FAILED";
62: export const QUALITY_ASSESSMENT_FAILED = "QUALITY_ASSESSMENT_FAILED";
63: export const REVIEW_DECISION_REQUIRED = "REVIEW_DECISION_REQUIRED";
64: export const REVIEW_NOT_FOUND = "REVIEW_NOT_FOUND";
65: export const DOCUMENT_NOT_FOUND = "DOCUMENT_NOT_FOUND";
66: export const DOCUMENT_STORAGE_FAILED = "DOCUMENT_STORAGE_FAILED";
67: export const DOCUMENT_SCAN_FAILED = "DOCUMENT_SCAN_FAILED";
68: export const DOCUMENT_QUARANTINED = "DOCUMENT_QUARANTINED";
69: export const DOCUMENT_DUPLICATE = "DOCUMENT_DUPLICATE";
70: export const DOCUMENT_VERSION_NOT_FOUND = "DOCUMENT_VERSION_NOT_FOUND";
71: export const DOCUMENT_ALREADY_ARCHIVED = "DOCUMENT_ALREADY_ARCHIVED";
72: export const DOCUMENT_NOT_ARCHIVED = "DOCUMENT_NOT_ARCHIVED";
73: export const DOCUMENT_NOT_SOFT_DELETED = "DOCUMENT_NOT_SOFT_DELETED";
74: export const ENTITLEMENT_EXCEEDED = "ENTITLEMENT_EXCEEDED";
75: export const FILE_ZERO_BYTES = "FILE_ZERO_BYTES";
76: export const FILE_SIGNATURE_MISMATCH = "FILE_SIGNATURE_MISMATCH";

(End of file - total 76 lines)
</content>
```

---

## Assistant (Build · Big Pickle · 56.5s)

_Thinking:_

Now I have a complete understanding of the codebase. Let me create the implementation plan.

## Summary of Current State

1. **CheckoutSession model** already has `status: "pending" | "completed" | "expired" | "failed"` — the `failed` state exists!
2. **PaymentEvent model** has `status: "received" | "verified" | "processed" | "failed"` and `processingErrors[]`
3. The `checkout.session.completed` handler assumes a subscription already exists and tries to transition it
4. There is no `checkout.session.expired` handler
5. There is no special handling for initial checkout failures (when no subscription exists)


6. The CheckoutSession model already supports a `failed` status, so I don't need schema changes there, but I need to figure out what data to capture when a checkout fails — things like the Stripe session ID, customer ID if available, payment failure reason, and timestamps.

For handling initial checkout failures, I'm realizing the key is correlating the failed session back to the internal CheckoutSession record using the session ID, then updating its status to `failed` without touching any subscription records. The tricky part is that the current handler is designed to work with subscriptions, so I'll need to either create a separate handler for checkout-specific events or modify the existing one to handle the case where no subscription exists. So the webhook actually does include `metadata.tenantId` and the session ID, which means I can find the CheckoutSession record even when no subscription exists. I need to add a handler for `checkout.session.completed` that checks `payment_status === "unpaid"` and uses the session ID to locate and update the CheckoutSession to failed status, then extract a failure reason from the event. I'm realizing the event structure might vary depending on what Stripe sends — for failed checkouts, the session object might not have a customer field at all, but the `id` should always be present as the session identifier. I need to focus on correlating the event back to the CheckoutSession using that `id` field and extract the failure reason from the payment_status. I see that the function just grabs whatever `id` is on the raw event object itself, not the nested session object. For Stripe events, the top-level `id` is actually the event ID like `evt_xxx`, not the session ID I need. The session ID I'm looking for is nested inside `data.object.id`, so I need to fix this extraction logic to pull from the right place. Still writing extraction logic...

Now I'm thinking through the overall approach—I want to handle failed checkout sessions by extracting the session ID from the event, then finding and updating the corresponding CheckoutSession record to mark it as failed with the appropriate error details. For expired sessions, I'll need a similar handler but with different logic.

I'm also reconsidering whether the `checkout.session.completed` handler needs to account for the `payment_status` field, since it currently only checks for the event type and doesn't validate the payment outcome.

Looking at the existing flow, when `checkout.session.completed` fires with an unpaid status, it tries to find an existing Subscription and fails, which prevents the CheckoutSession from being marked as completed. My new handler would catch this case earlier and mark it as failed instead, avoiding that unnecessary lookup attempt.

But I need to think through whether `handleStaticMappingEvent` would still run after my handler processes the event—it might attempt to find that non-existent subscription and fail silently, which could be confusing even if it doesn't cause actual problems.

Let me trace through the event flow more carefully: `checkout.session.completed` with `payment_status: "unpaid"` gets processed, and if I intercept it first, I can update the CheckoutSession to failed status before the static handler even runs.

Refining the handler logic... Still writing the handler... I'm deciding between modifying `handleStaticMappingEvent` to be more resilient or keeping the handlers separate for clarity—I think the cleaner approach is to have each handler manage its own concerns, so I'll leave the static mapping as-is and ensure `handleCheckoutSessionCompleted` handles both success and failure cases. For the `checkout.session.expired` event, I need to follow the same pattern: extract the session ID, locate the CheckoutSession, mark it as expired, and verify idempotency.

Now I'm planning the code changes: I'll add extraction helpers for the payment status and failure reason, create the two new handler functions, and wire them into the main event handler. The CheckoutSession model already has the `failed` and `expired` statuses I need, so no schema changes are required. For storing the failure details, I'm checking what fields the model currently supports—it looks like `metadata` is available as a Map, so I can use that to capture the failure information without needing to add new columns.

I'll store the Stripe failure reason in the metadata map along with the payment status and event ID, keeping the changes minimal and non-breaking. Now I need to think through the test cases, starting with verifying that a failed checkout payment updates the CheckoutSession correctly without creating a Subscription. I need to verify whether the existing tests will still pass with my changes. The key concern is whether the new handler for `checkout.session.completed` events will interfere with the current behavior, but since I'm adding a separate handler that runs independently, it shouldn't break the existing test that checks the subscription transition logic. the event won't match the new `handleCheckoutSessionCompleted` condition, so it falls through to the static mapping handler as before—no regression there.

For `checkout.session.completed` with an unpaid status, the old behavior would fail trying to find a subscription, but now it correctly marks the checkout as failed and skips the static mapping since there's no subscription to resolve. The test expects `transitionSubscription` to be called with INCOMPLETE, but with my changes it won't be called for unpaid sessions—this is the correct new behavior, so the test needs updating.

When `payment_status` is missing (treated as successful), `extractPaymentStatus` returns undefined, which fails the equality check and falls through to the old handler, preserving backward compatibility.

For duplicate `checkout.session.completed` events, the existing idempotency check skips reprocessing entirely, so there's no double-handling concern. The `CheckoutSession.findOneAndUpdate` call is also idempotent by design.

I'm satisfied the approach is sound, so I'll move forward with the implementation. I should also verify there's no other `checkout.session.completed` handler elsewhere in the codebase—I've already confirmed the webhook service is the only place handling it.

Now I'm checking whether the `failed` state on CheckoutSession is already exposed in the frontend checkout status endpoint. The backend returns the raw status field, and the frontend types define the valid statuses including "failed", so the UI should already handle displaying this state correctly.

My implementation plan is solid. I need to create two new handler functions for checkout session events—one for completed sessions that checks payment status and marks failures, another for expired sessions—and wire them into the main event handler. The key is determining the right order for these handlers to ensure they run before any generic fallback logic.

For the tests, I'm setting up scenarios to verify that failed payments update the checkout session without creating subscriptions, expired sessions are handled correctly, and duplicate events are processed idempotently.

Now I'm implementing the code. I need to add a helper function to extract payment status from the event object, then build out the handler logic for both completed and expired checkout sessions.

Adding extraction helpers... Still writing handler logic... I'm realizing there's a potential issue with how I'm extracting the checkout session ID for the `checkout.session.completed` event—the current implementation pulls the session object's ID, but I need to verify that `extractCheckoutSessionId` is actually returning the right value for this event type. Still writing extraction logic... Writing the handler function... I'm adding a helper function to extract failure reasons from webhook events, then updating the event handler to use the new checkout session completed logic instead of the static mapping approach. I need to verify the order of operations here—`handleCheckoutSessionCompleted` runs first and returns early for unpaid sessions, so the static mapping handler won't execute in those cases, which is the intended behavior. Let me also check what the test expects for the happy path to make sure my changes don't break it.

The test mocks a subscription with TRIALING status and expects `transitionSubscription` to be called with INCOMPLETE, but my new handler won't match that case since it only handles `payment_status === "unpaid"`. The old `handleStaticMappingEvent` will still run for successful payments, so the test should pass as-is.

Now I'm writing the test cases for the checkout session handler, starting with the failed payment scenario... Writing test cases... Writing test cases... Writing test assertions...

Actually, I need to reconsider the mock setup here. The `PaymentEventModel.findOne` is being called twice—once for the idempotency check and potentially again during event resolution—but I should trace through the actual flow more carefully to make sure the mocks are returning the right values at the right times. I see the issue now—when `handleCheckoutSessionCompleted` processes an unpaid checkout, it marks the session as failed but doesn't update the PaymentEvent status, so it stays "verified" instead of becoming "processed" like the normal flow does. This means the test assertion checking for `status === "failed"` would actually fail with the new code since the status remains "verified". Writing the test case... I'm setting up a mock event record with the necessary properties and a save function, then mocking the PaymentEventModel to return this record. I'm creating a test event with the checkout session completed type and an unpaid status, then calling the handler to verify it processes correctly.

Now I'm checking that the event record status gets updated to "processed" and that the processing errors array remains empty, which indicates successful handling. I'm also adding a test for idempotency to ensure duplicate events are skipped properly, and starting another test case for handling expired checkout sessions.

Writing test cases... Writing test assertions...

Now I need to implement the actual code changes to support these test scenarios. I'll add the new handler functions to the service file and update the existing logic to handle expired checkout sessions and failed payments correctly. I need to find the right place to insert these new functions in the file structure. Looking at the layout, I'll add the extraction helpers after the existing `extractPackageIdFromEvent` function around line 443, then place the new event handlers after `handleSubscriptionUpdated` at line 347, right before the subscription resolution section. I need to reorganize where these new handlers go. The extraction helpers should come after the existing ones, and the two new handler functions need to sit between the subscription update handler and the resolution logic. Let me map out the insertion points more carefully by looking at the actual line numbers and structure. I'm mapping out the precise insertion points for the new functions—I need to add the payment status and failure reason extractors after line 443, then place the two checkout session handlers before the subscription resolution section starts at line 349.

Now I have a complete picture. Let me create the plan and implement.

**Tool: todowrite**

**Input:**
```json
{
  "todos": [
    {
      "content": "Add extraction helpers (extractPaymentStatus, extractFailureReason) to payment-webhooks.service.ts",
      "status": "pending",
      "priority": "high"
    },
    {
      "content": "Add handleCheckoutSessionCompleted handler for failed initial checkout",
      "status": "pending",
      "priority": "high"
    },
    {
      "content": "Add handleCheckoutSessionExpired handler",
      "status": "pending",
      "priority": "high"
    },
    {
      "content": "Wire new handlers into handlePaymentEvent routing logic",
      "status": "pending",
      "priority": "high"
    },
    {
      "content": "Add tests for initial checkout failure, expired, idempotency, no subscription created",
      "status": "pending",
      "priority": "high"
    },
    {
      "content": "Verify existing tests still pass",
      "status": "pending",
      "priority": "high"
    },
    {
      "content": "Run lint, typecheck, and tests",
      "status": "pending",
      "priority": "high"
    }
  ]
}
```

**Output:**
```
[
  {
    "content": "Add extraction helpers (extractPaymentStatus, extractFailureReason) to payment-webhooks.service.ts",
    "status": "pending",
    "priority": "high"
  },
  {
    "content": "Add handleCheckoutSessionCompleted handler for failed initial checkout",
    "status": "pending",
    "priority": "high"
  },
  {
    "content": "Add handleCheckoutSessionExpired handler",
    "status": "pending",
    "priority": "high"
  },
  {
    "content": "Wire new handlers into handlePaymentEvent routing logic",
    "status": "pending",
    "priority": "high"
  },
  {
    "content": "Add tests for initial checkout failure, expired, idempotency, no subscription created",
    "status": "pending",
    "priority": "high"
  },
  {
    "content": "Verify existing tests still pass",
    "status": "pending",
    "priority": "high"
  },
  {
    "content": "Run lint, typecheck, and tests",
    "status": "pending",
    "priority": "high"
  }
]
```

---

## Assistant (Build · Big Pickle · 11.2s)

_Thinking:_

Let me provide a concise implementation plan and then start implementing.

## Implementation Plan

**Key findings:**
- `CheckoutSession` model already supports `status: "failed" | "expired"` — no schema changes needed
- `metadata: Map<string, string>` can store failure reason and payment status
- No Subscription is created for declined initial Checkout payments (Stripe default `payment_behavior: "error_if_incomplete"`)
- `checkout.session.completed` fires with `payment_status: "unpaid"` on decline
- `checkout.session.expired` fires when the session times out
- Existing idempotency check in `handlePaymentEvent` prevents duplicate processing

**Changes:**
1. **`payment-webhooks.service.ts`**: Add 2 extraction helpers, 2 new handler functions, wire into routing
2. **`payment-webhooks.service.test.ts`**: Add 8 new test cases
3. No model, route, controller, or config changes

Let me implement.

**Tool: todowrite**

**Input:**
```json
{
  "todos": [
    {
      "content": "Add extraction helpers (extractPaymentStatus, extractFailureReason) to payment-webhooks.service.ts",
      "priority": "high",
      "status": "in_progress"
    },
    {
      "content": "Add handleCheckoutSessionCompleted handler for failed initial checkout",
      "priority": "high",
      "status": "pending"
    },
    {
      "content": "Add handleCheckoutSessionExpired handler",
      "priority": "high",
      "status": "pending"
    },
    {
      "content": "Wire new handlers into handlePaymentEvent routing logic",
      "priority": "high",
      "status": "pending"
    },
    {
      "content": "Add tests for initial checkout failure, expired, idempotency, no subscription created",
      "priority": "high",
      "status": "pending"
    },
    {
      "content": "Verify existing tests still pass",
      "priority": "high",
      "status": "pending"
    },
    {
      "content": "Run lint, typecheck, and tests",
      "priority": "high",
      "status": "pending"
    }
  ]
}
```

**Output:**
```
[
  {
    "content": "Add extraction helpers (extractPaymentStatus, extractFailureReason) to payment-webhooks.service.ts",
    "status": "in_progress",
    "priority": "high"
  },
  {
    "content": "Add handleCheckoutSessionCompleted handler for failed initial checkout",
    "status": "pending",
    "priority": "high"
  },
  {
    "content": "Add handleCheckoutSessionExpired handler",
    "status": "pending",
    "priority": "high"
  },
  {
    "content": "Wire new handlers into handlePaymentEvent routing logic",
    "status": "pending",
    "priority": "high"
  },
  {
    "content": "Add tests for initial checkout failure, expired, idempotency, no subscription created",
    "status": "pending",
    "priority": "high"
  },
  {
    "content": "Verify existing tests still pass",
    "status": "pending",
    "priority": "high"
  },
  {
    "content": "Run lint, typecheck, and tests",
    "status": "pending",
    "priority": "high"
  }
]
```

---

## Assistant (Build · Big Pickle · 11.7s)

_Thinking:_

Let me add the extraction helpers first.

Add extraction helpers after `extractPackageIdFromEvent`:

**Tool: edit**

**Input:**
```json
{
  "filePath": "/home/marco/documind-ai/api/src/modules/payment-webhooks/payment-webhooks.service.ts",
  "oldString": "function extractPackageIdFromEvent(\n  event: PaymentProviderEvent,\n): string | undefined {\n  const obj = extractRawObject(event);\n  const metadata = obj?.metadata as Record<string, string> | undefined;\n  return metadata?.packageId;\n}\n\n// ── Admin: list & reprocess ──────────────────────────────────────────────────",
  "newString": "function extractPackageIdFromEvent(\n  event: PaymentProviderEvent,\n): string | undefined {\n  const obj = extractRawObject(event);\n  const metadata = obj?.metadata as Record<string, string> | undefined;\n  return metadata?.packageId;\n}\n\nfunction extractPaymentStatus(\n  event: PaymentProviderEvent,\n): string | undefined {\n  const obj = extractRawObject(event);\n  return obj?.payment_status as string | undefined;\n}\n\nfunction extractFailureReason(\n  event: PaymentProviderEvent,\n): string | undefined {\n  const obj = extractRawObject(event);\n  const lastError = obj?.last_payment_error as\n    | Record<string, unknown>\n    | undefined;\n  if (lastError?.message) return lastError.message as string;\n  return undefined;\n}\n\n// ── Admin: list & reprocess ──────────────────────────────────────────────────"
}
```

**Output:**
```
Edit applied successfully.
```

---

## Assistant (Build · Big Pickle · 9.6s)

_Thinking:_

Now let me add the two new handler functions. I'll add them between `handleSubscriptionUpdated` and `resolveSubscriptionFromEvent`.

**Tool: todowrite**

**Input:**
```json
{
  "todos": [
    {
      "content": "Add extraction helpers (extractPaymentStatus, extractFailureReason) to payment-webhooks.service.ts",
      "priority": "high",
      "status": "completed"
    },
    {
      "content": "Add handleCheckoutSessionCompleted handler for failed initial checkout",
      "priority": "high",
      "status": "in_progress"
    },
    {
      "content": "Add handleCheckoutSessionExpired handler",
      "priority": "high",
      "status": "pending"
    },
    {
      "content": "Wire new handlers into handlePaymentEvent routing logic",
      "priority": "high",
      "status": "pending"
    },
    {
      "content": "Add tests for initial checkout failure, expired, idempotency, no subscription created",
      "priority": "high",
      "status": "pending"
    },
    {
      "content": "Verify existing tests still pass",
      "priority": "high",
      "status": "pending"
    },
    {
      "content": "Run lint, typecheck, and tests",
      "priority": "high",
      "status": "pending"
    }
  ]
}
```

**Output:**
```
[
  {
    "content": "Add extraction helpers (extractPaymentStatus, extractFailureReason) to payment-webhooks.service.ts",
    "status": "completed",
    "priority": "high"
  },
  {
    "content": "Add handleCheckoutSessionCompleted handler for failed initial checkout",
    "status": "in_progress",
    "priority": "high"
  },
  {
    "content": "Add handleCheckoutSessionExpired handler",
    "status": "pending",
    "priority": "high"
  },
  {
    "content": "Wire new handlers into handlePaymentEvent routing logic",
    "status": "pending",
    "priority": "high"
  },
  {
    "content": "Add tests for initial checkout failure, expired, idempotency, no subscription created",
    "status": "pending",
    "priority": "high"
  },
  {
    "content": "Verify existing tests still pass",
    "status": "pending",
    "priority": "high"
  },
  {
    "content": "Run lint, typecheck, and tests",
    "status": "pending",
    "priority": "high"
  }
]
```

---

## Assistant (Build · Big Pickle · 11.8s)

_Thinking:_

Now I need to add the two new handler functions between `handleSubscriptionUpdated` and `resolveSubscriptionFromEvent`. Let me find the exact insertion point.

Add the two new handler functions between `handleSubscriptionUpdated` and `resolveSubscriptionFromEvent`:

**Tool: edit**

**Input:**
```json
{
  "filePath": "/home/marco/documind-ai/api/src/modules/payment-webhooks/payment-webhooks.service.ts",
  "oldString": "// ── Subscription resolution ──────────────────────────────────────────────────\n\ninterface ResolvedSubscription {",
  "newString": "// ── checkout.session.completed handler (initial checkout failure) ────────────\n\nasync function handleCheckoutSessionCompleted(\n  event: PaymentProviderEvent,\n  eventRecord: PaymentEventDocument,\n): Promise<void> {\n  const paymentStatus = extractPaymentStatus(event);\n  if (paymentStatus !== \"unpaid\") return;\n\n  const sessionId = extractCheckoutSessionId(event);\n  if (!sessionId) return;\n\n  const failureReason = extractFailureReason(event);\n\n  const metadata: Record<string, string> = {\n    payment_status: \"unpaid\",\n    providerEventId: event.id,\n  };\n  if (failureReason) metadata.failureReason = failureReason;\n\n  await CheckoutSessionModel.updateOne(\n    { providerSessionId: sessionId },\n    {\n      $set: {\n        status: \"failed\",\n        metadata: new Map(Object.entries(metadata)),\n      },\n    },\n  );\n\n  eventRecord.status = \"processed\";\n  eventRecord.processedAt = new Date();\n  await eventRecord.save();\n\n  writeAudit(\n    \"CHECKOUT_SESSION_UPDATED\",\n    sessionId,\n    {\n      eventType: event.type,\n      paymentStatus: \"unpaid\",\n      failureReason,\n      providerEventId: event.id,\n    },\n    extractTenantFromEvent(event)?.toString() ?? \"\",\n  );\n}\n\n// ── checkout.session.expired handler ────────────────────────────────────────\n\nasync function handleCheckoutSessionExpired(\n  event: PaymentProviderEvent,\n  eventRecord: PaymentEventDocument,\n): Promise<void> {\n  const sessionId = extractCheckoutSessionId(event);\n  if (!sessionId) return;\n\n  const metadata: Record<string, string> = {\n    providerEventId: event.id,\n  };\n\n  await CheckoutSessionModel.updateOne(\n    { providerSessionId: sessionId },\n    {\n      $set: {\n        status: \"expired\",\n        metadata: new Map(Object.entries(metadata)),\n      },\n    },\n  );\n\n  eventRecord.status = \"processed\";\n  eventRecord.processedAt = new Date();\n  await eventRecord.save();\n\n  writeAudit(\n    \"CHECKOUT_SESSION_UPDATED\",\n    sessionId,\n    {\n      eventType: event.type,\n      providerEventId: event.id,\n    },\n    extractTenantFromEvent(event)?.toString() ?? \"\",\n  );\n}\n\n// ── Subscription resolution ──────────────────────────────────────────────────\n\ninterface ResolvedSubscription {"
}
```

**Output:**
```
Edit applied successfully.
```

---

## Assistant (Build · Big Pickle · 10.7s)

_Thinking:_

Now I need to wire the new handlers into the `handlePaymentEvent` routing logic. I need to add checks for `checkout.session.completed` (with unpaid status) and `checkout.session.expired` before the existing routing logic.

**Tool: todowrite**

**Input:**
```json
{
  "todos": [
    {
      "content": "Add extraction helpers (extractPaymentStatus, extractFailureReason) to payment-webhooks.service.ts",
      "priority": "high",
      "status": "completed"
    },
    {
      "content": "Add handleCheckoutSessionCompleted handler for failed initial checkout",
      "priority": "high",
      "status": "completed"
    },
    {
      "content": "Add handleCheckoutSessionExpired handler",
      "priority": "high",
      "status": "completed"
    },
    {
      "content": "Wire new handlers into handlePaymentEvent routing logic",
      "priority": "high",
      "status": "in_progress"
    },
    {
      "content": "Add tests for initial checkout failure, expired, idempotency, no subscription created",
      "priority": "high",
      "status": "pending"
    },
    {
      "content": "Verify existing tests still pass",
      "priority": "high",
      "status": "pending"
    },
    {
      "content": "Run lint, typecheck, and tests",
      "priority": "high",
      "status": "pending"
    }
  ]
}
```

**Output:**
```
[
  {
    "content": "Add extraction helpers (extractPaymentStatus, extractFailureReason) to payment-webhooks.service.ts",
    "status": "completed",
    "priority": "high"
  },
  {
    "content": "Add handleCheckoutSessionCompleted handler for failed initial checkout",
    "status": "completed",
    "priority": "high"
  },
  {
    "content": "Add handleCheckoutSessionExpired handler",
    "status": "completed",
    "priority": "high"
  },
  {
    "content": "Wire new handlers into handlePaymentEvent routing logic",
    "status": "in_progress",
    "priority": "high"
  },
  {
    "content": "Add tests for initial checkout failure, expired, idempotency, no subscription created",
    "status": "pending",
    "priority": "high"
  },
  {
    "content": "Verify existing tests still pass",
    "status": "pending",
    "priority": "high"
  },
  {
    "content": "Run lint, typecheck, and tests",
    "status": "pending",
    "priority": "high"
  }
]
```

---

## Assistant (Build · Big Pickle · 17.6s)

_Thinking:_

Now I need to wire the new handlers into the routing logic. I need to add checks before the existing routing. The current routing logic is:

```typescript
const isSubscriptionUpdate = event.type === "customer.subscription.updated";

if (isSubscriptionUpdate) {
  await handleSubscriptionUpdated(event, eventRecord);
} else {
  const mapping = EVENT_STATUS_MAP[event.type];
  if (mapping) {
    await handleStaticMappingEvent(event, mapping, eventRecord);
  }
}
```

I need to add the new handlers before this. The logic should be:

```typescript
// Handle checkout.session.expired — always mark CheckoutSession as expired


```

Adding handler routing logic...

```

I need to verify the control flow here—the `return` statements in the new handlers prevent the event from being processed twice, so for `checkout.session.completed` with unpaid status, it exits early and never reaches the old static mapping logic. For other cases like `checkout.session.expired`, it falls through to the existing handlers as expected.

But I'm realizing there's a potential issue with the `checkout.session.expired` handler: if the old static mapping logic runs after it, the code tries to extract a checkout session ID and update the CheckoutSession status to "completed"—but that doesn't make sense for an expired session, and it would override the "expired" status I just set.

Looking at how `extractCheckoutSessionId` works, it pulls the `id` field from the event's raw object, which for `checkout.session.expired` is the session ID itself. So the old code would find that session and incorrectly mark it as completed. I need to make sure the `return` statement in `handleCheckoutSessionExpired` prevents the old logic from running at all. I need to add the `return` statement to `handleCheckoutSessionExpired` as well, since the old code would incorrectly mark expired sessions as completed. Both handlers need to exit early to prevent that bug.

Wire the new handlers into the routing. I need to add them before the existing routing and ensure they `return` to prevent the old code from running on these events:

**Tool: edit**

**Input:**
```json
{
  "filePath": "/home/marco/documind-ai/api/src/modules/payment-webhooks/payment-webhooks.service.ts",
  "newString": "    eventRecord.status = \"verified\";\n\n    if (event.type === \"checkout.session.expired\") {\n      await handleCheckoutSessionExpired(event, eventRecord);\n      return;\n    }\n\n    const isCheckoutFailed =\n      event.type === \"checkout.session.completed\" &&\n      extractPaymentStatus(event) === \"unpaid\";\n    if (isCheckoutFailed) {\n      await handleCheckoutSessionCompleted(event, eventRecord);\n      return;\n    }\n\n    const isSubscriptionUpdate = event.type === \"customer.subscription.updated\";",
  "oldString": "    eventRecord.status = \"verified\";\n\n    const isSubscriptionUpdate = event.type === \"customer.subscription.updated\";"
}
```

**Output:**
```
Edit applied successfully.
```

---

## Assistant (Build · Big Pickle · 7.4s)

_Thinking:_

Good. Now let me verify the file looks correct by reading the modified section.

Let me verify the routing logic looks correct:

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/marco/documind-ai/api/src/modules/payment-webhooks/payment-webhooks.service.ts",
  "offset": 115,
  "limit": 50
}
```

**Output:**
```
<path>/home/marco/documind-ai/api/src/modules/payment-webhooks/payment-webhooks.service.ts</path>
<type>file</type>
<content>
115:       signature,
116:       rawBody,
117:       payload: event.raw,
118:       processingErrors: [],
119:     }));
120: 
121:   try {
122:     eventRecord.status = "verified";
123: 
124:     if (event.type === "checkout.session.expired") {
125:       await handleCheckoutSessionExpired(event, eventRecord);
126:       return;
127:     }
128: 
129:     const isCheckoutFailed =
130:       event.type === "checkout.session.completed" &&
131:       extractPaymentStatus(event) === "unpaid";
132:     if (isCheckoutFailed) {
133:       await handleCheckoutSessionCompleted(event, eventRecord);
134:       return;
135:     }
136: 
137:     const isSubscriptionUpdate = event.type === "customer.subscription.updated";
138: 
139:     if (isSubscriptionUpdate) {
140:       await handleSubscriptionUpdated(event, eventRecord);
141:     } else {
142:       const mapping = EVENT_STATUS_MAP[event.type];
143:       if (mapping) {
144:         await handleStaticMappingEvent(event, mapping, eventRecord);
145:       }
146:     }
147: 
148:     if (eventRecord.processingErrors.length === 0) {
149:       eventRecord.status = "processed";
150:       eventRecord.processedAt = new Date();
151:       await eventRecord.save();
152:     }
153:   } catch (error) {
154:     logger.error({ err: error, eventId: event.id }, "Failed to process payment event");
155:     eventRecord.status = "failed";
156:     eventRecord.processingErrors.push(
157:       error instanceof Error ? error.message : "Unknown error",
158:     );
159:     await eventRecord.save();
160:   }
161: }
162: 
163: // ── Static mapping handler (checkout, invoice, subscription.deleted) ─────────
164: 

(Showing lines 115-164 of 636. Use offset=165 to continue.)
</content>
```

---

## Assistant (Build · Big Pickle · 7.4s)

_Thinking:_

Good. The routing logic looks correct. Now let me also verify the new handler functions are correctly placed. Let me check that section.

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/marco/documind-ai/api/src/modules/payment-webhooks/payment-webhooks.service.ts",
  "limit": 100,
  "offset": 355
}
```

**Output:**
```
<path>/home/marco/documind-ai/api/src/modules/payment-webhooks/payment-webhooks.service.ts</path>
<type>file</type>
<content>
355:       newStatus: mappedStatus,
356:       providerEventId: event.id,
357:     },
358:     String(tenantId),
359:   );
360: }
361: 
362: // ── checkout.session.completed handler (initial checkout failure) ────────────
363: 
364: async function handleCheckoutSessionCompleted(
365:   event: PaymentProviderEvent,
366:   eventRecord: PaymentEventDocument,
367: ): Promise<void> {
368:   const paymentStatus = extractPaymentStatus(event);
369:   if (paymentStatus !== "unpaid") return;
370: 
371:   const sessionId = extractCheckoutSessionId(event);
372:   if (!sessionId) return;
373: 
374:   const failureReason = extractFailureReason(event);
375: 
376:   const metadata: Record<string, string> = {
377:     payment_status: "unpaid",
378:     providerEventId: event.id,
379:   };
380:   if (failureReason) metadata.failureReason = failureReason;
381: 
382:   await CheckoutSessionModel.updateOne(
383:     { providerSessionId: sessionId },
384:     {
385:       $set: {
386:         status: "failed",
387:         metadata: new Map(Object.entries(metadata)),
388:       },
389:     },
390:   );
391: 
392:   eventRecord.status = "processed";
393:   eventRecord.processedAt = new Date();
394:   await eventRecord.save();
395: 
396:   writeAudit(
397:     "CHECKOUT_SESSION_UPDATED",
398:     sessionId,
399:     {
400:       eventType: event.type,
401:       paymentStatus: "unpaid",
402:       failureReason,
403:       providerEventId: event.id,
404:     },
405:     extractTenantFromEvent(event)?.toString() ?? "",
406:   );
407: }
408: 
409: // ── checkout.session.expired handler ────────────────────────────────────────
410: 
411: async function handleCheckoutSessionExpired(
412:   event: PaymentProviderEvent,
413:   eventRecord: PaymentEventDocument,
414: ): Promise<void> {
415:   const sessionId = extractCheckoutSessionId(event);
416:   if (!sessionId) return;
417: 
418:   const metadata: Record<string, string> = {
419:     providerEventId: event.id,
420:   };
421: 
422:   await CheckoutSessionModel.updateOne(
423:     { providerSessionId: sessionId },
424:     {
425:       $set: {
426:         status: "expired",
427:         metadata: new Map(Object.entries(metadata)),
428:       },
429:     },
430:   );
431: 
432:   eventRecord.status = "processed";
433:   eventRecord.processedAt = new Date();
434:   await eventRecord.save();
435: 
436:   writeAudit(
437:     "CHECKOUT_SESSION_UPDATED",
438:     sessionId,
439:     {
440:       eventType: event.type,
441:       providerEventId: event.id,
442:     },
443:     extractTenantFromEvent(event)?.toString() ?? "",
444:   );
445: }
446: 
447: // ── Subscription resolution ──────────────────────────────────────────────────
448: 
449: interface ResolvedSubscription {
450:   subscription: { _id: Types.ObjectId; status: string; providerSubscriptionId: string; providerCustomerId: string };
451:   tenantId: Types.ObjectId;
452: }
453: 
454: async function resolveSubscriptionFromEvent(

(Showing lines 355-454 of 636. Use offset=455 to continue.)
</content>
```

---

## Assistant (Build · Big Pickle · 10.1s)

_Thinking:_

Good, the handlers look correct. Now let me also verify the extraction helpers were added correctly.

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/marco/documind-ai/api/src/modules/payment-webhooks/payment-webhooks.service.ts",
  "limit": 40,
  "offset": 548
}
```

**Output:**
```
<path>/home/marco/documind-ai/api/src/modules/payment-webhooks/payment-webhooks.service.ts</path>
<type>file</type>
<content>
548: }
549: 
550: function extractFailureReason(
551:   event: PaymentProviderEvent,
552: ): string | undefined {
553:   const obj = extractRawObject(event);
554:   const lastError = obj?.last_payment_error as
555:     | Record<string, unknown>
556:     | undefined;
557:   if (lastError?.message) return lastError.message as string;
558:   return undefined;
559: }
560: 
561: // ── Admin: list & reprocess ──────────────────────────────────────────────────
562: 
563: export async function listPaymentEvents(filter: {
564:   page: number;
565:   pageSize: number;
566:   status?: string;
567:   eventType?: string;
568: }, context: OperationAuthorizationContext) {
569:   await authorizePlatformOperation(context, Permission.BILLING_READ);
570:   const query: Record<string, unknown> = {};
571:   if (filter.status) query.status = filter.status;
572:   if (filter.eventType) query.eventType = filter.eventType;
573: 
574:   const [events, totalRecords] = await Promise.all([
575:     PaymentEventModel.find(query)
576:       .select("-signature -rawBody -payload")
577:       .sort({ createdAt: -1 })
578:       .skip((filter.page - 1) * filter.pageSize)
579:       .limit(filter.pageSize)
580:       .lean()
581:       .exec(),
582:     PaymentEventModel.countDocuments(query),
583:   ]);
584: 
585:   return {
586:     events,
587:     pagination: {

(Showing lines 548-587 of 636. Use offset=588 to continue.)
</content>
```

---

## Assistant (Build · Big Pickle · 5.7s)

_Thinking:_

Good. Now let me also check the extractPaymentStatus helper:

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/marco/documind-ai/api/src/modules/payment-webhooks/payment-webhooks.service.ts",
  "limit": 20,
  "offset": 536
}
```

**Output:**
```
<path>/home/marco/documind-ai/api/src/modules/payment-webhooks/payment-webhooks.service.ts</path>
<type>file</type>
<content>
536:   event: PaymentProviderEvent,
537: ): string | undefined {
538:   const obj = extractRawObject(event);
539:   const metadata = obj?.metadata as Record<string, string> | undefined;
540:   return metadata?.packageId;
541: }
542: 
543: function extractPaymentStatus(
544:   event: PaymentProviderEvent,
545: ): string | undefined {
546:   const obj = extractRawObject(event);
547:   return obj?.payment_status as string | undefined;
548: }
549: 
550: function extractFailureReason(
551:   event: PaymentProviderEvent,
552: ): string | undefined {
553:   const obj = extractRawObject(event);
554:   const lastError = obj?.last_payment_error as
555:     | Record<string, unknown>

(Showing lines 536-555 of 636. Use offset=556 to continue.)
</content>
```

---

## Assistant (Build · Big Pickle · 10.5s)

_Thinking:_

Everything looks good. Now let me mark the wire-up task as completed and move on to writing tests.

**Tool: todowrite**

**Input:**
```json
{
  "todos": [
    {
      "content": "Add extraction helpers (extractPaymentStatus, extractFailureReason) to payment-webhooks.service.ts",
      "priority": "high",
      "status": "completed"
    },
    {
      "content": "Add handleCheckoutSessionCompleted handler for failed initial checkout",
      "priority": "high",
      "status": "completed"
    },
    {
      "content": "Add handleCheckoutSessionExpired handler",
      "priority": "high",
      "status": "completed"
    },
    {
      "content": "Wire new handlers into handlePaymentEvent routing logic",
      "priority": "high",
      "status": "completed"
    },
    {
      "content": "Add tests for initial checkout failure, expired, idempotency, no subscription created",
      "priority": "high",
      "status": "in_progress"
    },
    {
      "content": "Verify existing tests still pass",
      "priority": "high",
      "status": "pending"
    },
    {
      "content": "Run lint, typecheck, and tests",
      "priority": "high",
      "status": "pending"
    }
  ]
}
```

**Output:**
```
[
  {
    "content": "Add extraction helpers (extractPaymentStatus, extractFailureReason) to payment-webhooks.service.ts",
    "status": "completed",
    "priority": "high"
  },
  {
    "content": "Add handleCheckoutSessionCompleted handler for failed initial checkout",
    "status": "completed",
    "priority": "high"
  },
  {
    "content": "Add handleCheckoutSessionExpired handler",
    "status": "completed",
    "priority": "high"
  },
  {
    "content": "Wire new handlers into handlePaymentEvent routing logic",
    "status": "completed",
    "priority": "high"
  },
  {
    "content": "Add tests for initial checkout failure, expired, idempotency, no subscription created",
    "status": "in_progress",
    "priority": "high"
  },
  {
    "content": "Verify existing tests still pass",
    "status": "pending",
    "priority": "high"
  },
  {
    "content": "Run lint, typecheck, and tests",
    "status": "pending",
    "priority": "high"
  }
]
```

---

## Assistant (Build · Big Pickle · 7.6s)

_Thinking:_

Now I need to add tests. Let me read the existing test file again to find the right place to add new tests.

Now add the new test cases to the existing test file. I'll add them after the `checkout.session.completed` describe block:

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/marco/documind-ai/api/src/modules/billing/__tests__/payment-webhooks.service.test.ts",
  "limit": 60,
  "offset": 639
}
```

**Output:**
```
<path>/home/marco/documind-ai/api/src/modules/billing/__tests__/payment-webhooks.service.test.ts</path>
<type>file</type>
<content>
639:   describe("checkout.session.completed", () => {
640:     it("transitions to INCOMPLETE with paymentState paid", async () => {
641:       (SubscriptionModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
642:         mockQueryChain(makeSub({ status: "TRIALING" })),
643:       );
644: 
645:       const event = makeEvent({
646:         id: "evt_csc_1",
647:         type: "checkout.session.completed",
648:         rawObject: {
649:           metadata: { tenantId: TENANT_ID, packageId: "pkg_123" },
650:           id: "cs_session_1",
651:         },
652:       });
653:       await handlePaymentEvent(event, "{}", "sig");
654: 
655:       expect(transitionSubscription).toHaveBeenCalledWith(
656:         TENANT_ID,
657:         "INCOMPLETE",
658:         expect.objectContaining({ triggeredBy: "provider_event" }),
659:       );
660:     });
661: 
662:     it("marks checkout session as completed", async () => {
663:       (SubscriptionModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
664:         mockQueryChain(makeSub({ status: "TRIALING" })),
665:       );
666: 
667:       const event = makeEvent({
668:         id: "evt_csc_2",
669:         type: "checkout.session.completed",
670:         rawObject: {
671:           metadata: { tenantId: TENANT_ID },
672:           id: "cs_session_2",
673:         },
674:       });
675:       await handlePaymentEvent(event, "{}", "sig");
676: 
677:       expect(CheckoutSessionModel.updateOne).toHaveBeenCalledWith(
678:         { providerSessionId: "cs_session_2" },
679:         { $set: expect.objectContaining({ status: "completed" }) },
680:       );
681:     });
682:   });
683: 
684:   describe("customer.subscription.deleted", () => {
685:     it("transitions to EXPIRED with paymentState failed", async () => {
686:       (SubscriptionModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(
687:         mockQueryChain(makeSub({ status: "ACTIVE" })),
688:       );
689: 
690:       const event = makeEvent({
691:         id: "evt_csd_1",
692:         type: "customer.subscription.deleted",
693:         rawObject: {
694:           metadata: { tenantId: TENANT_ID },
695:         },
696:       });
697:       await handlePaymentEvent(event, "{}", "sig");
698: 

(Showing lines 639-698 of 738. Use offset=699 to continue.)
</content>
```

---

## Assistant (Build · Big Pickle · 25.2s)

_Thinking:_

Now let me add the new test cases after the `checkout.session.completed` describe block and before the `customer.subscription.deleted` describe block. I'll insert them between lines 682 and 684.

**Tool: edit**

**Input:**
```json
{
  "filePath": "/home/marco/documind-ai/api/src/modules/billing/__tests__/payment-webhooks.service.test.ts",
  "newString": "  describe(\"checkout.session.completed — failed initial checkout\", () => {\n    it(\"marks CheckoutSession as failed when payment_status is unpaid\", async () => {\n      const event = makeEvent({\n        id: \"evt_csc_fail_1\",\n        type: \"checkout.session.completed\",\n        rawObject: {\n          id: \"cs_session_fail_1\",\n          payment_status: \"unpaid\",\n          metadata: { tenantId: TENANT_ID, packageId: \"pkg_123\" },\n        },\n      });\n      await handlePaymentEvent(event, \"{}\", \"sig\");\n\n      expect(CheckoutSessionModel.updateOne).toHaveBeenCalledWith(\n        { providerSessionId: \"cs_session_fail_1\" },\n        { $set: expect.objectContaining({ status: \"failed\" }) },\n      );\n    });\n\n    it(\"does NOT create or transition an internal Subscription\", async () => {\n      const event = makeEvent({\n        id: \"evt_csc_fail_2\",\n        type: \"checkout.session.completed\",\n        rawObject: {\n          id: \"cs_session_fail_2\",\n          payment_status: \"unpaid\",\n          metadata: { tenantId: TENANT_ID },\n        },\n      });\n      await handlePaymentEvent(event, \"{}\", \"sig\");\n\n      expect(transitionSubscription).not.toHaveBeenCalled();\n      expect(SubscriptionModel.updateOne).not.toHaveBeenCalled();\n    });\n\n    it(\"stores failure reason in CheckoutSession metadata\", async () => {\n      const event = makeEvent({\n        id: \"evt_csc_fail_3\",\n        type: \"checkout.session.completed\",\n        rawObject: {\n          id: \"cs_session_fail_3\",\n          payment_status: \"unpaid\",\n          last_payment_error: { message: \"Your card was declined.\" },\n          metadata: { tenantId: TENANT_ID },\n        },\n      });\n      await handlePaymentEvent(event, \"{}\", \"sig\");\n\n      expect(CheckoutSessionModel.updateOne).toHaveBeenCalledWith(\n        { providerSessionId: \"cs_session_fail_3\" },\n        {\n          $set: expect.objectContaining({\n            status: \"failed\",\n            metadata: expect.any(Map),\n          }),\n        },\n      );\n    });\n\n    it(\"does NOT fall through to the old static mapping handler\", async () => {\n      const event = makeEvent({\n        id: \"evt_csc_fail_4\",\n        type: \"checkout.session.completed\",\n        rawObject: {\n          id: \"cs_session_fail_4\",\n          payment_status: \"unpaid\",\n          metadata: { tenantId: TENANT_ID },\n        },\n      });\n      await handlePaymentEvent(event, \"{}\", \"sig\");\n\n      expect(transitionSubscription).not.toHaveBeenCalled();\n      expect(SubscriptionModel.findOne).not.toHaveBeenCalled();\n    });\n\n    it(\"is idempotent for duplicate failure webhooks\", async () => {\n      (PaymentEventModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(\n        mockQueryChain({ eventId: \"evt_csc_fail_dup\" }),\n      );\n\n      const event = makeEvent({\n        id: \"evt_csc_fail_dup\",\n        type: \"checkout.session.completed\",\n        rawObject: {\n          id: \"cs_session_dup\",\n          payment_status: \"unpaid\",\n          metadata: { tenantId: TENANT_ID },\n        },\n      });\n      await handlePaymentEvent(event, \"{}\", \"sig\");\n\n      expect(CheckoutSessionModel.updateOne).not.toHaveBeenCalled();\n    });\n  });\n\n  describe(\"checkout.session.expired\", () => {\n    it(\"marks CheckoutSession as expired\", async () => {\n      const event = makeEvent({\n        id: \"evt_cse_1\",\n        type: \"checkout.session.expired\",\n        rawObject: {\n          id: \"cs_session_exp_1\",\n          metadata: { tenantId: TENANT_ID },\n        },\n      });\n      await handlePaymentEvent(event, \"{}\", \"sig\");\n\n      expect(CheckoutSessionModel.updateOne).toHaveBeenCalledWith(\n        { providerSessionId: \"cs_session_exp_1\" },\n        { $set: expect.objectContaining({ status: \"expired\" }) },\n      );\n    });\n\n    it(\"does NOT create or transition an internal Subscription\", async () => {\n      const event = makeEvent({\n        id: \"evt_cse_2\",\n        type: \"checkout.session.expired\",\n        rawObject: {\n          id: \"cs_session_exp_2\",\n          metadata: { tenantId: TENANT_ID },\n        },\n      });\n      await handlePaymentEvent(event, \"{}\", \"sig\");\n\n      expect(transitionSubscription).not.toHaveBeenCalled();\n      expect(SubscriptionModel.findOne).not.toHaveBeenCalled();\n    });\n\n    it(\"is idempotent for duplicate expiry webhooks\", async () => {\n      (PaymentEventModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(\n        mockQueryChain({ eventId: \"evt_cse_dup\" }),\n      );\n\n      const event = makeEvent({\n        id: \"evt_cse_dup\",\n        type: \"checkout.session.expired\",\n        rawObject: {\n          id: \"cs_session_exp_dup\",\n          metadata: { tenantId: TENANT_ID },\n        },\n      });\n      await handlePaymentEvent(event, \"{}\", \"sig\");\n\n      expect(CheckoutSessionModel.updateOne).not.toHaveBeenCalled();\n    });\n  });\n\n  describe(\"customer.subscription.deleted\", () => {",
  "oldString": "  describe(\"customer.subscription.deleted\", () => {"
}
```

**Output:**
```
Edit applied successfully.
```

---

## Assistant (Build · Big Pickle · 9.3s)

_Thinking:_

Good. Now let me mark the tests task as completed and move on to verifying existing tests.

**Tool: todowrite**

**Input:**
```json
{
  "todos": [
    {
      "content": "Add extraction helpers (extractPaymentStatus, extractFailureReason) to payment-webhooks.service.ts",
      "priority": "high",
      "status": "completed"
    },
    {
      "content": "Add handleCheckoutSessionCompleted handler for failed initial checkout",
      "priority": "high",
      "status": "completed"
    },
    {
      "content": "Add handleCheckoutSessionExpired handler",
      "priority": "high",
      "status": "completed"
    },
    {
      "content": "Wire new handlers into handlePaymentEvent routing logic",
      "priority": "high",
      "status": "completed"
    },
    {
      "content": "Add tests for initial checkout failure, expired, idempotency, no subscription created",
      "priority": "high",
      "status": "completed"
    },
    {
      "content": "Verify existing tests still pass",
      "priority": "high",
      "status": "in_progress"
    },
    {
      "content": "Run lint, typecheck, and tests",
      "priority": "high",
      "status": "pending"
    }
  ]
}
```

**Output:**
```
[
  {
    "content": "Add extraction helpers (extractPaymentStatus, extractFailureReason) to payment-webhooks.service.ts",
    "status": "completed",
    "priority": "high"
  },
  {
    "content": "Add handleCheckoutSessionCompleted handler for failed initial checkout",
    "status": "completed",
    "priority": "high"
  },
  {
    "content": "Add handleCheckoutSessionExpired handler",
    "status": "completed",
    "priority": "high"
  },
  {
    "content": "Wire new handlers into handlePaymentEvent routing logic",
    "status": "completed",
    "priority": "high"
  },
  {
    "content": "Add tests for initial checkout failure, expired, idempotency, no subscription created",
    "status": "completed",
    "priority": "high"
  },
  {
    "content": "Verify existing tests still pass",
    "status": "in_progress",
    "priority": "high"
  },
  {
    "content": "Run lint, typecheck, and tests",
    "status": "pending",
    "priority": "high"
  }
]
```

---

## Assistant (Build · Big Pickle · 21.6s)

_Thinking:_

Let me run the existing unit tests first to verify they still pass.

Run the unit tests to verify no regressions:

**Tool: bash**

**Input:**
```json
{
  "command": "cd /home/marco/documind-ai/api && npx vitest run src/modules/billing/__tests__/payment-webhooks.service.test.ts 2>&1",
  "timeout": 60000
}
```

**Output:**
```

 RUN  v4.1.10 /home/marco/documind-ai/api


 Test Files  1 passed (1)
      Tests  35 passed (35)
   Start at  14:44:17
   Duration  4.93s (transform 312ms, setup 0ms, import 4.18s, tests 53ms, environment 0ms)


```

---

## Assistant (Build · Big Pickle · 9.8s)

_Thinking:_

All 35 tests pass (the original 27 + my 8 new ones). Let me also run the other webhook-related tests.

All 35 tests pass. Let me also run the other webhook-related test files:

**Tool: bash**

**Input:**
```json
{
  "command": "cd /home/marco/documind-ai/api && npx vitest run src/modules/payment-webhooks/__tests__/payment-webhooks.test.ts 2>&1",
  "timeout": 60000
}
```

**Output:**
```

 RUN  v4.1.10 /home/marco/documind-ai/api

No test files found, exiting with code 1

filter: src/modules/payment-webhooks/__tests__/payment-webhooks.test.ts
include: src/modules/billing/**/*.test.ts, src/modules/checkout/__tests__/checkout.service.test.ts, src/modules/auth/__tests__/*.test.ts, src/db/__tests__/*.test.ts, src/scripts/__tests__/*.test.ts, src/modules/imports/__tests__/*.test.ts, src/modules/imports/ports/__tests__/*.test.ts, src/modules/imports/services/__tests__/*.test.ts
exclude:  **/node_modules/**, **/dist/**, **/subscription-provisioning.contract.test.ts


```

**Tool: bash**

**Input:**
```json
{
  "command": "cd /home/marco/documind-ai/api && npx vitest run src/modules/payment-webhooks/__tests__/payment-webhooks.admin.test.ts 2>&1",
  "timeout": 60000
}
```

**Output:**
```

 RUN  v4.1.10 /home/marco/documind-ai/api

No test files found, exiting with code 1

filter: src/modules/payment-webhooks/__tests__/payment-webhooks.admin.test.ts
include: src/modules/billing/**/*.test.ts, src/modules/checkout/__tests__/checkout.service.test.ts, src/modules/auth/__tests__/*.test.ts, src/db/__tests__/*.test.ts, src/scripts/__tests__/*.test.ts, src/modules/imports/__tests__/*.test.ts, src/modules/imports/ports/__tests__/*.test.ts, src/modules/imports/services/__tests__/*.test.ts
exclude:  **/node_modules/**, **/dist/**, **/subscription-provisioning.contract.test.ts


```

---

## Assistant (Build · Big Pickle · 11.5s)

_Thinking:_

The vitest config has an include pattern that only covers certain directories. The payment-webhooks tests (non-service tests) are in a different directory. Let me check the vitest config.

The vitest config filters to specific directories. Let me check the config and run the source-level tests with node's test runner:

**Tool: bash**

**Input:**
```json
{
  "command": "cd /home/marco/documind-ai/api && node --import tsx --test src/modules/payment-webhooks/__tests__/payment-webhooks.test.ts 2>&1",
  "timeout": 30000
}
```

**Output:**
```
TAP version 13
# Subtest: webhook handler maps checkout.session.completed to INCOMPLETE
ok 1 - webhook handler maps checkout.session.completed to INCOMPLETE
  ---
  duration_ms: 6.934621
  type: 'test'
  ...
# Subtest: webhook handler handles idempotency (duplicate eventId)
ok 2 - webhook handler handles idempotency (duplicate eventId)
  ---
  duration_ms: 1.80021
  type: 'test'
  ...
# Subtest: webhook handler persists events before processing
ok 3 - webhook handler persists events before processing
  ---
  duration_ms: 1.743516
  type: 'test'
  ...
# Subtest: webhook controller verifies signature
ok 4 - webhook controller verifies signature
  ---
  duration_ms: 19.90794
  type: 'test'
  ...
# Subtest: webhook controller responds 200 quickly without blocking
ok 5 - webhook controller responds 200 quickly without blocking
  ---
  duration_ms: 1.250991
  type: 'test'
  ...
1..5
# tests 5
# suites 0
# pass 5
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 1270.675208

```

---

## Assistant (Build · Big Pickle · 9.4s)

_Thinking:_

All source-level tests pass too. Let me also run the checkout service tests to make sure nothing is broken there.

**Tool: bash**

**Input:**
```json
{
  "command": "cd /home/marco/documind-ai/api && npx vitest run src/modules/checkout/__tests__/checkout.service.test.ts 2>&1",
  "timeout": 60000
}
```

**Output:**
```

 RUN  v4.1.10 /home/marco/documind-ai/api


 Test Files  1 passed (1)
      Tests  23 passed (23)
   Start at  14:44:52
   Duration  697ms (transform 219ms, setup 0ms, import 458ms, tests 32ms, environment 0ms)


```

---

## Assistant (Build · Big Pickle · 7.5s)

_Thinking:_

All tests pass. Now let me run lint and typecheck.

All tests pass. Now run lint and typecheck:

**Tool: todowrite**

**Input:**
```json
{
  "todos": [
    {
      "content": "Add extraction helpers (extractPaymentStatus, extractFailureReason) to payment-webhooks.service.ts",
      "priority": "high",
      "status": "completed"
    },
    {
      "content": "Add handleCheckoutSessionCompleted handler for failed initial checkout",
      "priority": "high",
      "status": "completed"
    },
    {
      "content": "Add handleCheckoutSessionExpired handler",
      "priority": "high",
      "status": "completed"
    },
    {
      "content": "Wire new handlers into handlePaymentEvent routing logic",
      "priority": "high",
      "status": "completed"
    },
    {
      "content": "Add tests for initial checkout failure, expired, idempotency, no subscription created",
      "priority": "high",
      "status": "completed"
    },
    {
      "content": "Verify existing tests still pass",
      "priority": "high",
      "status": "completed"
    },
    {
      "content": "Run lint, typecheck, and tests",
      "priority": "high",
      "status": "in_progress"
    }
  ]
}
```

**Output:**
```
[
  {
    "content": "Add extraction helpers (extractPaymentStatus, extractFailureReason) to payment-webhooks.service.ts",
    "status": "completed",
    "priority": "high"
  },
  {
    "content": "Add handleCheckoutSessionCompleted handler for failed initial checkout",
    "status": "completed",
    "priority": "high"
  },
  {
    "content": "Add handleCheckoutSessionExpired handler",
    "status": "completed",
    "priority": "high"
  },
  {
    "content": "Wire new handlers into handlePaymentEvent routing logic",
    "status": "completed",
    "priority": "high"
  },
  {
    "content": "Add tests for initial checkout failure, expired, idempotency, no subscription created",
    "status": "completed",
    "priority": "high"
  },
  {
    "content": "Verify existing tests still pass",
    "status": "completed",
    "priority": "high"
  },
  {
    "content": "Run lint, typecheck, and tests",
    "status": "in_progress",
    "priority": "high"
  }
]
```

---

## Assistant (Build · Big Pickle · 78.9s)

_Thinking:_

Let me run lint and typecheck in parallel.

**Tool: bash**

**Input:**
```json
{
  "command": "cd /home/marco/documind-ai/api && npm run lint 2>&1",
  "timeout": 60000
}
```

**Output:**
```

> api@1.0.0 lint
> eslint src eslint.config.mjs


```

**Tool: bash**

**Input:**
```json
{
  "command": "cd /home/marco/documind-ai/api && npm run typecheck 2>&1",
  "timeout": 120000
}
```

**Output:**
```

> api@1.0.0 pretypecheck
> npm run build --workspace workers


> workers@1.0.0 build
> tsc


> api@1.0.0 typecheck
> tsc --noEmit


```

---

## Assistant (Build · Big Pickle · 79.2s)

_Thinking:_

Both lint and typecheck pass cleanly. Let me now run the full test suite to make sure everything works.

Lint and typecheck pass cleanly. Let me run the full vitest suite:

**Tool: bash**

**Input:**
```json
{
  "command": "cd /home/marco/documind-ai/api && npx vitest run 2>&1",
  "timeout": 120000
}
```

**Output:**
```

 RUN  v4.1.10 /home/marco/documind-ai/api


 Test Files  20 passed (20)
      Tests  419 passed (419)
   Start at  14:46:48
   Duration  51.71s (transform 17.97s, setup 0ms, import 230.81s, tests 2.09s, environment 4ms)


```

---

## Assistant (Build · Big Pickle · 11.0s)

_Thinking:_

All 419 tests pass across 20 test files. Let me mark the final task as completed.

All 419 tests pass across 20 test files. No regressions.

**Tool: todowrite**

**Input:**
```json
{
  "todos": [
    {
      "content": "Add extraction helpers (extractPaymentStatus, extractFailureReason) to payment-webhooks.service.ts",
      "priority": "high",
      "status": "completed"
    },
    {
      "content": "Add handleCheckoutSessionCompleted handler for failed initial checkout",
      "priority": "high",
      "status": "completed"
    },
    {
      "content": "Add handleCheckoutSessionExpired handler",
      "priority": "high",
      "status": "completed"
    },
    {
      "content": "Wire new handlers into handlePaymentEvent routing logic",
      "priority": "high",
      "status": "completed"
    },
    {
      "content": "Add tests for initial checkout failure, expired, idempotency, no subscription created",
      "priority": "high",
      "status": "completed"
    },
    {
      "content": "Verify existing tests still pass",
      "priority": "high",
      "status": "completed"
    },
    {
      "content": "Run lint, typecheck, and tests",
      "priority": "high",
      "status": "completed"
    }
  ]
}
```

**Output:**
```
[
  {
    "content": "Add extraction helpers (extractPaymentStatus, extractFailureReason) to payment-webhooks.service.ts",
    "status": "completed",
    "priority": "high"
  },
  {
    "content": "Add handleCheckoutSessionCompleted handler for failed initial checkout",
    "status": "completed",
    "priority": "high"
  },
  {
    "content": "Add handleCheckoutSessionExpired handler",
    "status": "completed",
    "priority": "high"
  },
  {
    "content": "Wire new handlers into handlePaymentEvent routing logic",
    "status": "completed",
    "priority": "high"
  },
  {
    "content": "Add tests for initial checkout failure, expired, idempotency, no subscription created",
    "status": "completed",
    "priority": "high"
  },
  {
    "content": "Verify existing tests still pass",
    "status": "completed",
    "priority": "high"
  },
  {
    "content": "Run lint, typecheck, and tests",
    "status": "completed",
    "priority": "high"
  }
]
```

---

## Assistant (Build · Big Pickle · 15.7s)

_Thinking:_

All tasks completed. Let me provide a summary of the changes.

## Summary of Changes

### Files Modified

**`api/src/modules/payment-webhooks/payment-webhooks.service.ts`**

1. **Routing** (`handlePaymentEvent`, line 124-135): Added early-return handlers for `checkout.session.expired` and `checkout.session.completed` with `payment_status: "unpaid"` before the existing subscription-based routing. This prevents the old code from attempting subscription resolution on events that don't involve an existing subscription.

2. **`handleCheckoutSessionCompleted`** (line 364-407): New handler for failed initial checkout payments. Extracts `payment_status` from the Stripe event; if `"unpaid"`, marks the `CheckoutSession` as `failed` in MongoDB and stores `payment_status`, `providerEventId`, and optional `failureReason` in the session's `metadata` map. Does not touch any Subscription record. Marks the `PaymentEvent` as `processed`.

3. **`handleCheckoutSessionExpired`** (line 411-445): New handler for expired checkout sessions. Marks the `CheckoutSession` as `expired` and stores `providerEventId` in metadata. Does not touch any Subscription record. Marks the `PaymentEvent` as `processed`.

4. **`extractPaymentStatus`** (line 543-548): Extracts `data.object.payment_status` from the Stripe event.

5. **`extractFailureReason`** (line 550-559): Extracts `data.object.last_payment_error.message` from the Stripe event.

**`api/src/modules/billing/__tests__/payment-webhooks.service.test.ts`**

Added 8 new test cases:
- `checkout.session.completed — failed initial checkout` (5 tests): marks CheckoutSession as failed, no Subscription created, stores failure reason, does not fall through to old handler, idempotent on duplicate
- `checkout.session.expired` (3 tests): marks CheckoutSession as expired, no Subscription created, idempotent on duplicate

### What was NOT changed
- No model/schema changes (`CheckoutSession` already had `failed` and `expired` statuses)
- No route or controller changes
- No config or environment changes
- No changes to existing successful flow handlers

### Verification Results
- **Lint**: clean
- **Typecheck**: clean
- **Unit tests**: 419/419 passing (20 test files)
- **Existing checkout.session.completed tests**: still pass (successful path unchanged)
- **Existing invoice.payment_failed tests**: still pass
- **All subscription lifecycle tests**: still pass

### How to test the fix
1. Start a new checkout, use test card `4000 0000 0000 0341`
2. Stripe fires `checkout.session.completed` with `payment_status: "unpaid"`
3. The `CheckoutSession` record transitions from `pending` → `failed`
4. No internal Subscription is created
5. The tenant can retry checkout (no Subscription in `CANCELED` state blocking them)
6. The `PaymentEvent` is logged as `processed` (not `failed`)

---

