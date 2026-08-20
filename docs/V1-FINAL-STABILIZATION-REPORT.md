# DocuMind AI V1 Final Stabilization Report

## Scope

This report describes the work present on `fix/v1-final-stabilization` relative to
`rag-rbac-integration`. It is intended for local owner review and the final
presentation. The branch remains unmerged and has no pull request. Its remote
tracking branch currently ends at `e4fb5b1`; the four subsequent local commits
have not been pushed.

- Branch: `fix/v1-final-stabilization`
- Base: `rag-rbac-integration` at `33ef6be`
- Commits on this branch: 16
- Files changed relative to base: 63
- Net diff relative to base: 3712 insertions, 181 deletions

The work preserves the existing RAG, RBAC, tenant isolation, document ACL,
`use_in_ai`, custom-role, evidence, citation, safety, and multi-document
architecture. Fixes were kept at the first proven failure boundary rather than
replacing working authorization or retrieval systems.

## Owner-Requested Fixes Added

The final owner review identified two user-facing regressions. Both fixes are
implemented in the current working tree and covered by focused regression tests.

### Access-constrained RAG is not a Knowledge Gap

When retrieval finds that relevant content is outside the employee's effective
document authorization, the chat workflow now returns an explicit,
authorization-safe response instead of wording the result as if the company
had no information:

> I don't have sufficient authorized access to the documents needed to answer
> this question.

The same behavior applies to partial authorization filtering. The response has
no citations and does not reveal hidden document titles, IDs, chunks, text,
markers, or counts. Knowledge Gap persistence remains artifact-driven: only a
genuine no-match in the actor's authorized corpus is reportable.

### Knowledge Gaps permission loading terminates

The permission provider now uses one identity-scoped request at a time,
deduplicates refreshes, ignores stale completions, debounces permission-denied
refresh bursts, and transitions a stalled request to a retryable error after
eight seconds. The API also disables conditional caching for `/permissions/me`
and strips incoming validators, preventing Express from turning this
identity-sensitive JSON response into a body-less `304`. This removes the
unbounded `Checking access` state on `/dashboard/knowledge-gaps` and other
permission-bound routes. Employees retain the catalog's `knowledge-gaps:read`
grant, and company-admin duplicate top-bar navigation remains removed.

Design and implementation plans for these owner-requested fixes are recorded in
`docs/plans/2026-08-20-authorization-aware-knowledge-gaps-design.md` and
`docs/plans/2026-08-20-knowledge-gap-and-permission-fixes.md`.

## Commit History

1. `9ef37d3` `fix: prevent authorization failures from creating false knowledge gaps`
   - Propagates authoritative retrieval authorization reasons through the tool
     boundary and consumes them in Knowledge Gap decisions.
   - Adds KG-1 through KG-10 regression coverage and non-leak assertions.

2. `3759c18` `fix: reconcile the gibberish routing contract`
   - Makes clearly unintelligible provider-labelled input resolve to
     clarification, with no retrieval and no sources.
   - Keeps safety, assistant, and social routing precedence and fail-closed
     degraded fallback behavior.

3. `dfa0dd8` `fix: deduplicate natural document title hints`
   - Deduplicates normalized document references before the intentional bound of
     two distinct hints is applied.
   - Preserves two-document comparison behavior.

4. `27ee181` `test: repair type blockers in test fixtures`
   - Corrects stale test fixture typing without `any` or unsafe compiler
     suppression.

5. `8d4453f` `fix: safely decode knowledge gap notification entities`
   - Stops API notification builders from storing HTML-escaped plain text.
   - Retains a bounded, single-pass display decoder for legacy rows.

6. `ac317fb` `perf: resolve each user's authorization once per access policy preview`
   - Adds request-scoped permission resolution for one preview computation.
   - Keeps authorization checks, canonical `departmentId` precedence, tenant
     boundaries, explicit deny, custom roles, and classification scope intact.

7. `4c4d751` `fix(agents): keep material eligibility qualifiers in the writer envelope`
   - Fixes threshold comparison scope by separating absolute values from rates
     and requiring matching known recurrence periods.
   - Narrows dispositive sources per document rather than per ingestion chunk.
   - Adds a general eligibility instruction so material gates are stated without
     inventing tenure or approval.

