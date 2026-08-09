# Arabic (ar) + RTL Support — Execution Brief

> **Audience: the AI agent implementing this.** You have no prior context on this
> work. Everything you need is in this document plus the files it names. Read it
> end-to-end before running anything.

---

## 0. How to use this document

Work the phases in §6 **in order**. Each is independently shippable — stop after
any one and the branch is still coherent.

Before you start, read in this order:

1. This document, end to end.
2. `I18N_HANDOFF.md` (repo root) — deeper per-area detail and rationale.
3. `app/AGENTS.md` — the Next.js version warning in §1 is not boilerplate.

Three sections are load-bearing and cause **silent, invisible-in-English**
breakage if skipped: **§3** (hard constraints), **§4** (the badge trap), and
**§2's** three design decisions that look like bugs but are not.

---

## 1. Context — why this exists

`documind-ai` is an English-only B2B document-intelligence dashboard. It is being
given **Arabic language support with full RTL layout**.

The i18n foundation is **already built and committed** on branch
`feature/arabic-language-support` (WIP commit `d020972`). 62 components and pages
are already wired to the `useI18n()` hook, and both dictionaries are populated.

**The critical fact:** no build, typecheck, test, or lint has *ever* been run
against any of this code. The toolchain was unavailable for the entire authoring
session, and a tooling outage blocked it again in the follow-up session. The code
is written but a compiler has never seen it. Four test files were authored blind
and have never executed.

Your job: **verify the existing work compiles and passes, then finish the
remaining ~100 English-only UI files.**

**Repo root:** `C:\Users\abdal\Downloads\documind-ai`
**All commands run from:** `app/` (the Next.js app lives there, not at repo root)

**Stack — note the versions:**

| | |
|---|---|
| Next.js | **16.2.10** — has breaking changes vs. most training data. `cookies()` is async and must be awaited. See `app/AGENTS.md`; consult `node_modules/next/dist/docs/` before writing Next-specific code. |
| React | 19.2.4 — context uses `<Context value={…}>`, not `<Context.Provider>` |
| TypeScript | ^6.0.3 |
| Tailwind CSS | v4 — `@theme inline`, logical properties (`ms-`/`me-`/`ps-`/`pe-`) |
| Vitest | ^4.1.10 |

**Companion document:** `I18N_HANDOFF.md` at the repo root has deeper per-area
detail. Read it. **Caveat:** its §4 "what is done" inventory was written from
memory after a context compaction and is *not* authoritative —
`git diff --name-only master` is.

---

## 2. Architecture as built

Read these before writing code. The files are authoritative; this table orients you.

| File (under `app/src/`) | Role |
|---|---|
| `lib/i18n/translations/en.ts`, `ar.ts` | Base dictionaries, ~480 keys each |
| `lib/i18n/translations/{en,ar}.shell.ts` | Nav, top bar, shared components (52 keys) |
| `lib/i18n/translations/{en,ar}.documents.ts` | Documents area (~230 keys) |
| `lib/i18n/translations/{en,ar}.dashboard.ts` | Tenant dashboard — **currently empty** |
| `lib/i18n/translations/{en,ar}.superAdmin.ts` | Platform admin (10 keys) |
| `lib/i18n/translations/{en,ar}.account.ts` | Account/auth/checkout — **currently empty** |
| `lib/i18n/translations/index.ts` | Merges base + 5 modules per locale via `Object.assign` |
| `lib/i18n/i18n.utils.ts` | `t()`, `tPlural()`, cookie get/set |
| `lib/i18n/i18n.config.ts` | Locales, `INTL_LOCALES`, `getDirection()`, cookie name |
| `lib/i18n/code-label.ts` | `codeLabel()`, `humanizeCode()` |
| `providers/i18n-provider.tsx` | `I18nProvider`, `useI18n`, `useDirection`, `useIntlLocale` |
| `components/ui/variants.ts` | Badge color maps — **see §4, read before touching any badge** |
| `app/layout.tsx` | Reads locale cookie server-side, sets `<html lang dir>` |
| `app/globals.css` | `html[dir="rtl"] body` Arabic font rule |
| `app/fonts.ts` | Cairo via `next/font/google`, exposed as `--font-arabic` |

### The API you will use

```ts
const { t, tPlural, locale, dir, setLocale } = useI18n();
const intlLocale = useIntlLocale();   // "en-US" | "ar-EG-u-nu-latn"

t("documents.save")                            // → "Save"
t("documents.ruleNumber", { number: "3" })     // {{number}} interpolation
tPlural("documents.rulesInDraft", count)       // Intl.PluralRules-based
codeLabel(t, "billing.subscriptionStatus", code)  // enum code → translated label
```

