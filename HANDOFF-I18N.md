# Arabic i18n — Handoff: What's Left

> **For the next agent/model.** You have no prior context. Everything you need is
> here plus the files named. Read end-to-end before running anything.

**Repo:** `C:\Users\abdal\Downloads\documind-ai`
**All commands run from:** `app/`
**Branch:** `feature/arabic-language-support` — 9 commits, **none pushed** (owner pushes manually)

---

## 0. Current state — verified, not claimed

Last full gate run, all green:

```
npx tsc --noEmit     # clean
npx vitest run       # 772/772 passing, 66 files
npm run lint         # 0 errors (16 pre-existing warnings)
npm run build        # exit 0
```

Dictionaries: **~2,495 keys per locale, exact parity across all six module pairs.**

**Uncommitted work is in the tree right now.** Four background agents were
interrupted mid-task. I repaired what they broke (see §4) and the gate is green,
but their work is **not committed**. Commit it before starting anything new.

---

## 1. The one thing that will bite you

**A file importing `useI18n` tells you NOTHING about whether it's translated.**

That mistake is why this handoff exists. Earlier sweeps checked "does this file
import the hook" and reported all-clear. Four large files import it and are still
almost entirely English:

| File | Lines | `t()` calls |
|---|---|---|
| `src/app/(dashboard)/dashboard/roles/page.tsx` | 2,588 | **1** |
| `src/app/(dashboard)/dashboard/users/page.tsx` | 1,001 | **2** |
| `src/app/(dashboard)/checkout/page.tsx` | 570 | **2** |
| `src/app/set-password-from-invite/set-password-from-invite-client.tsx` | 368 | **3** |

**Always measure coverage, never existence:**

```bash
# t() calls vs file size — a low ratio on a big file means untranslated
for f in $(find src/app src/components -name '*.tsx' | grep -v test); do
  printf "%4s t()  %5s lines  %s\n" "$(grep -c 't("' "$f")" "$(wc -l < "$f")" "$f"
done | sort -n | head -30
```

Lint said `'t' is assigned a value but never used` in `roles/page.tsx` on the very
first run. That single warning was the whole bug. Don't read past warnings.

---

## 2. Work remaining, in priority order

### P1 — `roles/page.tsx` (2,588 lines, 1 `t()` call)

The largest gap. Roles management is a core admin screen, fully English.
~34 hardcoded strings by grep, but that undercounts — expect 150+ keys.

- Namespace: `dashboard.roles.*` in `en.dashboard.ts` / `ar.dashboard.ts`
- **~11 keys already exist there** (`title`, `description`, `createRole`, `cancel`,
  `employee`, `companyAdmin`, `allStatuses`, `active`, `archived`,
  `searchPlaceholder`, `noRoles`) — grep and reuse, don't duplicate
- Module-level `STATUS_OPTIONS` / `ROLE_OPTIONS` (~lines 61-68) pair a code with an
  English label. A module constant can't call a hook — hold codes only and resolve
  labels per render. Precedent: `DIMENSION_LABEL_KEYS` in
  `src/app/(dashboard)/company/usage/page.tsx`
- **This page is full of permission identifiers. Those are machine codes — never translate them.**

### P2 — `users/page.tsx` (1,001 lines, 2 `t()` calls)

Exact remaining strings:
```
 62  { value: "EMPLOYEE", label: "Employee" }        ← module const, see above
 63  { value: "COMPANY_ADMIN", label: "Company Admin" }
481  title="Team Management"
522  placeholder="Invitee name"
611  <span>Invite people with the right role from the start.</span>
660  placeholder="Search by name or email"
669  <option value="">All roles</option>            ← translate LABEL, keep value=""
671  <option value="COMPANY_ADMIN">Company Admin</option>
```
- Namespace: `dashboard.users.*` — **~16 keys already exist**, several match exactly
- Reuse `dashboard.userRole.*`, `dashboard.userStatus.*`

### P3 — `checkout/page.tsx` (570 lines, 2 `t()` calls)

`title="Billing & Plans"` + its description repeat at lines **172, 194, 220, 252**
(four render branches). Use **one** key for all four, not four keys.
- Namespace: `account.checkout.*` in `en.account.ts` / `ar.account.ts` (that module
  is near-empty at 16 keys and exists for exactly this area)
- Reuse existing `billing.*` keys from the base dictionary

### P4 — `set-password-from-invite-client.tsx` (368 lines, 3 `t()` calls)

```
233  aria-label="Checking invitation"
240  <dt className="text-slate-500">Invited email</dt>
```
Plus message literals at ~46, 51, 82, 141, 152, 179 ("Checking your invitation...",
"This invitation link is incomplete.", "Create a password to activate your account.",
"Setting your password...", "Your password is ready. You can now sign in.",
"Review the highlighted field and try again.")
- Namespace: `account.invite.*`
- This is onboarding copy every new user sees — write warm, natural Arabic, not literal