8. `7f799b6` `docs: design Arabizi mixed-language stabilization`
   - Records the measured Arabizi/mixed-language defects and the constrained
     normalization design.

9. `1bf3b81` `docs: plan Arabizi mixed-language stabilization`
   - Records the test-first implementation sequence for language and numeric
     anchor stabilization.

10. `7d70d59` `fix: stabilize arabizi and mixed-language routing`
    - Adds a bounded structural Arabizi signal while retaining the conservative
      dictionary threshold.
    - Normalizes Arabizi duration units, recurrence markers, and Arabic dual
      morphology through the existing numeric pipeline.

11. `a60a4a4` `fix: distinguish permission-aware document empty states`
    - Separates no accessible documents from no search/filter results without
      confirming hidden document existence.
    - Adds English and Arabic translations and focused UI tests.

12. `e4fb5b1` `test: cover contextual remote access follow-up bridge`
    - Adds regression coverage for the remote-work follow-up that references
      internal-system access and should bridge to the appropriate policy context.

13. `78ee2b9` `fix(storage): keep local storage keys portable`
    - Uses POSIX separators for logical storage keys while retaining native
      separators for physical filesystem paths.
    - Fixes Windows local tenant-logo public URL resolution without changing
      tenant ownership or storage access behavior.

14. `d3c9316` `fix: make local presentation assets and checks portable`
    - Vendors Cairo and Material Symbols fonts locally.
    - Removes Google font/runtime stylesheet dependencies from the presentation
      build.
    - Fixes CRLF-sensitive source inspection tests and restores clean Cairo OFL
      license text.

15. `80a28e1` `docs: design permission loading stabilization`
    - Records the proven permission request race, identity-scoped request design,
      eight-second timeout, denial-event coalescing, StrictMode/remount handling,
      and company-admin top-bar cleanup plan.

16. `86db508` `fix: prevent permission loading lock and duplicate admin nav`
    - Replaces competing generation-based permission refreshes with one active
      identity-scoped promise.
    - Adds timeout/error/retry handling and coalesces permission-denied refresh
      bursts.
    - Localizes the sidebar failure/retry state and removes duplicate
      company-admin top-bar search/navigation.

## Issue-by-Issue Results

### Issue #1: Material qualifier and answer completeness

**Symptom.** An eligibility question could receive a technically true but
misleading partial answer such as “yes, up to two days” while omitting a
90-day employment gate or prior manager approval.

**Proven root cause.** The first loss was pre-model in `buildRagMessages`:

1. Numeric threshold comparison paired every same-unit mention, so a weekly
   allowance and an absolute tenure minimum were incorrectly cross-produced.
2. The false dispositive comparison caused source narrowing to discard other
   policy sections, including the requested allowance and approval requirement.

**Production fix.** Recurrence period is now part of numeric identity; absolute
   values compare only with absolute thresholds and rates compare only with the
   same known period. Dispositive narrowing is per document. Eligibility-shaped
   questions receive a bilingual, general instruction to include material
   prerequisites, approvals, exceptions, and thresholds while not inventing
   facts. Informational questions such as “how many” and “what are the core
   hours” retain concise behavior.

**Cases A-H.** The deterministic envelope tests cover the required matrix:

- A: “How many remote days per week are allowed?” focuses on the allowance.
- B: “Can I work remotely two days per week?” preserves allowance, tenure, and
  approval sections.
- C: 30 days of tenure remains visibly incompatible with a 90-day requirement;
  approval is not silently omitted.
- D: manager approval does not imply tenure eligibility.
- E: 120 days does not imply manager approval.
- F: 120 days plus approval preserves the complete positive evidence envelope.
- G: requirements questions retain all material eligibility requirements.
- H: core-hours questions are not padded with unrelated tenure/approval text.

**Residual.** Final prose is provider-dependent. The deterministic envelope and
writer instruction are covered; live provider wording requires a healthy
provider.

### Issue #2: Arabizi and mixed-language stability

**Symptom.** Near-identical Arabizi questions alternated between English and
Arabic detection because the detector required two dictionary hits. Arabizi
duration nouns and Arabic dual forms also lost numeric anchors.

