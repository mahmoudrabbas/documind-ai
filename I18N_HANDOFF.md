# Arabic (ar) + RTL support — implementation handoff

Status: **partially implemented, entirely unverified.**

The i18n foundation is built and roughly 40 files are converted. Roughly 100 UI
files still contain hardcoded English. **No build, typecheck, test, or lint has
ever run against any of this work** — the toolchain was unavailable for the whole
session. Treat step 0 below as mandatory before writing new code.

---

## 0. Do this first

```bash
cd app
npx tsc --noEmit          # never run — expect real errors
npx vitest run            # never run
npm run lint              # never run
git diff --name-only      # authoritative list of what was touched
```

`git diff --name-only` is the source of truth for the file list. The inventory in
section 4 is written from memory after a context compaction and may be incomplete.

Fix whatever `tsc` reports before continuing. Section 5 lists the three changes
most likely to have broken something.

---

## 1. Original constraints (do not violate)

From the original request — these shaped every decision and still apply:

- UI/presentation layer only. No changes to business logic, API calls, data
  handling, state management, routing logic, or backend.
- No renaming of variables, functions, endpoints, or data structures. No changes
  to conditionals, validation rules, or calculations.
- All internal identifiers (object keys, IDs, DB fields, enum codes) stay English.
  Only displayed text changes.
- Translations live in dictionary files. Never inline a translated string in a
  component.
- Language persists across reloads.
- Arabic uses a script-appropriate font (Cairo).
- Where a component compared or built display text inside logic, move only the
  display string out. Behaviour must stay byte-identical.

---

## 2. Architecture as built

Read these files before writing anything; the shapes below are from memory and
the files are authoritative.

| File | Role |
|---|---|
| `app/src/lib/i18n/translations/en.ts` | English base dictionary — **flat, dot-namespaced keys** (`"common.save": "Save"`) |
| `app/src/lib/i18n/translations/ar.ts` | Arabic base dictionary, same keys |
| `app/src/lib/i18n/translations/{en,ar}.shell.ts` | Per-area modules: nav labels, top bar, shared component defaults |
| `app/src/lib/i18n/translations/{en,ar}.documents.ts` | Per-area module (mostly empty — to be filled) |
| `app/src/lib/i18n/translations/{en,ar}.dashboard.ts` | Per-area module (mostly empty — to be filled) |
| `app/src/lib/i18n/translations/{en,ar}.superAdmin.ts` | Per-area module (mostly empty — to be filled) |
| `app/src/lib/i18n/translations/{en,ar}.account.ts` | Per-area module (mostly empty — to be filled) |
| `app/src/lib/i18n/translations/index.ts` | Merges base + all modules into `dictionaries[locale]` |
| `app/src/lib/i18n/i18n.utils.ts` | `t(dictionary, key, params)` — returns the key itself on a miss; `tPlural(...)` |
| `app/src/lib/i18n/code-label.ts` | `codeLabel(t, namespace, code)` + `humanizeCode(code)` |
| `app/src/providers/i18n-provider.tsx` | `I18nProvider`, `useI18n()`, `useDirection()`, `useIntlLocale()` |
| `app/src/components/ui/LanguageSwitcher.tsx` | EN/AR toggle |
| `app/src/app/fonts.ts` | Cairo via `next/font`, exposed as `--font-arabic` |
| `app/src/app/layout.tsx` | Reads locale cookie, sets `<html lang dir>` |
| `app/src/app/globals.css` | `html[dir="rtl"] body` font rule |

**Keys are flat and dot-namespaced, not nested objects.** The empty per-area
modules exist so several people (or agents) can add keys in parallel without
colliding in one large file. Pick the module matching the area you are working
on; a key must never be defined in two modules.

`t()` returns the key itself when it is missing — so a typo renders
`dashboard.tittle` on screen and nothing fails. This is why the key-coverage
test in §6e matters.

### Direction and locale are server-rendered

The root layout reads the locale cookie and sets `lang` / `dir` on `<html>`
directly, so there is no flash of wrong direction and no layout shift. Keep it
that way — do not move direction handling into a client `useEffect`.

### The font rule is in `@layer base` on purpose

`globals.css` sets the Arabic stack via `html[dir="rtl"] body`, not by
redefining `--font-sans`. Two reasons, both load-bearing:

1. `@theme inline` bakes `--font-sans` into `.font-sans` as a literal value, so
   redefining the variable later has no effect.
