# Super Admin Module — Sidebar + Interaction Responsiveness Fix Plan

**Status:** Ready for handoff, with 3 open questions (§7) that should be answered before Work Item A starts.
**Scope:** `app/src/app/(dashboard)/super-admin/**`, `app/src/components/super-admin/**`, and the shared navigation chain that serves it.
**Audit date:** 2026-08-10 · branch `master` @ `b4791cb`

---

## 0. Executive summary — one premise needs correcting first

> **The Super Admin module is not over-using SSR. It is already 100% client-rendered.**

Every page under `app/src/app/(dashboard)/super-admin/` carries `"use client"`. The only two exceptions are
`companies/page.tsx` (a 12-line `<Suspense>` wrapper) and `tenants/page.tsx` (a bare `redirect()`).
There is **no server-side data fetching anywhere in this module** — no `async` page components, no
`fetch()` in a Server Component, no server actions.

So the blank flash and full page reloads you're seeing are real, but they are **not** caused by SSR.
They are caused by three concrete things, all confirmed in the code:

1. **Raw `<a href>` tags** inside the companies table (`tenants-client.tsx:393`, `:500`, `:512`) — these
   are true browser navigations. Full HTML re-fetch, provider tree remount, re-run of `/auth/me` +
   `/permissions/me`. This is your blank flash.
2. **`usePlatformData` cannot take parameters**, so no page using it can paginate server-side. Pages work
   around this by fetching everything up-front and slicing in memory.
3. **Every refetch swaps content for a skeleton** (`PlatformState`), so even correct client-side updates
   read as a "reload".

That's good news: the fix is smaller and lower-risk than an SSR→CSR refactor. Nothing needs to be
converted between Server and Client Components. **No component in this module needs its
Server/Client designation changed.**

---

## 1. Root cause analysis

### 1.1 Component tree as it actually exists

```
app/layout.tsx                                    [Server]  html/body
└── I18nProvider > AuthProvider > PermissionProvider > TenantProvider   [all Client]
    └── (dashboard)/layout.tsx                    [Client]  ← renders the sidebar
        ├── <AppNavigation open onClose />        [Client]  ← THE SIDEBAR (shared, not super-admin-only)
        └── <TopNavBar />                         [Client]
            └── (dashboard)/super-admin/layout.tsx [Client]  RoleGuard + PermissionBoundary
                └── super-admin/*/page.tsx        [Client]  all of them
```

There is no component named `Sidebar`. The sidebar is
**`app/src/components/auth/app-navigation.tsx`**, rendered from **`app/src/app/(dashboard)/layout.tsx:22`**.
Its items come from **`app/src/constants/routes.ts` → `PLATFORM_SIDEBAR_LINKS`** (17 entries, lines 125–143).

Note this is a **shared** chain: `/dashboard/*` (COMPANY_ADMIN, EMPLOYEE) and `/super-admin/*` (SUPER_ADMIN)
render the *same* layout and the *same* sidebar component, switched only by
`getAppContext(role)` (`routes.ts:152`). See §6.

### 1.2 Why the sidebar isn't rendering — ranked hypotheses

I could not reproduce this at runtime, so these are ranked by evidence strength. §5.1 gives a
90-second triage that distinguishes them definitively. **Please run that triage before implementing —
the fix differs per cause.**

---

**RC-A · The nav list is hard-gated to empty until permissions resolve.** ⭐ most likely

`app/src/constants/routes.ts:163`
```ts
if (permissionStatus !== "ready") return [];
```

`filterNavigationLinks` returns `[]` for *any* non-ready status — `loading`, `idle`, `denied`, `error`,
`maintenance`. `AppNavigation` then renders the `<aside>` chrome (logo, "DocuMind AI", Help Center,
Logout) with a **completely empty `<nav>`**.

To a user this reads as "the sidebar isn't rendering" — the panel is there but has no items. If
`/permissions/me` is slow, errors, or 403s, the sidebar is empty **permanently**, with no error state
and no retry affordance. There is nothing in `AppNavigation` that distinguishes "still loading" from
"failed" from "genuinely zero links".

**Confirm it:** sidebar shell visible (logo + Logout) but zero links → RC-A.

---

**RC-B · Backend fail-closed gate for SUPER_ADMIN outside the canonical platform tenant.**