**Fix.** A bounded structural token signal recognizes a Latin token of at least
four letters containing one Arabizi substitution digit between letters, while
excluding common technical identifiers. Existing numeric normalization now
recognizes `yom`, `yoom`, `youm`, `ayam`, `sa3a`, `osbo3`, `shahr`, `sana`, and
variants, plus `fel`/`fil`/`kol`/`kul` recurrence markers. Arabic dual forms are
normalized to explicit quantity two before extraction.

**Representative phrases covered.**

- `momken asht8al remote 2 days fel week?`
- `ana ba2aly 30 yom, momken remote 2 days?`
- `manager approved, ينفع اشتغل remote يومين`
- `كام يوم remote مسموح`
- English and Arabic controls, plus `momken a3raf el remote work policy?`

The intended result is stable knowledge routing, preserved day/week and tenure
anchors, and response language following the question. Technical identifiers
such as `utf8`, `base64`, `oauth2`, `s3`, `ec2`, `sha256`, `log4j`, `i18n`,
`p2p`, and `b2b` remain English controls.

**Known limitation.** A pure-Arabic phrase without the English domain term can
have a weaker positive knowledge signal. Existing question-shape rescue and
corpus-first fallback keep the tested phrase on the knowledge path, so this is
a non-blocking robustness asymmetry. Expanding phrase dictionaries was
intentionally avoided.

### Issue #3: Access Policy Preview performance

**Symptom.** Preview authorization work was slow because every user/action and
current/proposed policy evaluation repeatedly resolved the same actor state.

**Proven bottleneck.** `PermissionEvaluatorImpl.resolve()` performs multiple
sequential Mongo reads and is intentionally uncached globally. Repeating that
actor-only work dominated the preview.

**Fix and measurements.** A request-scoped evaluator memoizes resolution per user
for one preview only. A policy evaluation scope also reuses the in-memory
document evaluator and department resolution. With the same 20-user fixture,
the measured result was 89 Mongo round trips, within the budget of 180 and far
below the naive floor of 440. The commit’s earlier measurement was approximately
1766 round trips before the optimization; the implementation commit also
recorded 87 round trips on its original fixture run. Impact numbers remained
identical. A fresh scope observes role changes, so there is no stale cross-request
authorization cache.

### Issue #4: Permission-aware Documents empty states

The dashboard now distinguishes:

- no accessible documents for the current actor;
- no matches for the active search/filter;
- the normal empty tenant state where applicable.

The UI never reports hidden document counts, titles, IDs, or the fact that denied
documents exist. English and Arabic copy are covered by focused tests.

### Issue #5: Knowledge Gap HTML entities

**Root cause.** API notification factory sanitization escaped plain-text
`LocalizedText` before persistence, so `company&#39;s` was stored in Mongo.

**Fix.** Plain-text notification builders now retain text verbatim. The app keeps
a bounded single-pass decoder for legacy rows, without
`dangerouslySetInnerHTML`. Tests cover apostrophe, quote, ampersand, `&lt;`,
`&gt;`, already-normal text, Arabic, Arabizi, and double-decoding protection.

### Issue #6: False Knowledge Gap from authorization

**Root cause.** Retrieval already emitted authoritative denial reasons, but the
authorized retrieval tool recomputed outcome from zero candidate counts and
compared against the wrong reason vocabulary. Authorization-restricted results
were downgraded to ordinary `NO_MATCHES`.

**Fix.** A typed, exhaustive retrieval authorization signal classifier now
propagates `authorizationRestricted` for terminal denied corpora and
`authorizationFiltered` for narrowed partial corpora. Knowledge Gap reporting
consumes those booleans and suppresses false gaps. No unrestricted retrieval was
added, and no denied document ID, title, chunk, value, canary, or count crosses
the user-facing boundary.

**KG matrix.** KG-1 through KG-10 are covered in the real retrieval path:

- true gap may create a gap;
- no authorized documents, explicit deny, department restriction,
  classification restriction, custom-role restriction, and exact unauthorized
  title do not create false gaps;
- partial authorized corpus is marked access-constrained rather than ordinary
  `NO_MATCHES`;
- authorized-but-insufficient evidence remains distinguishable from denial;
- cross-tenant evidence is never consulted;
- tool output contains no restricted identifiers or content.

### Issue #7: P1/P2 false-premise completeness