2. The root layout deliberately does **not** put `font-sans` on `<body>` — a
   utility class would outrank the base-layer rule.

If you "clean this up," Arabic silently renders in the Latin font.

### `codeLabel` — for enum-derived labels

Enum codes stay English in data; only the label is translated. Unmapped codes
degrade to humanized English (`PAST_DUE` → `Past Due`), never to a blank or a
leaked dotted key. Tests: `app/src/lib/i18n/__tests__/code-label.test.ts`.

---

## 3. The badge trap — read before touching any `<Badge>`

This is the single highest-risk thing in the codebase and it fails **silently**.

`app/src/components/ui/variants.ts` maps *lowercased display text* to a colour:

```ts
const STATUS_WORD_MAP = { ready: "success", processing: "warning", failed: "error", ... }
```

`resolveBadgeStatus()` looks up that string and falls back to `"neutral"` when it
misses. `<Badge>` historically rendered `{children ?? status}` — so the same
string was both the colour key and the visible text.

**Translate a badge's text and the pill turns grey. No error, no failing test.**

The fix already applied: `<Badge>` gained a `label?: ReactNode` prop and renders
`{label ?? children ?? status}`.

**The rule for all remaining work:**

```tsx
// WRONG — a translated string reaching `status` kills the colour
<Badge status={t("...")} />
<Badge status={row.status}>{t("...")}</Badge>

// RIGHT — colour from the untranslated code, text via `label`
<Badge
  status={SUBSCRIPTION_BADGE_STATUS[sub.status] ?? "neutral"}
  label={codeLabel(t, "billing.subscriptionStatus", sub.status)}
/>
```

`status` must resolve to one of `success | warning | error | info | neutral`,
always derived from an explicit code map. `SUBSCRIPTION_BADGE_STATUS` in
`variants.ts` is the reference example.

`resolveBadgeStatus`, `STATUS_WORD_MAP`, and `getBadgeClasses` were left
**untouched** — they are public API covered by existing tests. Do not refactor
them as part of this work.

Guard test: `app/src/components/ui/__tests__/badge-status-coupling.test.ts`
scans source for raw API fields passed as `status`. It has **never been run.**

---

## 4. What is already done

Verify against `git diff --name-only`; this list is from memory.

**Infrastructure**
- Dictionaries, `t()`, `I18nProvider` / `useI18n()`, `LanguageSwitcher`
- Cookie persistence + server-rendered `lang`/`dir`
- Cairo font wired via `next/font`
- `codeLabel()` / `humanizeCode()` + unit tests
- `tPlural()` using `Intl.PluralRules` (Arabic has 6 plural categories; `n === 1`
  logic is wrong for it)
- `useIntlLocale()` → `ar-EG-u-nu-latn` (Arabic month names, **Latin digits** —
  a deliberate choice for a B2B dashboard full of IDs and amounts)
- `formatDate` / `formatMonthYear` took an optional trailing `locale` param
  (defaulted, so existing callers are unaffected)
- `getRelativeTimeParts()` and `getFileSizeParts()` — return keys, not English

**Converted UI**
- `TopNavBar`, `app-navigation` (sidebar), `Modal` / `ConfirmDialog`,
  `FileDropzone`, `ProgressBar`
- `routes.ts`: all 31 nav links carry `labelKey`; `label`, `href`, and
  `requiredPermissions` unchanged. `filterNavigationLinks()` untouched.
- `SubscriptionWidget` + `checkout/page.tsx` badges via `codeLabel`

**RTL sweep — complete**
- `ml-/mr-/pl-/pr-` → `ms-/me-/ps-/pe-`, `text-left/right` → `text-start/end`,
  `left-/right-` → `start-/end-`
- `rtl:rotate-180` on directional chevrons/arrows
- `SELECT_CLASSES` chevron: `rtl:bg-[left_8px_center]` (it is a background
  image, so `pe-10` alone left it on the wrong side)
- `ProgressBar` sets `dir` on the track so the inline-`width` fill anchors
  correctly

**Deliberately left alone**
- `space-x-*` — already logical in Tailwind v4
- Charts, PDF canvas overlay, code blocks — forced/left LTR by design
- `AuthHeroPanel` — decorative; cards are pinned to a fixed 600×600 SVG
  connector path, and it is a server component. Translating it means a
  client-component conversion, i.e. an architecture change.