`api/src/modules/permissions/permissions.evaluator.ts:32-42`
```ts
if (baseRole === "SUPER_ADMIN") {
  const platformTenant = await TenantModel.exists({
    _id: actor.tenantId,
    slug: PLATFORM_TENANT_SLUG,
    isSystemTenant: true,
    status: "active",
  });
  if (!platformTenant) return emptyResolved(baseRole);   // ← zero permissions
}
```

A SUPER_ADMIN whose `tenantId` is not the canonical platform tenant — wrong seed, a tenant that isn't
`status: "active"`, missing `isSystemTenant: true`, or a stale JWT minted before the platform-tenant
migration (`api/src/scripts/migrate-platform-tenant-invariants.ts`) — resolves to **zero permissions**.

**Important nuance that makes this less likely than it looks:** the frontend `can()` short-circuits on
base role (`permission-provider.tsx:160-166`):
```ts
if (state.status !== "ready") return false;
if (state.baseRole === "SUPER_ADMIN") return true;   // ← ignores the empty permission set
```
So a **200 response** carrying `{ permissions: [], baseRole: "SUPER_ADMIN" }` still renders all 17 links.
RC-B only empties the sidebar if the request **403s** (status → `"denied"`).

**Confirm it:** if it 403s, `PermissionBoundary` (`super-admin/layout.tsx:44`) also replaces the *page
body* with an "Access denied" card. So: **empty sidebar + working page content = RC-A. Empty sidebar +
"Access denied" body = RC-B.** That's your discriminator.

---

**RC-C · Vertical overflow with no scroll container.** ⭐ certain to bite you regardless

`app-navigation.tsx:93-100` and `:127`
```tsx
<aside className="fixed inset-y-0 ... flex flex-col ...">   {/* height pinned to viewport */}
  <nav className="mt-md flex-1 space-y-1 px-md">            {/* NO overflow-y-auto */}
```

Each item is `px-4 py-3` ≈ 48px. 17 items ≈ 816px, plus ~88px header and ~100px footer ≈ **1004px**.
On a 900px-tall laptop viewport the content already exceeds the fixed-height panel — and because there
is **no `overflow-y-auto`**, the excess is unreachable: no scrollbar, items clipped, and the
Logout footer pushed out of view.

This may already be the reported symptom on smaller screens, and it is **guaranteed** to break the
moment you add "a large number" of items. Fix this regardless of which of RC-A/RC-B is the trigger.

---

**RC-D · Off-canvas transform depends on a `dir` attribute.** (mobile only, lower confidence)

`app-navigation.tsx:96-99`
```tsx
open ? "translate-x-0" : "max-md:ltr:-translate-x-full max-md:rtl:translate-x-full"
```
Both the hide-classes are `dir`-scoped. If `dir` is ever absent or set to a value that is neither
`ltr` nor `rtl`, *neither* variant matches and the panel sits over the content on mobile. Root
`layout.tsx:19` hardcodes `dir="ltr"`, but `I18nProvider` mutates it at runtime for Arabic. Worth a
look only if the symptom is mobile-specific or RTL-specific.

### 1.3 Why interactions feel unresponsive — confirmed causes