### P5 — Re-run the scanner, fix what it finds

`app/find-english.mjs` exists in the tree (untracked). It catches single words,
Title Case, and attributes — the patterns the earlier weak sweep missed.

```bash
node find-english.mjs
```
Last run: **145 candidates across 21 files.** P1-P4 cover the worst. Triage the rest;
expect false positives (component names, icon ligatures).

**Delete `find-english.mjs` when done — it's a temp tool, not product code.**

### P6 — Manual RTL pass (cannot be automated, owner's call whether to delegate)

```bash
cd app && npm run dev
```
Switch to Arabic via the language selector (sets `documind-locale` cookie).

Mechanical half is already verified: zero physical `ml-/mr-/pl-/pr-/text-left/right`
classes, 22 `rtl:` variants on directional icons, drawer slides from correct edge.

What needs human eyes:
- Mixed-direction text (`12 / 500`, `v3`) inside Arabic sentences — bidi reordering
- Tables: columns mirror, but numeric cells stay LTR internally
- Charts: SVG doesn't inherit `dir`
- Truncation — Arabic runs 20-30% longer
- `dashboard.import.retryConfirmBody` interpolates two pre-pluralized phrases; read it aloud
- Densest table: `super-admin/processing-overview`

---

## 3. Rules — violating these breaks things silently

1. **Add the `en` AND `ar` entry in the SAME edit.** A parity test fails the build
   otherwise. Current: ~2,495 keys per locale, exactly equal.

2. **Every `t("x")` needs a real dictionary entry.** An agent once converted a whole
   page's JSX, added zero keys, and reported success — the page was broken in both
   locales. `unresolved-keys.test.ts` catches this. Convert in small batches: edit
   JSX → immediately add keys to both dictionaries → verify → next batch.

3. **Counts go through `tPlural`, never `n === 1 ? a : b`.** Arabic selects six CLDR
   categories. Any `tPlural` key needs all six (`zero/one/two/few/many/other`) in
   BOTH locales. English repeats its wording; see `documents.rulesInDraft` in
   `en.documents.ts`.

4. **Never concatenate sentence fragments.** `"Updated " + time` must be one
   interpolated key — Arabic word order differs.

5. **The badge trap.** `<Badge status={...} label={...} />` and
   `<StatusPill value={...} label={...} />` — `status`/`value` drives the COLOR and
   must stay an untranslated code. Visible text goes in `label`. A translated string
   there silently turns the pill grey. No error, no failing test, invisible in English.

6. **Never translate:** `<option value=>`, `name=`, `href`, React `key=`,
   `Permission.*` constants, enum codes, model identifiers, timezone strings like
   `"UTC"`, or any string used in a comparison.

7. **`err.message` from the API stays untranslated** — translate only the English
   literal fallback in `err instanceof Error ? err.message : "..."`.

8. **Don't create a second namespace for a concept that already has one.** Grep both
   dictionaries first. A duplicate `documents.processingStage.*` shadowing an existing
   `documents.stage.*` already had to be removed once.