The branch preserves the generalized false-premise contrast behavior from the
baseline stabilization. The intended result for “P1 restoration target is 8
hours, correct?” is a correction to P1’s grounded value plus the nearby contrast
that 8 hours belongs to P2. The values are evidence-driven, not hard-coded into
the answer writer. Regression coverage is included in the existing evidence and
writer suites.

### Issue #8: Language consistency

Arabizi and mixed-language detection now uses a stable structural signal and
preserves the existing response-language policy. English questions remain
English, Arabic questions remain Arabic, and source-language policy titles do
not force answer prose to switch languages. Mixed and Arabizi cases are covered
by language-detector, routing, threshold, and Answer Writer tests.

### Issue #9: Gibberish contract

The product contract is clarification for clearly unintelligible input: ask the
user to restate, perform no retrieval, and return no sources. Safety, assistant,
and social detection retain priority. A provider-unavailable deterministic
fallback remains source-less `unsupported` because it cannot reliably classify
the text without provider output. The stale production-workflow expectation was
updated to match the clarified contract.

### Issue #10: Contextual follow-up stability

Coverage was added for the sequence “Can I work remotely two days per week?”
followed by “What if I need to access internal systems while doing that?” The
follow-up preserves remote-work context and bridges into internal-system policy
requirements while retaining authorization boundaries. The unauthorized path is
covered for no evidence and no source leak.

### Issue #11: TypeScript and test blockers

The remaining errors were stale test fixtures, not product type regressions.
Captured provider messages, candidate assertions, document-access fixture
context, actor role, department, classification, and private-method access were
typed through existing safe helpers. API TypeScript checking passed without
`any` or unsafe suppression.

### Issue #12: Document title hints

The accidental regression was duplicate matching consuming the two-reference
bound. References are now deduplicated on Arabic-normalized, case-insensitive
comparison before the intentional bound is applied. Two-document comparisons
remain supported.

Intentional limitation: ambiguous three-plus-document composite phrases may
resolve to a safe clarification instead of being comma-split, because splitting
can corrupt real titles containing prepositions.

### Issue #13: Provider availability and failover

Provider availability was treated as infrastructure state, not silently changed
product behavior. Existing failover and retry boundaries were audited without
adding aggressive retry loops. Live provider-dependent presentation checks remain
pending when providers return 429/502 or are unavailable; such results must be
reported as provider-blocked, not as application regressions.

### Issue #14: OCR path

The existing OCR path and authorization contracts remain covered by automated
tenant/ACL/`use_in_ai`/deny tests where deterministic locally. A live OCR upload,
external OCR execution, and provider-backed presentation check remain manual
follow-ups when the external OCR/provider services are healthy. No local change
weakened tenant isolation or document authorization.

### Issue #15: Infinite permission “Checking access” lock

**Symptom.** Dashboard pages such as `/dashboard/knowledge-gaps`,
`/dashboard/documents`, `/dashboard/chat`, `/dashboard/users`, and
`/dashboard/roles` could remain permanently on sidebar skeletons and “Checking
access” even though the user was authenticated.

**Proven root cause.** `PermissionProvider.refreshPermissions()` incremented a
generation and set `loading` for every refresh. If a child request returned 403
while the initial `/permissions/me` call was pending, the permission-denied
subscriber launched another request and invalidated the initial response. An
interrupted replacement request could then leave no request able to publish a
terminal state. There was no timeout, so the existing error/retry views were
never reached.

**Production fix.** The provider now owns one active permission request per
authenticated tenant/user identity. Concurrent manual refreshes and denial-event
refreshes reuse that promise instead of competing. An identity-scoped token
rejects stale completions after identity changes, timeouts, or unmounts. A stalled
request transitions to `error` after eight seconds with
`Permissions check timed out`; Retry starts a fresh request. Rapid
permission-denied notifications are
coalesced with a bounded 150 ms debounce. React unmount/remount behavior is
covered so an old response cannot overwrite the current provider.

The live API trace exposed a second root cause that the client lifecycle fix
could not solve by itself: Express was honoring `If-None-Match` on
`/permissions/me` and returning `304` without the permission JSON body. The
controller now sends `Cache-Control: no-store, no-cache, must-revalidate,
proxy-revalidate` and `Pragma: no-cache`, removes `If-None-Match` and
`If-Modified-Since` before serialization, and the app request uses
`cache: "no-store"`.