| # | Cause | Location | Effect |
|---|---|---|---|
| **P-1** | Raw `<a href>` for row actions | `tenants-client.tsx:393-398` ("Open"), `:500`, `:512` | **Full document reload.** Blank flash, provider remount, re-auth round-trip. The single biggest offender. |
| **P-2** | `usePlatformData` takes no params | `platform-ui.tsx:6-8` — signature is `(loader: (signal?) => Promise<{data:T}>)` | Server-side pagination is structurally impossible for its 16 consumers. |
| **P-3** | Fetch-all-then-slice | `subscriptions/page.tsx:14-20` (`pageSize: 100`) + `:60-62` (`.slice()` in memory) | Heavy first load; **silently truncates at 100 tenants**; page buttons are instant but the page is lying about totals. |
| **P-4** | Hardcoded single page | `payments/page.tsx:23-24` → `{ page: 1, pageSize: 50 }` | Payment events past 50 are unreachable. No UI to go further. |
| **P-5** | Skeleton replaces content on every refetch | `platform-ui.tsx:14` (`setLoading(true)` unconditionally) + `PlatformState:47-60` returns skeleton | Content→skeleton→content flash on *every* reload. Reads as a page reload even though it's client-side. |
| **P-6** | Paging refetches unrelated data | `tenants-client.tsx:107-112` — `Promise.all([listTenants(query), listSubscriptions()])` | Every page-change re-downloads the **entire, unpaginated** subscriptions list. |
| **P-7** | Loader-identity booby trap | `platform-ui.tsx:12-34` — `useCallback([loader])` feeding `useEffect([load])` | Works only because callers pass module-scope constants. The first person to write `usePlatformData((s) => listX(page, s))` inline to add pagination gets an **infinite fetch loop**. Directly in the path of the work you're planning. |
| **P-8** | No `loading.tsx` anywhere | zero found in `app/src/app/**` | Route transitions inside super-admin have no instant feedback. |
| **P-9** | O(n²) active-link computation | `app-navigation.tsx:129` — `links.map(l => l.href)` rebuilt *inside* the render loop | 17 items = 289 ops/render today; scales quadratically with the items you're adding. |
| **P-10** | Duplicated hand-rolled pagination | `refunds:33-62`, `entitlement:48-116`, `processing-overview:16-32` | Three different implementations, three different bug surfaces. |

**Confirmed correct — do not "fix":** `tenants-client.tsx:76-88` `navigate()` already uses
`router.replace(target, { scroll: false })`, which *is* proper client-side navigation. The URL-driven
pagination pattern there is sound; only the `<a>` tags and the over-fetching are wrong.

---

## 2. Prioritized fix plan

### Work Item A — Sidebar renders (BLOCKING)
Hand off as one unit. Small, self-contained, unblocks everything else.
1. Run the §5.1 triage to pick RC-A vs RC-B.
2. A1 · Give `AppNavigation` real loading/error/empty states instead of silently rendering nothing.
3. A2 · Add `overflow-y-auto` to the nav (RC-C) — do this unconditionally.
4. A3 · If triage says RC-B: repair the super admin's platform-tenant row and re-issue the session.

### Work Item B — Kill full page reloads (BLOCKING-ish, independent of A)
5. B1 · Replace the three raw `<a>` tags with `next/link`. ~15 minutes, immediately removes the blank flash.

### Work Item C — Data-fetching pattern (scalability)
6. C1 · Add a parameterised `usePlatformQuery` hook **alongside** the existing one (additive — see §6).
7. C2 · Migrate `subscriptions` and `payments` to real server-side pagination.
8. C3 · Keep-previous-data so refetches stop flashing.
9. C4 · Add `loading.tsx` to the super-admin segment.

### Work Item D — Sidebar scalability (do before adding the new items)
10. D1 · Restructure `PLATFORM_SIDEBAR_LINKS` into grouped sections (§4).
11. D2 · Render collapsible groups; hoist the O(n²) active-check.

> **Handoff advice:** A+B go to one implementer, C+D to another. They touch disjoint files.
> A and B are both blocking but share no code, so they can run in parallel.

---

## 3. Per-file change plan

Every file below is **already a Client Component and stays one.** No Server/Client conversions are
required anywhere in this plan — that premise of the original brief doesn't apply to this codebase.

### Work Item A — sidebar renders

| File | Change | Component type | Shared? |
|---|---|---|---|
| `app/src/components/auth/app-navigation.tsx` | Render a skeleton when `permissions.status` is `loading`/`idle`; render an inline error + Retry (`permissions.refreshPermissions()`) on `error`/`denied`/`maintenance`; only render "no items" when genuinely ready-and-empty. | Client (unchanged) | ⚠️ **SHARED** — also serves COMPANY_ADMIN/EMPLOYEE. Change is symmetric and strictly additive (adds states where there were none), so tenant roles gain the same improvement. Review as shared. |
| `app/src/components/auth/app-navigation.tsx` | Add `overflow-y-auto overscroll-contain` to the `<nav>` at line 127. Fixes RC-C. | Client (unchanged) | ⚠️ SHARED — benefits both shells. |
| `app/src/constants/routes.ts` | **Do not** change the `!== "ready"` guard at line 163 to leak links early. Leave the security posture; surface the state in the UI instead. | n/a (pure module) | ⚠️ SHARED |
| *(RC-B only)* `api/src/scripts/seed-super-admin.service.ts` / platform-tenant data | Ensure the super admin's tenant satisfies `slug === PLATFORM_TENANT_SLUG && isSystemTenant === true && status === "active"`; force re-login to mint a fresh JWT. | Backend | Backend, super-admin-only |