---

## 5. Known risks — check these first

1. **`tPlural` vs. test mocks.** `tPlural` was added as a **required** field on
   `I18nContextValue`. At least three test files mock `useI18n` without it:
   `SubscriptionWidget.test.tsx`, `CompanyBillingPage.test.tsx`,
   `refunds/page.test.tsx` (and a `QualityPanel` test). `vi.mock` factories are
   not type-checked against the real module, so this *should* compile — but it
   was never confirmed. If `tsc` complains, add `tPlural` to the mocks rather
   than making the field optional (optional would force `tPlural?.()` at every
   call site).
2. **`cookies()` in the root layout** makes every route dynamic. Near-zero cost
   here (authenticated dashboard, client layouts throughout), but it is a
   rendering-strategy change and should be a conscious decision.
3. **Dictionary module split.** `translations/index.ts` was refactored to merge
   several per-area modules. A duplicate key across modules silently resolves to
   the last spread. There is a guard test
   (`__tests__/translation-modules.test.ts`) — **never run.**
4. Removing `font-sans` from `<body>` is required for the Arabic font (see §2).
   Behaviour-neutral in English, but it is an edit to a shared shell element.

---

## 6. Remaining work

### 6a. Translate ~100 files

Largest clusters: `components/documents/**`, the tenant dashboard pages
(`users`, `roles`, `knowledge-gaps`, `audit`, `emails`, `analytics`), and the
~24-page `super-admin/**` subtree (currently 100% English).

Per-file recipe:

1. Confirm the file already has `"use client"`. **If it is a server component,
   stop and flag it** — converting it is an architecture change, not translation.
2. `const { t } = useI18n();`
3. Replace visible text only: JSX text, `placeholder`, `title`, `aria-label`,
   `alt`, label props.
4. **Never touch:** object keys, `<option value=>`, input `name=`, `href`,
   permission constants, React `key=`, or any string literal used in a comparison.
5. Add the key to **both** `en.ts` and `ar.ts` in the same change — the parity
   test fails otherwise. That test is the safety net; keep it green.
6. Interpolate with `{{param}}`; never concatenate sentence fragments (word order
   differs in Arabic).
7. Counts go through `tPlural`, not `n === 1 ? ... : ...`.

### 6b. Remaining `codeLabel` sites

~20 places still derive labels by string-munging an enum
(`.replaceAll("_", " ")`, `.charAt(0).toUpperCase()`): `DocumentPolicyPanel`,
`PolicyEditor`, `ProcessingStatusBadge`, `audit-formatters.ts`, the users pages.
Replace the **display** with `codeLabel`; leave the codes and every comparison
exactly as they are.

### 6c. Locale-aware formatting

~85 bare `.toLocaleDateString()` / `.toLocaleString()` calls still use the
*browser* locale. Thread `useIntlLocale()` through them. Also update
`CompanyBillingPage` from hardcoded `"ar-EG"` to the shared constant — note this
visibly changes its digits from Arabic-Indic to Latin, which is the intended
decision.

### 6d. Error messages — scope boundary

~70 sites do `err instanceof Error ? err.message : "English fallback"`.

**Translate only the English literal.** Leave `err.message` alone — it comes from
the API, and localizing it is a backend change (`api-client.ts` already sends
`Accept-Language`; the server does not yet honour it). This was an explicit
scope decision, not an oversight. Arabic users will keep seeing English API
errors until the backend is updated. Worth tracking separately.

### 6e. Tests to actually run

- Existing: en/ar key parity, no-empty-values
- New but never executed: `code-label.test.ts`,
  `badge-status-coupling.test.ts`, `translation-modules.test.ts`
- Worth adding: assert every literal `t("...")` key exists in `en` (a typo
  currently renders the raw key on screen with nothing failing)
- Playwright: set the locale cookie before navigation and assert
  `html[dir] === "rtl"` **on first paint**

### 6f. Manual RTL pass

Check both languages: sidebar mirrors and the drawer slides from the correct
edge; chevrons point the right way; progress bars fill from the correct edge;
charts still read left-to-right with un-mirrored axes; no tofu glyphs; Latin
runs inside Arabic paragraphs still render sensibly; an Arabic chat reply reads
RTL inside an English UI and vice versa.

**RTL bugs are invisible in English.** Every converted file needs a look in both
directions.