**Route and role result.** The fix is provider-wide, so every dashboard and
super-admin `PermissionBoundary` receives a terminal `ready`, `denied`,
`maintenance`, or `error` state rather than an unbounded loading state. The
authoritative backend catalog was verified to already include
`knowledge-gaps:read` for `EMPLOYEE`; no role permission was broadened and no
custom-role provenance check was weakened.

**Error UX.** The main permission status already exposed localized failed and
maintenance states with Retry once the provider reached a terminal state. The
sidebar error banner is now localized through the same permission keys and its
Retry action is regression-tested.

**Company-admin navbar cleanup.** For tenant `COMPANY_ADMIN`, the top bar no
longer renders the decorative search input or duplicate Overview, Documents, and
Users shortcuts. Those routes remain permission-filtered in the sidebar. Utility
controls such as notifications, language, settings, profile, and logout remain.
Super-admin navigation behavior is unchanged.

**Regression evidence.** The provider test first reproduced two API requests
from one pending load plus a denial burst, and reproduced `loading` remaining
after eight seconds. After the fix:

- consolidated permission/navigation focused suite: 94/94 across five files;
- employee permission catalog suite: 11/11;
- provider lifecycle suite after the synchronous-failure edge-case check: 40/40;
- full app suite: 125/125 files, 1284/1284 tests;
- app typecheck: passed;
- app lint: 0 errors, 20 pre-existing warnings;
- app production build: passed, 57/57 routes generated.

### Issue #16: Employee authorization-constrained Knowledge Gaps

**Symptom.** An employee or custom-role user could be prevented from using a
document because of `use_in_ai`, document ACL, department, classification, or
explicit-deny policy. Retrieval correctly withheld the document, but a partial-
authorization refusal could still be worded like an ordinary company-wide
knowledge gap: “I couldn't find any information …”. That sounds as though the
company has no such information instead of saying that the current actor lacks
sufficient authorized access.

**Proven root cause.** The earlier authorization fix already propagated two
trusted internal signals: `authorizationRestricted` for a terminal denied
corpus and `authorizationFiltered` when authorization narrowed a partially
searchable corpus. Knowledge Gap persistence already consumed those signals and
suppressed false gap records. The remaining defect was the user-facing fallback:
`fallbackReplyFor()` checked only `authorizationRestricted`, so a partial
`authorizationFiltered` refusal fell through to the ordinary no-information
sentence.

**Production fix.** The fallback now receives the combined constrained state:
`authorizationRestricted || authorizationFiltered`. Both terminal and partial
authorization-constrained refusals use the generic localized message:

> I don't have sufficient authorized access to the documents needed to answer
> this question.

The message does not confirm a hidden document and does not expose titles, IDs,
chunk IDs, values, canaries, or restricted counts. Genuine authorized no-match
requests still use the ordinary no-information fallback and remain eligible for
Knowledge Gap creation. No unrestricted retrieval or second authorization
system was introduced.

The final retrieval hardening also covers the canonical live document allowlist
and legacy scope paths. `authorizedDocumentIds` is recognized as an
authorization scope; tenant provenance probes remove only that mandatory
allowlist while preserving supported explicit document/category/department/
classification narrowing. A probe hit is accepted only after tenant-scoped
hydration and active-document validation, and hidden candidates are never
returned to the caller. Partial results remain `AUTHORIZED_RESULTS` with
`authorizationFiltered: true`; an empty authorized result is reported as
`NO_AUTHORIZED_DOCUMENTS` with `authorizationRestricted: true`.

Empty allowlist/query intersections fail closed before any adapter search.
Probe failures fail closed as `RETRIEVAL_UNAVAILABLE` for empty or insufficient
retrieval rather than creating a content Knowledge Gap. The public
`dateFrom`, `dateTo`, and `versionIds` filters do not currently have a complete
`AdapterFilter`/provider representation, so scoped provenance probing refuses
to drop them and fails closed until those filters are supported end to end.