### Work Item B — full reloads

| File | Change | Component type | Shared? |
|---|---|---|---|
| `app/src/app/(dashboard)/super-admin/tenants/tenants-client.tsx` | Line 393: `<a href={...}>Open</a>` → `<Link href={...}>`. Lines 500 & 512: same for the two "Subscriptions page" links. Add `import Link from "next/link"`. | Client (unchanged) | ✅ Super-admin only |

### Work Item C — data fetching

| File | Change | Component type | Shared? |
|---|---|---|---|
| **NEW** `app/src/components/super-admin/use-platform-query.ts` | Parameterised query hook: serialises params to a stable key, refetches on key change (not on loader identity — sidesteps P-7), `keepPreviousData` so the table doesn't flash, `AbortController` per request. | Client hook | ✅ New file, no existing consumers |
| `app/src/components/super-admin/platform-ui.tsx` | **Leave `usePlatformData` in place, untouched.** Add `PlatformState`'s ability to render a subtle inline "refreshing" bar instead of full skeletons when previous data exists. | Client (unchanged) | ⚠️ **SHARED** — `app/(dashboard)/dashboard/audit/page.tsx` imports from here. See §6. |
| `app/src/app/(dashboard)/super-admin/subscriptions/page.tsx` | Move filter/status/page into server query params via `usePlatformQuery`; delete the in-memory `.slice()` at `:62` and the `pageSize: 100` cap at `:17`. | Client (unchanged) | ✅ Super-admin only |
| `app/src/app/(dashboard)/super-admin/payments/page.tsx` | Replace the hardcoded `{page:1,pageSize:50}` loader with `usePlatformQuery`; add prev/next controls. | Client (unchanged) | ✅ Super-admin only |
| `app/src/app/(dashboard)/super-admin/tenants/tenants-client.tsx` | Split the `Promise.all` at `:107-112` so paging refetches tenants only; load subscriptions once, or move the badge lookup server-side. | Client (unchanged) | ✅ Super-admin only |
| **NEW** `app/src/app/(dashboard)/super-admin/loading.tsx` | Segment-level skeleton for instant route-transition feedback. | **Server** (no `"use client"` — it is a static skeleton) | ✅ Super-admin only |
| *(later)* `refunds/page.tsx`, `entitlement/page.tsx`, `processing-overview/page.tsx` | Migrate onto `usePlatformQuery` to retire the three hand-rolled implementations (P-10). | Client (unchanged) | ✅ Super-admin only |

### Work Item D — sidebar scalability

| File | Change | Component type | Shared? |
|---|---|---|---|
| **NEW** `app/src/constants/platform-navigation.ts` | Grouped super-admin nav config (§4). Keeps the growing platform list out of the shared `routes.ts`. | n/a (pure module) | ✅ Super-admin only — **this is the key boundary win** |
| `app/src/constants/routes.ts` | Re-export a flattened view for backwards compatibility so `PLATFORM_TOPBAR_LINKS` (line 146) and existing tests keep working. | n/a | ⚠️ SHARED |
| `app/src/components/auth/app-navigation.tsx` | Render grouped sections with collapse; hoist `allHrefs` out of the `.map()` (P-9); persist collapse state in `localStorage`. | Client (unchanged) | ⚠️ SHARED — gate grouped rendering on `appContext === "platform"` so the tenant sidebar is untouched. |
| `app/src/components/auth/app-navigation-source.test.ts` | Update — it asserts on this file's source. | Test | ⚠️ Will fail if ignored |

---

## 4. Sidebar scalability approach

**Recommendation: keep it config-driven (it already is), but move super-admin nav into its own module
and add one level of grouping.**

`PLATFORM_SIDEBAR_LINKS` is already a data array mapped to components — that part is right and should
not be turned into hardcoded JSX. What it lacks is (a) grouping, (b) its own module boundary, and
(c) a scroll container.