**Keys are flat and dot-namespaced** (`"documents.save": "Save"`), never nested
objects. `tPlural` and `INTL_LOCALES` are **not** re-exported from the barrel —
import them from `lib/i18n/i18n.utils` and `lib/i18n/i18n.config` directly.

### Three design decisions that look like bugs — do not "fix" them

1. **`t()` returns the key itself on a miss.** A typo renders
   `dashboard.tittle` on screen and nothing throws. This is intentional (nothing
   crashes in production) and is exactly why Phase 3's guardrail test matters.

2. **`ar-EG-u-nu-latn` = Arabic month names with *Latin* digits.** Deliberate for
   a B2B dashboard full of invoice amounts and IDs that mixed-language finance
   teams must read. Do not switch it to Arabic-Indic numerals.

3. **The Arabic font is applied via `html[dir="rtl"] body` in `globals.css`, and
   `<body>` deliberately has no `font-sans` class.** Two load-bearing reasons:
   Tailwind v4's `@theme inline` bakes `--font-sans` into `.font-sans` as a
   literal (so redefining the variable later does nothing), and a utility class
   on `<body>` would outrank the base-layer rule. "Cleaning this up" makes Arabic
   silently render in the Latin font.

---

## 3. Hard constraints — violating these breaks the app

**This is a UI/presentation-layer change only.**

- **Do not** touch business logic, API calls, data handling, state management,
  routing, or anything backend.
- **Do not** rename variables, functions, endpoints, data structures, object
  keys, IDs, DB fields, or enum codes. **Machine codes stay English forever** —
  only their human-visible labels get translated.
- **Do not** change conditionals, validation rules, or calculations. Where a
  component builds display text inside logic, move *only* the display string out.
  Behavior must stay byte-identical.
- Translations live **only** in dictionary files. Never inline an Arabic string
  in a component.
- **Never translate** `<option value=>`, input `name=`, `href`, React `key=`,
  permission constants, or any string literal used in a comparison.
- **`err.message` from the API stays untranslated.** ~70 sites do
  `err instanceof Error ? err.message : "English fallback"` — translate *only*
  the English literal. Localizing API errors is a backend change and is out of
  scope. Arabic users will see English API errors until the backend honors
  `Accept-Language`.
- **Do not** refactor `resolveBadgeStatus`, `STATUS_WORD_MAP`, or
  `getBadgeClasses` in `components/ui/variants.ts` — public API with existing tests.
- **Do not** move direction handling into a client `useEffect`. It is
  server-rendered from the cookie specifically to prevent an RTL flash.
- **Do not** remove the `html[dir="rtl"] body` rule or add `font-sans` to `<body>`.

**If a file is a server component, stop and flag it.** Converting it to a client
component to add `useI18n()` is an architecture change, not translation. (Known
example: `AuthHeroPanel` — decorative, pinned to a fixed 600×600 SVG connector
path, deliberately left alone.)

---

## 4. The badge trap — read before touching any `<Badge>`

**This is the highest-risk thing in the codebase and it fails silently.**

`components/ui/variants.ts` maps *lowercased display text* to a color:

```ts
const STATUS_WORD_MAP = { ready: "success", processing: "warning", failed: "error", … }
```

`resolveBadgeStatus()` looks that string up and falls back to `"neutral"` on a
miss. Historically `<Badge>` rendered `{children ?? status}` — so the same string
was both the color key **and** the visible text.

**Translate a badge's text and the pill turns grey. No error. No failing test.
Invisible in English.**

`<Badge>` has since gained a `label?: ReactNode` prop and renders
`{label ?? children ?? status}`. The rule for all remaining work:

```tsx
// WRONG — a translated string reaching `status` kills the color
<Badge status={t("documents.ready")} />
<Badge status={row.status}>{t("documents.ready")}</Badge>

// RIGHT — color from the untranslated code map, text via `label`
<Badge
  status={SUBSCRIPTION_BADGE_STATUS[sub.status] ?? "neutral"}
  label={codeLabel(t, "billing.subscriptionStatus", sub.status)}
/>
```

`status` must always resolve to `success | warning | error | info | neutral`,
derived from an explicit code map. `SUBSCRIPTION_BADGE_STATUS` in `variants.ts`
is the reference example.

---

## 5. Already verified — do not redo

Confirmed by direct file reading in a prior session. Trust these:

- **en/ar parity is perfect across all six module pairs** — key-for-key
  identical. `en.ts`/`ar.ts` (~480 keys), `.shell` (52), `.documents` (~230),
  `.superAdmin` (10), `.dashboard` and `.account` (both intentionally empty). No
  drift, no orphans.