The Knowledge Gap read surface now accepts scoped `knowledge-gaps:read` grants
with `allowScoped: true` on list, metrics, detail, occurrence, and reevaluation
routes. Controllers pass the trusted authorization scope plus actor identity to
the repository. New gaps persist a canonical, non-user-visible visibility
envelope containing the reporting actor, canonical department, and effective
category/classification scope. This is required because a genuine no-match has
no authorized document from which to derive taxonomy; using the generic
feedback category or an actor department display name would silently mis-scope
the record. Recurrences merge the same envelope into the existing gap.

Mongo filters combine employee/reporting ownership, department, category, and
classification constraints, so a scoped read cannot fall back to a tenant-wide
list or metrics response. Legacy records without canonical visibility metadata
fail closed for scoped reads. Detail reads apply the same filter in Mongo and
return the existing not-found response when the gap is outside the actor's
visibility.

Occurrence and reevaluation child endpoints now return a safe projection for
scoped/employee readers. Tenant IDs, parent gap IDs, questions, normalized
intents, actor IDs, department labels, conversation/message IDs, trace IDs,
evidence IDs, document IDs, and before/after evidence are omitted; aggregate
outcome, confidence, result, notes, and timestamps remain available for the
dashboard.

The permission provider also clears its denial-refresh debounce timer whenever
authentication status or tenant/user identity changes. A delayed notification
from the previous actor therefore cannot restart a stale `/permissions/me`
request after logout or tenant switching.

**Regression coverage.** The unit harness now models filtered search and
filtered evidence independently. It verifies access-safe wording, empty
sources, and no `reportKnowledgeGap` call for a partial authorization refusal.
A production-composed employee test changes only the actor in the disposable
fixture to `EMPLOYEE`, seeds same-tenant evidence with `discover/read` but no
`use_in_ai`, and verifies:

- `authorized_hybrid_search` returns `AUTHORIZATION_FILTERED` with no candidates;
- evidence evaluation is not called;
- the exact generic authorization-safe response is returned;
- sources are empty;
- protected title, document ID, chunk ID, text, and marker are absent from the
  response and supervisor graph;
- Knowledge Gap and `knowledge_gap_created` notification counts remain zero.

Fresh focused verification:

- `node ../scripts/run-api-tests.mjs src/modules/chat/__tests__/chatWorkflowService.test.ts` — 106/106 passed;
- authorization/outcome/retrieval group — 70/70 passed (15 + 7 + 48);
- `node ../scripts/run-api-tests.mjs src/modules/chat/__tests__/chat.productionWorkflow.e2e.test.ts` — 48/48 passed, including the employee regression;
- `npx.cmd tsc -p api/tsconfig.json --noEmit` — passed;
- `git diff --check` — passed.

Additional access-loop and scoped-read verification:

- App permission/API client/navigation suite: 119/119 across six files;
- API permission controller: 1/1, including conditional-request validator
  removal;
- API permission middleware: 8/8;
- API employee permission catalog: 11/11;
- Knowledge Gap scope/route/repository suite: 7/7, including
  `reportCandidate()` visibility persistence and sensitive child-field omission,
  including tenant and parent-gap identifiers;
- Permission provider lifecycle suite: 42/42, including logout and
  tenant/user identity-switch timer cancellation;
- API and app typechecks: passed;
- Live Docker probe before API restart: `/permissions/me` 200, but the stale
  watch process still returned `403 RESOURCE_CONTEXT_REQUIRED` for the scoped
  Knowledge Gap routes;
- Live Docker probe after restarting only `documind-ai-api-1`:
  conditional `/permissions/me` returned `200` with a JSON body and
  `no-store, no-cache, must-revalidate, proxy-revalidate`; `/knowledge-gaps`
  and `/knowledge-gaps/metrics` both returned `200` for a scoped employee.

The production workflow output includes a known test-harness warning when a
notification outbox port is not registered; it is emitted by existing genuine-
gap tests, does not fail the run, and is not a tenant-data mutation.

**Data safety.** `MONGODB_URI` was unset, so the official runner used its
disposable in-memory test database. Fixture cleanup is isolated to that
temporary database. No production MongoDB URI was used, no tenant records were
deleted or migrated, and no historical Knowledge Gap records were removed or
rewritten. Historical false gaps require a separate owner-approved,
precisely-scoped migration; this fix prevents new false gaps.

## Local Presentation Readiness