### 4.1 New file: `app/src/constants/platform-navigation.ts`

```ts
import { Permission, type PermissionValue } from "@/types/api/permissions.types";

export type PlatformNavItem = {
  label: string;
  href: string;
  icon: string;
  requiredPermissions: readonly PermissionValue[];
  badge?: "beta" | "new";
};

export type PlatformNavGroup = {
  id: string;                    // stable key for localStorage collapse state
  label: string | null;          // null = ungrouped, rendered flat at the top
  icon?: string;
  defaultOpen?: boolean;
  items: readonly PlatformNavItem[];
};

export const PLATFORM_NAV_GROUPS: readonly PlatformNavGroup[] = [
  {
    id: "overview",
    label: null,
    defaultOpen: true,
    items: [
      { label: "Overview", href: "/super-admin", icon: "dashboard",
        requiredPermissions: [Permission.AUDIT_READ] },
    ],
  },
  {
    id: "customers",
    label: "Customers",
    icon: "business",
    defaultOpen: true,
    items: [
      { label: "Companies",      href: "/super-admin/companies", icon: "business",
        requiredPermissions: [Permission.COMPANY_SETTINGS_READ] },
      { label: "Platform Users", href: "/super-admin/users",     icon: "group",
        requiredPermissions: [Permission.USERS_READ] },
    ],
  },
  {
    id: "billing",
    label: "Billing & Plans",
    icon: "payments",
    items: [
      { label: "Packages",            href: "/super-admin/packages",      icon: "inventory_2",       requiredPermissions: [Permission.BILLING_READ] },
      { label: "Subscriptions",       href: "/super-admin/subscriptions", icon: "payments",          requiredPermissions: [Permission.BILLING_READ] },
      { label: "Payment Diagnostics", href: "/super-admin/payments",      icon: "receipt_long",      requiredPermissions: [Permission.BILLING_READ] },
      { label: "Refund Reviews",      href: "/super-admin/refunds",       icon: "currency_exchange", requiredPermissions: [Permission.BILLING_READ] },
      { label: "Quota Overrides",     href: "/super-admin/entitlement",   icon: "tune",              requiredPermissions: [Permission.BILLING_MANAGE] },
    ],
  },
  {
    id: "operations",
    label: "Operations",
    icon: "manufacturing",
    items: [
      { label: "Processing Jobs",     href: "/super-admin/jobs",                 icon: "manufacturing",     requiredPermissions: [Permission.DOCUMENTS_READ] },
      { label: "Processing Overview", href: "/super-admin/processing-overview",  icon: "monitoring",        requiredPermissions: [Permission.DOCUMENTS_READ] },
      { label: "System Health",       href: "/super-admin/system-health",        icon: "health_and_safety", requiredPermissions: [Permission.COMPANY_SETTINGS_READ] },
    ],
  },
  {
    id: "intelligence",
    label: "AI & Analytics",
    icon: "psychology",
    items: [
      { label: "AI Configuration",      href: "/super-admin/ai-configuration",  icon: "psychology", requiredPermissions: [Permission.COMPANY_SETTINGS_READ] },
      { label: "Retrieval Debug",       href: "/super-admin/retrieval-debug",   icon: "search",     requiredPermissions: [Permission.COMPANY_SETTINGS_READ] },
      { label: "Usage & Costs",         href: "/super-admin/usage",             icon: "monitoring", requiredPermissions: [Permission.ANALYTICS_READ] },
      { label: "AI Analytics Deep Dive",href: "/super-admin/analytics",         icon: "analytics",  requiredPermissions: [Permission.ANALYTICS_READ] },
    ],
  },
  {
    id: "governance",
    label: "Governance",
    icon: "policy",
    items: [
      { label: "Security & Audit", href: "/super-admin/audit",    icon: "policy",   requiredPermissions: [Permission.AUDIT_READ] },
      { label: "Global Settings",  href: "/super-admin/settings", icon: "settings", requiredPermissions: [Permission.COMPANY_SETTINGS_READ] },
    ],
  },
];

/** Back-compat flat view: keeps PLATFORM_TOPBAR_LINKS and existing tests working. */
export const PLATFORM_NAV_ITEMS = PLATFORM_NAV_GROUPS.flatMap((g) => g.items);
```