- **The plural-separator bug is genuinely fixed.** `documents.rulesInDraft` is
  the *only* real `tPlural` call site in the codebase
  (`components/documents/PolicyEditor.tsx:269`). It defines all six CLDR
  categories with dotted separators in both locales, including the Arabic dual
  form `قاعدتان`. (Background: it originally shipped as i18next-style
  `rulesInDraft_one`/`_other`, which made both the category lookup *and* the
  `.other` fallback miss, rendering the literal string
  `documents.rulesInDraft.other` on screen in both languages.)
- **The module merge works.** `translations/index.ts` merges flat, so
  `dashboard.*` keys resolve from the base dictionary even though
  `en.dashboard.ts` is empty.
- **Badge `label` prop, server-rendered `lang`/`dir`, and the `globals.css` font
  rule** are all present and correct.
- **The RTL class sweep is complete**: `ml-/mr-/pl-/pr-` → `ms-/me-/ps-/pe-`,
  `text-left/right` → `text-start/end`, `left-/right-` → `start-/end-`,
  `rtl:rotate-180` on directional chevrons. `space-x-*` was correctly left alone
  (already logical in Tailwind v4). Charts, the PDF canvas overlay, and code
  blocks are deliberately forced LTR.

**Still unverified — only the compiler can check it:** whether every `t("…")`
literal across ~80KB of call sites resolves to a real key. Phase 3 adds the test
that closes this.

---

## 6. Execution phases

Phases are ordered and independently shippable. Stop after any phase and the
branch is still coherent. **Run the verification gate after each one.**

### Phase 0 — Clear the gate (MANDATORY, blocks everything)

```bash
cd app
git diff --name-only master   # authoritative inventory of what was touched
npx tsc --noEmit              # never run — expect real errors
npx vitest run                # never run
npm run lint                  # never run
```

Fix everything `tsc` reports **before writing any new code.**

Four test files have never executed and are your highest-value signal:

| Test | Guards |
|---|---|
| `lib/i18n/__tests__/plural-keys.test.ts` | plural separator + every CLDR category |
| `lib/i18n/__tests__/translation-modules.test.ts` | duplicate keys across modules |
| `components/ui/__tests__/badge-status-coupling.test.ts` | raw API fields passed as `status` |
| `lib/i18n/__tests__/code-label.test.ts` | enum label degradation |

If a test itself is wrong, fix the test — but **only** after confirming the
production code is right. These were authored blind alongside the code.

Changes most likely to have broken something: the `await cookies()` call in the
root layout (makes every route dynamic — an accepted tradeoff for an
authenticated dashboard), the dictionary module split, and removing `font-sans`
from `<body>`.

**Do not proceed past this phase on a red toolchain.** Building on an unverified
base is precisely the failure mode that produced this backlog.

### Phase 1 — Audit every existing badge

Apply §4 to all already-converted badges before adding new ones. Let
`badge-status-coupling.test.ts` guide the sweep. This bug class is invisible
until someone loads the app in Arabic.

### Phase 2 — Enum-derived labels (~20 sites)

Replace string-munging with the existing helper — do not hand-roll:

```ts
codeLabel(t, "namespace", code)   // code stays English, only the label translates
```

Unmapped codes degrade to humanized English (`PAST_DUE` → `Past Due`), never to a
blank or a leaked dotted key.

Known offenders:
- `app/(dashboard)/checkout/page.tsx:380` — hardcoded `"Current plan"`
- `app/(dashboard)/dashboard/emails/page.tsx:133` — renders raw `{email.state}`
- `components/documents/PolicyEditor.tsx:288` — `.replaceAll("_", " ")` as display transform

Find the rest by grepping `.replaceAll("_"`, `.replace(/_/g`, and
`.charAt(0).toUpperCase()` — those idioms are the tell. Also:
`DocumentPolicyPanel`, `ProcessingStatusBadge`, `lib/audit-formatters.ts`, the
users pages.

### Phase 3 — Add the unresolved-key guardrail test

Write this **before** Phase 4 — it pays for itself across ~100 files.

Scan `src/` for every `t("…")` / `tPlural("…")` string literal and assert each
resolves in the merged `en` dictionary. Model it on the existing scanner in
`plural-keys.test.ts`, which uses `/\btPlural\(\s*["']([^"']+)["']/g` and walks
the tree with `readdirSync`, skipping `node_modules` and `__tests__`.

This converts silent typos into loud test failures.