The final two commits close Windows/offline presentation issues:

- local storage logical keys use `/` while physical paths use native separators,
  fixing tenant logo URLs on Windows;
- Cairo and Material Symbols are vendored under `app/src/app/fonts`;
- `next/font/google` and remote Material Symbols stylesheet dependencies were
  removed;
- source checks are CRLF-tolerant;
- Cairo's SIL OFL license file is clean and contains no task-prompt text.

## Verification Evidence

The recorded release verification was:

- Official API command: `npm.cmd run test --workspace api`
  - Vitest phase: 123/123 files, 1754/1754 tests.
  - Node phase completed without failures; the runner reports per-file counts.
- App tests after the permission fix: 125/125 files, 1284/1284 tests.
- API build, typecheck, and lint: passed.
- App typecheck: passed.
- App lint: 0 errors and 20 pre-existing warnings.
- App production build: passed; 57/57 routes generated.
- Access Policy Preview release test: 89 Mongo round trips for 20 users, budget
  180, naive floor 440.
- `git diff --check`: passed before this report was created.

The owner-requested fixes were rerun after implementation:

- API chat workflow unit suite: 106/106 passed.
- Production-composed chat workflow suite: 48/48 passed, including the
  employee-without-`use_in_ai` authorization regression.
- Knowledge Gap authorization classification suite: 15/15 passed.
- App permission provider and API-client focused suite: 66/66 passed across two
  files; the provider lifecycle file independently passed 42/42.
- Employee permission catalog suite: 11/11 passed.
- Knowledge Gap scoped-read suite: 7/7 passed.
- Permission controller/middleware/catalog suites: 20/20 passed.
- API and app typechecks: passed.
- API and app builds: passed; the app generated 57/57 routes.
- API lint: passed with 0 errors.
- App lint: passed with 0 errors and 20 pre-existing warnings.
- Full app suite: 125/125 files, 1287/1287 tests passed.
- The final full API run passed 122/123 Vitest files and 1753/1755 tests. The
  only failures are two unrelated billing tests whose fixed preview expiry
  (`2026-08-20T00:15:00Z`) is now in the past; the same two failures reproduce
  when that file is run alone. No billing production code was changed as part
  of these authorization fixes.
- Read-only live Docker verification with an existing scoped employee returned
  `200` for the initial and conditional `/permissions/me` requests, retained a
  JSON response body and the expected no-store cache policy, and returned `200`
  for `/knowledge-gaps` and `/knowledge-gaps/metrics`.
- `git diff --check`: passed; only Git line-ending and global-ignore warnings
  were emitted.

The production-composed API run can emit the existing test-harness warning that
the notification outbox port is not registered. It does not fail the suite and
does not mutate tenant data.

Focused suites added or updated include threshold semantics, Answer Writer,
language detector, intent routing and knowledge signals, Knowledge Gap
authorization, document policy preview performance, request-scoped permissions,
notification factory/display utilities, document empty states, local storage,
offline fonts, production workflow, and contextual follow-up behavior.

## Tenant Data Safety

No command in this stabilization work was intended to delete or alter data for
all tenants. Specifically:

- `MONGODB_URI` was unset during the official test run.
- Tests used disposable in-memory databases named `documind-test-<uuid>` through
  the repository's official runner.
- Test teardown uses `deleteMany` only inside those disposable databases; no
  production database was targeted. No migration, production seed, database
  drop, `git clean`, reset, stash, or broad cleanup command was run.
- The Redis container started for local readiness was limited to
  `127.0.0.1:6379`.
- The already-running Compose stack was inspected and only the existing API
  container was restarted so its watch process loaded the verified route
  changes. No Compose startup, seed command, migration, or write probe was run.
- The live verification probe performed permission and Knowledge Gap GET
  requests only. It selected an existing active scoped employee identity,
  printed no token, credential, user identifier, or tenant data, and created no
  database records.
- No unrestricted retrieval over all tenant documents was introduced.
- Authorization remains the owner of tenant, document, department,
  classification, explicit-deny, custom-role, and `use_in_ai` decisions.

Before any future local demo, verify the API database target and seed settings
explicitly. Do not run destructive database commands against a configured tenant
URI.

## Known Limitations and Review Notes