**Adding a new item is now a 4-line object in one array** — safe for a second model to extend without
touching render logic. That is exactly the property you asked for.

### 4.2 Rendering rules the implementer must follow

1. **Scroll container** — the `<nav>` gets `flex-1 overflow-y-auto overscroll-contain`; the footer stays
   pinned via the existing `mt-auto`. Non-negotiable (RC-C).
2. **Filter groups, then drop empties** — apply the existing permission filter per item; a group whose
   items all filter out must not render its header.
3. **Auto-open the active group** on mount so a deep link never lands in a collapsed section.
4. **Persist collapse state** in `localStorage` under `platform-nav:<groupId>`. Read it in an *effect*,
   not during render — reading `localStorage` during render causes a hydration mismatch.
5. **Hoist the active-href computation** out of the map (P-9): build `allHrefs` once with `useMemo`.
6. **Don't lazy-render.** At this scale (~30–60 items) virtualisation adds bugs and buys nothing;
   grouping plus a scroll container is the correct ceiling. Revisit past ~150 items.
7. **Gate on context** — `appContext === "platform"` uses grouped rendering; the tenant sidebar keeps
   the existing flat render. This is what keeps the change off other roles.

### 4.3 Also fix while you're in there
`app-navigation.tsx:161-167` — "Help Center" is `<Link href="#">`, a dead link that scrolls to top.
Point it somewhere real or remove it.

---

## 5. Verification steps

### 5.1 Triage first (90 seconds, do this before writing code)

Log in as SUPER_ADMIN, land on `/super-admin`, open DevTools:

| Observation | Cause | Go to |
|---|---|---|
| Sidebar shell (logo + Logout) visible, **zero links**, page body renders normally | **RC-A** | A1 |
| Sidebar empty **and** body shows "Access denied" card | **RC-B** | A3 |
| Links present but cut off at the bottom / no scrollbar / Logout missing | **RC-C** | A2 |
| No `<aside>` in the DOM at all | `auth.status !== "authenticated"` (`app-navigation.tsx:45`) — check `/auth/me` | RC-C notes |
| Console shows a React error overlay | Provider crash — capture the stack, re-triage | — |

Then confirm on the Network tab: **`GET /permissions/me` → what status?**
`200` = RC-A (slow/late). `403` = RC-B. Failed/pending = auth chain.

### 5.2 Per-fix verification

**A1 — nav states**
- Throttle to Slow 3G → sidebar shows a *skeleton*, never a silently blank panel.
- Block `/permissions/me` in DevTools (Network → Block request URL) → sidebar shows an error + Retry;
  clicking Retry refires the request.
- Restore → all 17 links appear.

**A2 — overflow (RC-C)**
- Resize viewport to 700px tall → nav scrolls internally, **Logout stays pinned and visible**.
- Temporarily double the config array → still scrolls, no clipping, page body does not scroll.

**A3 — RC-B only**
- `db.tenants.findOne({_id: <superAdmin.tenantId>})` → asserts `slug === PLATFORM_TENANT_SLUG`,
  `isSystemTenant === true`, `status === "active"`.
- Re-login, then `GET /permissions/me` → `200` with `baseRole: "SUPER_ADMIN"`.

**B1 — no more full reloads** ⭐ this is your Network-tab check
- Network tab, filter **Doc**, click "Open" on a company row.
- **PASS:** zero new Doc-type requests; only XHR/Fetch to `/api/...`. No blank flash. No spinner in the browser tab.
- **FAIL:** a `document` request for `/super-admin/companies/<id>` appears → an `<a>` tag survived.
- Corroborate: `performance.getEntriesByType("navigation").length` stays `1` across the whole click-through.

**C1/C2 — real pagination**
- Network tab, click "Next" on Subscriptions.
- **PASS:** exactly one XHR carrying `page=2`; **no Doc request**; the table body updates while
  headers/filters stay mounted.
- **FAIL:** no network request at all → still slicing in memory (P-3).
- Seed >100 tenants and confirm the subscriptions page no longer silently truncates.

**C3 — no flash on refetch**
- Click "Next", record with the Performance panel (or just watch): the old rows must stay visible,
  dimmed, until new data lands. No content→skeleton→content transition.

**C4 — loading.tsx**
- Navigate between two super-admin routes on Slow 3G → skeleton appears instantly, no dead time.