### Phase 4 — Translate the remaining UI (~100 files, the bulk)

Get the authoritative list from Phase 0's `git diff`. Largest clusters:
`components/documents/**`, the tenant dashboard pages (`users`, `roles`,
`knowledge-gaps`, `audit`, `emails`, `analytics`), and the ~24-page
`super-admin/**` subtree (currently 100% English).

**Work area by area**, not file by file, so each dictionary module grows once:

| Area | Module |
|---|---|
| tenant dashboard | `{en,ar}.dashboard.ts` — **currently empty** |
| account / auth / checkout / landing / settings | `{en,ar}.account.ts` — **currently empty** |
| platform admin | `{en,ar}.superAdmin.ts` |
| documents | `{en,ar}.documents.ts` |
| nav / top bar / shared components | `{en,ar}.shell.ts` |

Per-file recipe:

1. Confirm the file has `"use client"`. If it's a server component, **stop and
   flag it** (see §3).
2. Add `const { t } = useI18n();`
3. Replace **visible text only**: JSX text, `placeholder`, `title`,
   `aria-label`, `alt`, label props.
4. Respect every "never translate" item in §3.
5. Add the `en` **and** `ar` entry in the **same edit**. Parity is currently
   perfect — keep it that way rather than backfilling later.
6. Interpolate with `{{param}}`. **Never concatenate sentence fragments** — word
   order differs in Arabic.
7. Counts go through `tPlural`, never `n === 1 ? … : …`. Arabic has six plural
   categories; `n === 1` logic is simply wrong for it.

A key defined in two modules silently resolves to the last spread — keep keys in
the module matching their namespace.

**After each area, run the gate.** Do not batch five areas then discover breakage.

### Phase 5 — Locale-aware formatting (~85 sites)

Thread the active locale through every bare `.toLocaleDateString()`,
`.toLocaleString()`, and `Intl.*` call:

```ts
const intlLocale = useIntlLocale();
```

`formatDate` / `formatMonthYear` already accept an optional trailing `locale`
param (defaulted, so existing callers are unaffected).

Also update `components/billing/CompanyBillingPage.tsx` from its hardcoded
`"ar-EG"` to the shared constant. This visibly changes its digits from
Arabic-Indic to Latin — **that is the intended decision** (see §2).

### Phase 6 — Manual RTL pass (cannot be automated)

Set the `documind-locale` cookie to `ar` and click through every converted
screen. Typecheck and unit tests verify code correctness, **not visual
correctness**. This phase is not optional.

- **No RTL flash on first paint** — confirms server-rendered `dir` still works.
- Cairo is actually applied — inspect computed `font-family` on `<body>`, and
  check for tofu glyphs.
- No horizontal overflow or clipped text — Arabic strings run ~20–30% longer.
- Sidebar mirrors; the drawer slides from the correct edge.
- Chevrons and arrows point the right way. The select chevron is a background
  image handled by `rtl:bg-[left_8px_center]` in `SELECT_CLASSES` — `pe-10`
  alone leaves it on the wrong side. Use that as the pattern.
- Progress bars fill from the correct edge (`ProgressBar` sets `dir` on the
  track so the inline-`width` fill anchors correctly).
- Badges kept their colors — validates Phase 1 end-to-end.
- Charts still read left-to-right with un-mirrored axes.
- Mixed LTR content (emails, IDs, code, numbers) sits sensibly inside RTL text,
  and an Arabic chat reply reads RTL inside an English UI and vice versa.
- **English is unregressed.** Every phase touches shared components.

---

## 7. Verification gate

Run after **every** phase, and all four must be clean before you call the work done:

```bash
cd app
npx tsc --noEmit
npx vitest run
npm run lint
npm run build
```

## 8. Definition of done

- [ ] All four gate commands clean
- [ ] en/ar parity holds across all six module pairs
- [ ] No untranslated user-visible English in converted screens (API `err.message` excepted)
- [ ] Every badge derives its color from an untranslated code, never from its text
- [ ] Every `t()` key resolves (Phase 3 test green)
- [ ] Manual RTL pass done on every converted screen; English re-checked for regressions
- [ ] Any server components needing conversion are flagged to the user, not silently converted

## 9. If you get stuck

- **Toolchain blocked?** Ask the user to run the Phase 0 block themselves and
  paste the output. Do not skip ahead to translation work — an unverified base is
  what created this backlog.
- **A test contradicts the code?** Determine which is right from this document's
  §2–§5 before changing either. The tests were authored blind.
- **Something looks wrong in the font/direction/numeral setup?** Re-read §2's
  three design decisions. All three look like bugs and are not.
