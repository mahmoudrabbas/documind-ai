# Issue 26 — Phase 1: Platform Contracts, Global Settings Validation, and Critical Route Fixes

## 1. Corrected Reconciliation Endpoint

**Before (frontend):**
```
POST /reconciliation/subscriptions
```

**After (frontend):**
```
POST /super-admin/reconciliation/subscriptions
```

The backend route has always been mounted at `POST /super-admin/reconciliation/subscriptions` (see `api/src/app.ts:168` and `api/src/modules/reconciliation/reconciliation.routes.ts:14`). The frontend billing service was calling the wrong path.

**File changed:** `app/src/services/billing.service.ts:60`

---

## 2. Global Settings Request/Response DTOs

### Response (GET `/platform/settings`)

Returns a complete normalized object with all five fields:

```typescript
interface GlobalSettings {
  supportEmail: string;       // trimmed, max 254 chars, empty string when unconfigured
  maintenanceMode: boolean;   // default: false
  allowRegistrations: boolean; // default: true
  defaultTrialDays: number;   // integer, 0–3650, default: 14
  dataRetentionDays: number;  // integer, 1–36500, default: 365
}
```

### Request (PATCH `/platform/settings`)

Accepts a strict partial update. Unknown fields are rejected. Empty body is rejected.

```typescript
type GlobalSettingsPatch = Partial<GlobalSettings>;
```

---

## 3. Validation Rules and Ranges

| Field | Type | Constraints | Default |
|---|---|---|---|
| `supportEmail` | string | trim, max 254 chars, valid email or empty | `""` |
| `maintenanceMode` | boolean | required | `false` |
| `allowRegistrations` | boolean | required | `true` |
| `defaultTrialDays` | integer | 0 ≤ value ≤ 3650 | `14` |
| `dataRetentionDays` | integer | 1 ≤ value ≤ 36500 | `365` |

**Rejection rules:**
- Unknown fields → rejected (strict mode)
- Empty PATCH body → rejected
- `null` values → rejected for all five fields
- `NaN`, `Infinity` → rejected
- Strings for numeric fields → rejected
- Decimals for integer fields → rejected

---

## 4. PATCH Merge Semantics

The PATCH handler performs a **merge**, not a replacement:

1. Read the current raw settings from the database.
2. Normalize the current settings (apply type-safe defaults for malformed legacy values).
3. Merge the validated patch onto the normalized current: `{ ...normalized, ...patch }`.
4. Persist the complete merged object.

**Result:** Omitted fields in a PATCH are preserved. Only explicitly provided fields are updated.

---

## 5. Authorization and Audit Requirements

**Authorization chain:**
1. `authenticate` — verifies JWT
2. `requirePlatformTenant` — ensures the request originates from the platform tenant
3. `requirePermission(COMPANY_SETTINGS_UPDATE)` — verifies the user has the update permission

**Audit logging:**
- Event: `PLATFORM_SETTING_UPDATED`
- Resource type: `PlatformSetting`
- Resource ID: the setting key (`global_settings` or `ai_configuration`)
- Changes: `changedFields` (sorted array of updated field names)
- No secrets are included in the audit event

---

## 6. Cache Behavior and Invalidation

The global settings runtime reader (`api/src/modules/platform/global-settings.ts`) uses a 30-second in-memory cache:

- `getGlobalSettings()` reads from cache if valid, otherwise queries the database.
- `invalidateGlobalSettingsCache()` is called immediately after a successful `global_settings` update.
- The cache normalizes legacy stored values, falling back to safe defaults for malformed data.

---

## 7. Runtime Consumers

The five global settings fields are consumed by:

| Field | Consumer | Location |
|---|---|---|
| `maintenanceMode` | Maintenance mode middleware | `api/src/common/middlewares/maintenanceMode.middleware.ts` |
| `allowRegistrations` | Registration gate | `api/src/modules/auth/auth.service.ts` |
| `defaultTrialDays` | Subscription trial fallback | `api/src/modules/billing/registration.service.ts` |
| `supportEmail` | Email branding footer | `api/src/modules/email/email.service.ts`, `workers/src/jobs/emailSendJob.ts` |
| `dataRetentionDays` | Data retention job cutoff | `workers/src/jobs/dataRetentionJob.ts` |

**Note:** Automatic recurring scheduling of the data-retention job is not proven or implemented by this phase. The job reads the setting but scheduling infrastructure is deferred.

---

## 8. AI Configuration Separation

The AI Configuration endpoint (`GET/PATCH /platform/ai-configuration`) continues to use the generic `settingsBodySchema` validator. It is **not** parsed through the Global Settings schema. The two setting types have separate:
- Validators (`settingsBodySchema` for AI, `globalSettingsPatchSchema` for Global Settings)
- Controller handlers
- Frontend service functions (`getAiConfiguration`/`updateAiConfiguration` vs `getGlobalSettings`/`updateGlobalSettings`)

---

## 9. Deferred Phases

The following work is explicitly **not** implemented in Phase 1:

- Tenant creation, archive, scheduled deletion, hard deletion
- Tenant suspend/reinstate changes
- Impersonation or support access
- Package activate/archive UI
- Package provider resynchronization
- Subscription override endpoint redesign
- Subscription override UI
- Subscription reason/idempotency/preview flow
- Reconciliation auto-fix
- Queue cancellation and frontend integration
- Worker health integration
- Stripe/provider health UI
- SMTP provider health UI
- Invoice history, refunds
- Billing portal changes
- Cancellation/reactivation customer workflows
- Quota enforcement
- Company Admin dashboard changes
- Analytics or cost-agent implementation
- Removal of the old `/platform` frontend route group
- Broad unrelated refactoring
- Dependency upgrades

---

## 10. Explicit Out-of-Scope Items

- No new npm dependencies were added.
- No environment files were modified.
- No secrets were printed or committed.
- No existing tests were deleted.
- No backend routes were renamed or moved.
- No database migrations were run.
- No git history was rewritten.