**D1/D2 — grouped sidebar**
- All previously-reachable routes still reachable; count links = count of permitted config items.
- Deep-link to `/super-admin/refunds` → "Billing & Plans" is auto-expanded and "Refund Reviews" has `aria-current="page"`.
- Collapse a group, reload → stays collapsed, and no hydration warning in console.
- Keyboard-only: Tab reaches every group header and item; Enter/Space toggles.

**Regression guard for every item above (mandatory):**
Log in as **COMPANY_ADMIN** and as **EMPLOYEE**, confirm `/dashboard` sidebar is visually and
behaviourally unchanged. Then `npm test` — `app-navigation-source.test.ts` and
`refunds/page.test.tsx` both assert on files in scope.

---

## 6. Module boundary check

### ✅ Super-Admin-only — safe to change freely
```
app/src/app/(dashboard)/super-admin/**          (all pages, incl. tenants-client.tsx)
app/src/services/super-admin.service.ts
app/src/types/api/super-admin.types.ts
app/src/types/api/platform.types.ts
app/src/services/entitlement.service.ts
app/src/constants/platform-navigation.ts        (new)
```
Note `tenants-client.tsx` lives under `.../super-admin/tenants/` but is imported by
`.../super-admin/companies/page.tsx:2`. Both consumers are super-admin. Safe.

### ⚠️ SHARED — review separately before handing to an implementer

| File | Also used by | Risk |
|---|---|---|
| **`app/src/components/super-admin/platform-ui.tsx`** | **`app/(dashboard)/dashboard/audit/page.tsx`** — a **tenant** page | ⭐ **The trap.** Despite living in `components/super-admin/`, this is *not* super-admin-only. Changing `usePlatformData`'s signature breaks the tenant audit page. **This is why C1 adds a new hook instead of modifying the old one.** |
| `app/src/components/auth/app-navigation.tsx` | `/dashboard/*` for COMPANY_ADMIN + EMPLOYEE | Every sidebar change lands on all roles. Gate grouped rendering behind `appContext === "platform"`. |
| `app/src/app/(dashboard)/layout.tsx` | All dashboard roles | Don't restructure; only super-admin pages need it as-is. |
| `app/src/constants/routes.ts` | Sidebar + TopNavBar + both shells | Keep `filterNavigationLinks` and `TENANT_SIDEBAR_LINKS` untouched. |
| `app/src/components/ui/TopNavBar.tsx` | All dashboard roles | Consumes `PLATFORM_TOPBAR_LINKS = PLATFORM_SIDEBAR_LINKS.slice(0,3)` (`routes.ts:146`) — **regrouping silently changes which 3 links appear in the top bar.** Pin it explicitly. |
| `app/src/components/ui/DashboardPage.tsx` | All dashboard roles | No changes needed. |
| `app/src/services/platform.service.ts` | Also `app/(platform)/platform/tenants/[id]/page.tsx` | `listTenants` is shared with the separate `(platform)` shell. Additive params only. |
| `app/src/providers/*`, `components/auth/auth-guard.tsx`, `permission-boundary.tsx` | Entire app | Out of scope. Do not touch. |

### Note: a second, parallel super-admin shell exists
`app/src/app/(platform)/platform/**` is a *separate* SUPER_ADMIN-gated area with its **own header and
no sidebar** (`(platform)/platform/layout.tsx`). `getRoleHome("SUPER_ADMIN")` returns `/super-admin`
(`lib/role-home.ts:8`), so `(dashboard)/super-admin` is the live one. **Confirm `(platform)` is dead
code before investing anywhere near it** — see Q3.

---

## 7. Open questions — please answer before implementation starts

**Q1 · Which sidebar symptom do you actually see?** (RC-A vs RC-B vs RC-C)
Run the §5.1 triage. The three have different fixes and I could not reproduce at runtime. This is the
one answer that most changes the work.

**Q2 · Where are the "slides/carousels"?** ⚠️
I searched the entire `app/src` tree for `carousel|slide|Carousel|Slide` and found **no carousel or
slide component anywhere in the Super Admin module** — the only matches are in i18n translation files
and unrelated tenant components. Everything in super-admin is tables and forms. Did you mean the
**paginated tables** (Companies / Subscriptions / Refunds), a component that isn't merged yet, or
something on a different route? I've planned for the tables; point me at the carousel if one exists.