- Final qualifier prose depends on a healthy model provider; deterministic
  evidence preservation is verified.
- Pure-Arabic knowledge signal asymmetry remains non-blocking and was not “fixed”
  with a large phrase dictionary.
- `hasNumericConsistencyViolation` remains intentionally unit-scoped; changing
  it would alter answer refusal behavior and is outside this stabilization.
- Three-plus-document composite title ambiguity remains a safe clarification
  case.
- Live provider and external OCR manual checks can be blocked by 429/502 or
  unavailable services.
- App lint has 20 pre-existing warnings but zero errors.

## Final Git Snapshot

At the latest report update, the branch is `fix/v1-final-stabilization`, based
on `rag-rbac-integration`, and the last committed change is `86db508`. The
owner-requested authorization-constrained Knowledge Gap source/test edits are
intentionally uncommitted for owner review, together with this report and the
two plans listed above. The current source changes are limited to:

- `api/src/modules/chat/chatWorkflowService.ts`;
- `api/src/modules/chat/__tests__/chatWorkflowService.test.ts`; and
- `api/src/modules/chat/__tests__/chat.productionWorkflow.e2e.test.ts`;
- `api/src/modules/knowledge-gaps/knowledge-gaps.controller.ts`;
- `api/src/db/models/knowledgeGap.model.ts`;
- `api/src/modules/knowledge-gaps/knowledge-gaps.repository.ts`;
- `api/src/modules/knowledge-gaps/knowledge-gaps.routes.ts`;
- `api/src/modules/knowledge-gaps/knowledge-gaps.service.ts`;
- `api/src/modules/knowledge-gaps/knowledge-gaps.scope.test.ts`;
- `api/src/modules/permissions/permissions.controller.ts`;
- `api/src/modules/permissions/permissions.controller.test.ts`;
- `app/src/providers/permission-provider.tsx`;
- `app/src/providers/__tests__/permission-provider.test.tsx`;
- `app/src/app/(dashboard)/dashboard/knowledge-gaps/[id]/page.tsx`;
- `app/src/types/api/knowledge-gaps.types.ts`;
- `app/src/services/permissions.service.ts`; and
- `app/src/lib/__tests__/api-client.test.ts`.

No push, merge, pull request, database migration, or production deployment was
performed. The Next.js development server was verified on
`http://127.0.0.1:3001` because this sandbox denied binding to
`0.0.0.0:3000`; the temporary server was stopped after verification.

The final review command should show the report plus the intentionally
uncommitted Issue #16 source/test edits:

```text
git status --short
git diff --check
git log --oneline --decorate -20
```

## Final Retrieval Review Addendum (2026-08-20)

The earlier Issue #16 verification block above predates the final retrieval
review pass. The current working tree additionally includes:

- canonical `authorizedDocumentIds` provenance detection and tenant-scoped
  probing that removes only the authorization allowlist;
- legacy scoped partial-result probing, with partial results remaining
  `AUTHORIZED_RESULTS` and terminal empty results reported as
  `NO_AUTHORIZED_DOCUMENTS`;
- active-document and hidden-document validation during probes;
- fail-closed empty allowlist/query intersections;
- `RETRIEVAL_UNAVAILABLE` when probe infrastructure is unavailable for empty or
  insufficient retrieval;
- fail-closed handling for public `dateFrom`, `dateTo`, and `versionIds`
  filters, which do not yet have a complete adapter/provider representation;
- regressions for these cases in retrieval outcomes and Knowledge Gap
  authorization tests.

Final focused verification after that review:

- retrieval outcomes: 17/17 passed;
- retrieval authorization: 8/8 passed;
- retrieval multi-variant: 9/9 passed;
- Knowledge Gap authorization: 16/16 passed;
- chat workflow Vitest suite: 106/106 passed;
- API TypeScript check: passed;
- `git diff --check`: passed, with only line-ending/global-ignore warnings.

The final working tree also contains the retrieval files omitted from the
earlier snapshot: `api/src/modules/retrieval/retrieval.service.ts`,
`retrieval.outcomes.test.ts`, and `retrieval.multiVariant.test.ts`.

Temporary compiled-test output is ignored by `.gitignore` and is not intended
for the commit.

READY FOR OWNER V1 REVIEW