9. **Server components can't use `useI18n()`.** If a file lacks `"use client"`, flag
   it rather than converting silently. (Five thin page shells were converted with the
   owner's approval; their children were already client components.)

10. **If a test asserts an English literal you moved to the dictionary:** confirm the
    production code is right FIRST, then repoint the assertion at the same invariant.
    Don't delete assertions. Three tests were legitimately updated this way.

---

## 4. What the interrupted agents left behind — already repaired

Four agents were killed mid-edit. State when stopped:

**Broken and fixed by me:**
- `chat-client.tsx` called `resolveDimensionLabel(...)` — a helper it never defined.
  Build was failing. Replaced with `codeLabel(t, "usage.dimension", ...)`, which
  already has all eight keys in both locales.
- `chat-rendering.test.ts` asserted `src.documentTitle ?? "Document"`; the code now
  uses `t("chat.sourceDocumentFallback")`. Repointed the assertion.

**Completed before being killed** (verify, then commit):
- `tenants-client.tsx` — 40 `t()` calls, 0 hardcoded English
- `platform-settings-form.tsx` — 12 `t()` calls, 0 hardcoded
- `UpgradePrompt.tsx` — 11 `t()` calls, 0 hardcoded
- `chat-client.tsx` — 31 `t()` calls, 2 candidates left

**Fixed by me earlier:** `QuotaProgressBar.tsx` was rendering the raw `dimension`
code next to translated numbers, producing `2 / 5 employees` in Arabic. The `label`
prop already carried the Arabic. Removed the raw render; documented why on the prop.

---

## 5. Verification gate — run after EVERY file

```bash
cd app
npx tsc --noEmit
npx vitest run          # must stay ≥772 passing
npm run lint            # must stay 0 errors
npm run build
```

Then prove the specific file is actually done:

```bash
# should print nothing
npx vitest run src/lib/i18n/__tests__/ 2>&1 | grep -oE '"[a-zA-Z]+\.[a-zA-Z.]+ \(src'

# count remaining hardcoded English in the file you just did
grep -cE '>[[:space:]]*[A-Z][a-z]+|placeholder="[A-Z]|title="[A-Z]|aria-label="[A-Z]|label="[A-Z]|label:[[:space:]]*"[A-Z]' <file>
```

Parity check across all six module pairs:

```bash
node -e "
const fs=require('fs');
const mods=['','.shell','.documents','.dashboard','.superAdmin','.account'];
const k=s=>new Set([...s.matchAll(/^\s{2}\"([^\"]+)\":/gm)].map(m=>m[1]));
for(const m of mods){
  const en=k(fs.readFileSync('src/lib/i18n/translations/en'+m+'.ts','utf8'));
  const ar=k(fs.readFileSync('src/lib/i18n/translations/ar'+m+'.ts','utf8'));
  const oe=[...en].filter(x=>!ar.has(x)),oa=[...ar].filter(x=>!en.has(x));
  if(oe.length||oa.length) console.log('MISMATCH '+(m||'.ts'),oe,oa);
}
console.log('(no MISMATCH lines = parity OK)');
"
```

---

## 6. The i18n API

```tsx
import { useI18n, useIntlLocale } from "@/providers/i18n-provider";
import { codeLabel } from "@/lib/i18n/code-label";
import { formatDate } from "@/lib/utils";

const { t, tPlural, locale, dir, setLocale } = useI18n();
const intlLocale = useIntlLocale();          // "en-US" | "ar-EG-u-nu-latn"

t("documents.save")                           // → "Save"
t("documents.ruleNumber", { number: "3" })    // {{number}} — params are strings
tPlural("documents.rulesInDraft", count)      // Intl.PluralRules, {{count}} auto
codeLabel(t, "billing.subscriptionStatus", code)  // enum code → label
formatDate(value, undefined, intlLocale)      // locale-aware date
value.toLocaleString(intlLocale)              // locale-aware number
```

Keys are **flat and dot-namespaced**, never nested objects.
`t()` returns the key itself on a miss — a typo renders `dashboard.tittle` on screen
and nothing throws. That's intentional, and it's why the guardrail test matters.

**Dictionary files** (`app/src/lib/i18n/translations/`):

| Module | Area |
|---|---|
| `{en,ar}.ts` | base — common, auth, chat, landing, billing, taxonomy, audit |
| `{en,ar}.shell.ts` | nav, top bar, shared components |
| `{en,ar}.documents.ts` | documents area |
| `{en,ar}.dashboard.ts` | tenant dashboard |
| `{en,ar}.superAdmin.ts` | platform admin |
| `{en,ar}.account.ts` | account / auth / checkout — **near-empty, use it for P3/P4** |

---

## 7. Three design decisions that look like bugs — do not "fix" them

1. **`t()` returns the key on a miss.** Intentional: nothing crashes in production.

2. **`ar-EG-u-nu-latn` = Arabic months with Latin digits.** Deliberate for a B2B
   dashboard full of invoice amounts and IDs. Do not switch to Arabic-Indic numerals.

3. **The Arabic font is applied via `html[dir="rtl"] body` in `globals.css`, and
   `<body>` deliberately has NO `font-sans` class.** Tailwind v4's `@theme inline`
   bakes `--font-sans` into `.font-sans` as a literal, and a utility class on `<body>`
   would outrank the base-layer rule. "Cleaning this up" makes Arabic silently render
   in the Latin font.

---

## 8. Definition of done

- [ ] All four gate commands clean
- [ ] en/ar parity holds across all six module pairs
- [ ] `roles`, `users`, `checkout`, `set-password-from-invite` fully converted
- [ ] `node find-english.mjs` triaged; real findings fixed
- [ ] `find-english.mjs` deleted
- [ ] `.claude/` screenshots folder deleted (owner's instruction)
- [ ] Every badge derives color from an untranslated code
- [ ] Manual RTL pass done; English re-checked for regressions
- [ ] Server components needing conversion flagged to the owner, not silently converted

---

## 9. Honest notes

- **Commit `035c3d2` has a misleading message.** It claims to convert three pages; a
  failed tool call meant only the dictionary keys landed. Fixed honestly in `8bd09c0`.
  If you read commit messages as a record, that one overstates its contents.
- **Arabic wording is unreviewed by a native speaker.** Structure is verified —
  parity, plural categories, no fragment concatenation. Phrasing is not.
- **Deliberate gaps:** `formatPrice`'s `"Free"` in `billing.helpers.ts` (pure
  non-React helper; threading `t` is a signature change). ~156 uncommon audit actions
  fall back to humanized English by design — the owner chose that.