**Q3 · Is `app/src/app/(platform)/platform/**` dead code?**
It's a second SUPER_ADMIN area with a different shell. If live, it needs its own nav decision; if dead,
it should be deleted — it currently makes the module boundary ambiguous and imports the shared
`platform.service.ts`.

**Q4 · Which new items are you adding, and to which groups?**
The §4.1 grouping is my proposal based on the existing 17 routes. Send me the new list and I'll slot
them in — the group taxonomy should be settled *before* D1, not retrofitted after.

**Q5 · Do the backend list endpoints already accept `page`/`pageSize`?**
`listTenants` and `listPaymentEvents` clearly do. I did **not** verify `listSubscriptions`,
`listPackages`, or `listPlatformUsers` — C2 assumes server-side pagination exists for subscriptions.
If it doesn't, C2 grows an API task. Worth a 5-minute check on `api/src/modules/**` before scheduling.

---

## Appendix — reference implementations

These are templates for the implementer, matching existing codebase conventions.

### A · `usePlatformQuery` (new file, sidesteps P-7 and P-5)

```ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Parameterised sibling of usePlatformData.
 *
 * Keys refetches off a serialised param object rather than the loader's identity,
 * so an inline arrow loader is safe (usePlatformData would infinite-loop).
 * Keeps previous data visible during refetch so paging does not flash.
 */
export function usePlatformQuery<TParams, TData>(
  loader: (params: TParams, signal?: AbortSignal) => Promise<{ data: TData }>,
  params: TParams,
) {
  const key = JSON.stringify(params);
  const [data, setData] = useState<TData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  // Refs keep the effect keyed on `key` alone.
  const loaderRef = useRef(loader);
  const paramsRef = useRef(params);
  loaderRef.current = loader;
  paramsRef.current = params;
  const hasData = useRef(false);

  const run = useCallback(async (signal?: AbortSignal) => {
    if (hasData.current) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const response = await loaderRef.current(paramsRef.current, signal);
      if (signal?.aborted) return;
      setData(response.data);
      hasData.current = true;
    } catch {
      if (!signal?.aborted) setError("Unable to load platform data. Please try again.");
    } finally {
      if (!signal?.aborted) { setLoading(false); setRefreshing(false); }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void run(controller.signal);
    return () => controller.abort();
  }, [key, run]);

  return { data, loading, refreshing, error, reload: () => run() };
}
```

### B · Grouped nav section (replaces the flat `.map()` at `app-navigation.tsx:127-158`)

```tsx
// Hoisted once per render — fixes the O(n²) at line 129.
const allHrefs = useMemo(() => visibleGroups.flatMap(g => g.items.map(i => i.href)), [visibleGroups]);

<nav className="mt-md flex-1 space-y-1 overflow-y-auto overscroll-contain px-md">
  {visibleGroups.map((group) => (
    <div key={group.id}>
      {group.label ? (
        <button
          type="button"
          onClick={() => toggle(group.id)}
          aria-expanded={isOpen(group.id)}
          aria-controls={`nav-group-${group.id}`}
          className="flex w-full items-center gap-2 px-4 py-2 text-label-sm font-bold uppercase tracking-wider text-on-surface-variant hover:bg-surface-container-high"
        >
          {group.icon ? (
            <span className="material-symbols-outlined text-[18px]">{group.icon}</span>
          ) : null}
          <span className="min-w-0 flex-1 truncate text-start">{group.label}</span>
          <span className={`material-symbols-outlined text-[18px] transition-transform ${isOpen(group.id) ? "rotate-180" : ""}`}>
            expand_more
          </span>
        </button>
      ) : null}
      {(!group.label || isOpen(group.id)) ? (
        <div id={`nav-group-${group.id}`} className="space-y-1">
          {group.items.map((item) => (
            <NavItem key={item.href} item={item} allHrefs={allHrefs} onClose={onClose} />
          ))}
        </div>
      ) : null}
    </div>
  ))}
</nav>
```

> `NavItem` keeps the exact active-state and className logic currently at
> `app-navigation.tsx:130-156` — extract it verbatim, don't rewrite the styling.
