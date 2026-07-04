# DocuMind AI — Git Workflow & Version Control Strategy

**Team:** 6 developers (Mahmoud Ramadan, Marco Reda, Omar Abdelsattar, Isac Nady, Abdullah Adel, Sohyla Gomaa)
**Stack:** Next.js (App Router) · Express.js/TS · MongoDB · Docker · BullMQ

This document defines how the team creates branches, writes commits, opens PRs, reviews code, merges, releases, and versions the project. Every rule below has a stated reason — the goal is to minimize merge conflicts and blockers for a 6-person team shipping in short (2–3 day) sprints, not to add process for its own sake.

---

## 1. Repository Strategy

**Decision: Single monorepo** (`documind-ai/`) containing `frontend/`, `backend/`, `workers/`, and shared config — not separate repos per service.

```
documind-ai/
├── frontend/       # Next.js app
├── backend/        # Express API
├── workers/        # BullMQ processors (may share backend/ providers & db modules)
├── docs/
├── .github/
│   └── workflows/
├── docker-compose.yml
└── package.json    # workspace root (npm/yarn/pnpm workspaces)
```

**Reasoning:**
- The RAG pipeline is inherently cross-cutting — a change to `document_chunks` schema affects the ingestion worker, the retrieval module, and the frontend's document-status UI simultaneously. A monorepo lets one PR touch all three atomically, with one CI run and one merge, instead of coordinating three separate PRs across three repos and hoping the deploy order lines up.
- At 6 developers and one product, the coordination overhead of multi-repo (shared versioning of internal packages, cross-repo dependency bumps, synchronized releases) costs more than it saves. Multi-repo pays off at the scale of independent teams shipping independent services — not yet the case here.
- A single CI pipeline can run lint/test/build for all three services on every push, catching cross-service breakage (e.g., a backend DTO change breaking the frontend's type import) before merge, which is exactly the kind of bug that's expensive to catch post-merge across separate repos.
- Trade-off acknowledged: monorepos can suffer from noisy history and slower CI as they grow. Mitigated here by path-based CI triggers (only run frontend tests if `frontend/` changed, etc.) — see Section 9.

---

## 2. Branching Strategy

**Decision: Trunk-based development with short-lived feature branches**, not long-lived Git Flow-style `develop`/`release` branches.

```
main                          ← always deployable; protected
 ├── feature/T2.3.1-tenant-scoping-middleware
 ├── feature/T4.2.3-ocr-arabic-pipeline
 ├── fix/T5.3.4-refusal-threshold-off-by-one
 └── hotfix/prod-vector-index-filter
```

**Reasoning:**
- Given the project's own sprint structure (2–3 day sprints, dependency chains where one dev's output unblocks the next), branches need to merge back into `main` fast — within a day or two, not sit open for a week. A `develop` branch (classic Git Flow) adds a second long-lived integration point that has to be kept in sync with `main`, which is unnecessary overhead for a team this size shipping this frequently.
- Short-lived branches directly serve the "minimize merge conflicts" requirement from sprint planning: the longer a branch lives, the more `main` drifts underneath it, and the worse the eventual merge conflict. Branches scoped to a single Technical Task (1–2.5 days each, per the task breakdown) naturally stay short.
- `main` is kept always-deployable via required CI checks + PR review (Section 8), so there's no need for a separate "stable" branch — `main` *is* the stable branch.
- One branch per Technical Task ID (not per developer, not per Epic) keeps branch scope matched to PR scope matched to issue scope — a direct line from the GitHub Issues backlog to the branch that closes it.

---

## 3. Git Flow (Day-to-Day Developer Workflow)

```
1. git checkout main && git pull origin main
2. git checkout -b feature/T4.2.5-semantic-chunking
3. ... commit work in small, logical commits ...
4. git push origin feature/T4.2.5-semantic-chunking
5. Open PR → target: main
6. CI runs (lint, typecheck, unit tests, build)
7. Request review from 1+ teammate
8. Address feedback → push additional commits
9. Squash-merge into main (see Section 8)
10. Delete feature branch (local + remote)
```

**Reasoning:**
- Rebasing onto `main` before opening the PR (`git pull --rebase origin main`) is required when `main` has moved, rather than merging `main` into the feature branch — this keeps history linear and avoids merge-commit noise inside feature branches, making PR diffs easier to review.
- Step 9 (delete branch after merge) is not just tidiness — with 6 developers each potentially having 2–4 branches per sprint, stale branches make it hard to tell what's actually in flight, which directly undermines the "avoid blockers" goal from sprint planning: someone can't tell if `feature/T4.2.5-...` is done, abandoned, or still active.
- This flow assumes CI is fast (under ~5 minutes) — see Section 9 — since developers are expected to wait for it before requesting review, not after merge.

---

## 4. Naming Conventions

### Branches
```
<type>/<task-id>-<short-kebab-description>
```
| Type | Use for | Example |
|---|---|---|
| `feature/` | New functionality (maps to a Technical Task) | `feature/T5.3.5-citation-verification` |
| `fix/` | Bug fix on `main` | `fix/T4.1.3-upload-mime-validation` |
| `hotfix/` | Urgent production fix (see Section 11) | `hotfix/prod-jwt-refresh-race` |
| `chore/` | Tooling, config, deps, no product behavior change | `chore/upgrade-mongoose-8` |
| `docs/` | Documentation only | `docs/api-v1-swagger` |
| `refactor/` | Internal restructuring, no behavior change | `refactor/repository-pattern-cleanup` |

**Reasoning:** Including the Task ID (e.g., `T5.3.5`) directly ties every branch back to a GitHub Issue from the backlog — anyone can find the issue for a branch (or vice versa) without asking. The `type/` prefix lets CI and tooling filter branches (e.g., auto-label PRs by branch prefix) and lets developers instantly gauge risk/intent from `git branch -a` output — a `hotfix/` branch signals "drop what you're doing and review this," a `chore/` branch does not.

### Commit messages
See Section 5 (Conventional Commits).

### Tags / Releases
```
v<major>.<minor>.<patch>   e.g. v1.2.0
```
See Section 12 (Versioning).

---

## 5. Commit Convention — Conventional Commits

**Decision: Enforce [Conventional Commits](https://www.conventionalcommits.org/) via commit-msg hook (`commitlint` + `husky`).**

```
<type>(<scope>): <short summary>

[optional body — the "why", not the "what"]

[optional footer — BREAKING CHANGE:, Refs: #123, Closes: #123]
```

| Type | Meaning | Example |
|---|---|---|
| `feat` | New feature | `feat(auth): add refresh-token rotation with reuse detection` |
| `fix` | Bug fix | `fix(retrieval): correct tenant filter in vector search query` |
| `chore` | Tooling/deps/config, no src behavior change | `chore(deps): bump mongoose to 8.4.0` |
| `docs` | Documentation only | `docs(api): document /auth/refresh endpoint` |
| `refactor` | Code change that neither fixes a bug nor adds a feature | `refactor(repositories): extract tenant-scoped query wrapper` |
| `test` | Adding/correcting tests | `test(tenant-isolation): add cross-tenant leak regression test` |
| `perf` | Performance improvement | `perf(embedding): batch embedding calls instead of per-chunk` |
| `ci` | CI/CD pipeline changes | `ci: add path-based triggers for frontend/backend` |
| `style` | Formatting only, no logic change | `style: apply prettier to workers/` |
| `revert` | Reverts a previous commit | `revert: feat(auth) add refresh-token rotation` |

**Scope** = the module/feature touched, matching the folder structure (`auth`, `documents`, `retrieval`, `chat`, `citations`, `analytics`, `workers`, `infra`).

**Reasoning:**
- **Machine-readable history enables automated changelogs and semantic version bumps** (Section 12) — `feat` → minor bump, `fix` → patch bump, `BREAKING CHANGE:` footer → major bump. This removes a human judgment call ("is this a minor or major release?") and replaces it with a deterministic rule derived directly from commit history.
- **`git log --oneline` becomes genuinely useful for debugging**: when a regression appears in `document_chunks` retrieval, `git log --oneline -- backend/src/modules/retrieval` filtered to `fix|feat` immediately narrows the search space, instead of scrolling through commits titled "wip", "fix stuff", "asdf".
- Enforcing via a `commitlint` git hook (not just a style guide in a README) matters because convention that isn't enforced decays within a sprint on a 6-person team under deadline pressure — this is a lesson repeated across real-world projects, not a hypothetical.
- Body/footer requirement for **why**, not **what**, exists because the diff already shows *what* changed; the commit message's only unique value is capturing context that won't be obvious from the code six months later (e.g., "why 900 tokens and not 1000" for a chunking-size decision).

---

## 6. Pull Request Template

Save as `.github/PULL_REQUEST_TEMPLATE.md`:

```markdown
## Summary
<!-- What does this PR do, in 1-3 sentences? -->

## Related Issue
Closes #<issue-number>
Task ID: T<x.x.x>

## Type of Change
- [ ] feat — new feature
- [ ] fix — bug fix
- [ ] refactor — no behavior change
- [ ] chore / ci / docs
- [ ] BREAKING CHANGE

## Description
<!-- What changed and why. Link to any relevant architecture/SRS section. -->

## How Has This Been Tested?
- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] Manually tested locally (describe steps)
- [ ] N/A (docs/chore only)

## Screenshots (if UI change)
<!-- Before/after, or a short recording -->

## Tenant Isolation / Security Checklist (required if touching DB queries, auth, or file access)
- [ ] All new DB queries go through the tenant-scoped repository wrapper (no direct `Model.find()` bypassing `tenantId`)
- [ ] `tenantId` is derived from the authenticated session/JWT, never from request body/query params
- [ ] New endpoints have the auth guard + role guard applied
- [ ] No secrets, API keys, or credentials committed

## Checklist
- [ ] Code follows the project's style guide (lint passes)
- [ ] Self-reviewed the diff before requesting review
- [ ] Added/updated relevant documentation
- [ ] No new warnings introduced
- [ ] CI passes
```

**Reasoning:**
- The **Tenant Isolation / Security Checklist** is not generic boilerplate — it directly encodes the SRS's "golden rule" (NFR-SEC-01/02) and the architecture review's #1 flagged risk (a single missed tenant filter = a data breach). Making it a required, visible checkbox on every relevant PR turns an easy-to-forget architectural principle into something a reviewer is explicitly prompted to verify, every time.
- **"Closes #issue"** auto-links the PR to the GitHub Issue and auto-closes it on merge — keeping the issue tracker accurate without manual bookkeeping, which matters once there are 120+ issues in flight.
- Requiring an explicit **Type of Change** on the PR (mirroring the commit type) catches mismatches early — e.g., a PR labeled "fix" that actually introduces new behavior should prompt a scope conversation before merge, not after.

---

## 7. Code Review Checklist

Used by reviewers before approving any PR:

**Correctness**
- [ ] Code does what the PR description and linked issue say it does
- [ ] Edge cases handled (empty input, missing fields, concurrent requests)
- [ ] Error paths return the standardized error envelope (`{error:{code,message,details}}`)

**Security & Tenant Isolation** *(highest priority — see Section 6)*
- [ ] No query bypasses the tenant-scoped repository wrapper
- [ ] No `tenantId`/`userId` accepted from client input where it should come from the JWT
- [ ] Uploaded-file handling validates MIME type and size, not just file extension
- [ ] No secrets or credentials in code, comments, or logs

**Design**
- [ ] Change fits the module boundaries defined in the architecture (e.g., retrieval logic doesn't leak into the chat module)
- [ ] No unnecessary duplication of logic that already exists in `common/` or `providers/`
- [ ] Async/queue-based work isn't blocking a synchronous request path (per the architecture review's bottleneck findings)

**Tests**
- [ ] New logic has test coverage proportional to its risk (auth, tenant isolation, and RAG-answer correctness require tests; a UI label change does not)
- [ ] Tests actually assert behavior, not just "doesn't throw"

**Readability & Maintainability**
- [ ] Naming is clear and consistent with existing modules
- [ ] No commented-out dead code left in
- [ ] Complex logic has a short comment explaining *why*, where non-obvious

**Performance (when relevant)**
- [ ] No N+1 queries or per-item sequential API/DB calls where batching is possible (per the architecture review's embedding-call bottleneck finding)

**Reasoning:**
- The checklist is ordered by risk, not alphabetically — **Security & Tenant Isolation sits above Design and Readability** deliberately, because the architecture review identified it as the single point-of-catastrophic-failure risk in the whole system. A reviewer skimming under time pressure sees the highest-stakes items first.
- The checklist is intentionally short enough to actually get used every PR — a 40-item checklist gets rubber-stamped; a 15-item, risk-ordered one gets read.

---

## 8. Merge Strategy

**Decision: Squash-and-merge into `main`, for every PR, no exceptions.**

```
feature/T5.3.5-citation-verification (4 commits: wip, wip, fix typo, address review)
                        │
                        ▼ squash-merge
main: 1 commit — "feat(citations): add claim-to-chunk citation verification (#87)"
```

**Reasoning:**
- Feature branches inevitably accumulate "wip", "fix lint", "address review comments" commits during development — these are useful *during* review but are noise in `main`'s permanent history. Squashing keeps `main`'s log at one commit per shippable unit of work, which is exactly the granularity Conventional Commits + automated changelogs need (Section 5, 12).
- Squash-merge preserves a clean, revertable history: `git revert <sha>` on `main` cleanly undoes one whole feature/fix, rather than requiring reverting a chain of 4 messy commits.
- Rejected alternative — **merge commits** (`--no-ff`): preserves branch topology but clutters `main` with merge-commit noise and makes `git bisect` harder across a 6-person team's overlapping branches.
- Rejected alternative — **rebase-and-merge** (replay individual commits): would preserve granular history, but only if developers are disciplined about atomic, well-messaged commits *during* development — which is a nice aspiration but not realistic to enforce under sprint deadlines. Squash gets the same clean-history benefit without requiring that discipline.
- **Branch protection rules on `main`** (enforced in GitHub settings) that make this work:
  - Require PR before merging (no direct pushes to `main`, including for admins)
  - Require 1 approving review minimum (2 for changes touching `auth/`, `common/middlewares/tenant-scoping`, or `db/repositories/` — the tenant-isolation-critical paths)
  - Require status checks to pass (lint, typecheck, unit tests, build) before merge is allowed
  - Require branches to be up to date with `main` before merging (forces a rebase, catching conflicts before merge, not after)

---

## 9. Release Strategy

**Decision: Continuous deployment to a staging environment on every merge to `main`; explicit tagged releases for production.**

```
merge to main → CI/CD auto-builds Docker images → auto-deploys to staging
                                                          │
                                     (manual QA / demo review on staging)
                                                          │
                                                          ▼
                                team tags a release: git tag v1.2.0
                                                          │
                                                          ▼
                                CI/CD builds from tag → deploys to production
```

**Reasoning:**
- Given the project's sprint structure ends with a demo milestone, staging must always reflect the latest merged work automatically — nobody should have to remember to "deploy to staging," which is exactly the kind of manual step that gets skipped under deadline pressure right before a demo.
- Production deploys are **not** automatic on every merge — they're gated behind an explicit tag, because production stability matters more than deploy speed for a system handling tenant-isolated company data. This is a deliberate asymmetry: fast iteration to staging, deliberate promotion to production.
- CI pipeline is **path-aware** (per Section 1): a PR touching only `frontend/` doesn't rebuild/retest the backend and vice versa, keeping CI fast enough that the "wait for CI before requesting review" step in Section 3 doesn't become a bottleneck.
- Docker images are tagged with both the git SHA (for traceability — "which exact commit is running in staging right now?") and the semantic version (for production releases) — e.g., `documind-backend:sha-a1b2c3d` and `documind-backend:v1.2.0`.

---

## 10. Hotfix Strategy

**Decision: Dedicated `hotfix/` branch cut from `main` (or from the production tag if `main` has since diverged), fast-tracked review, back-merged immediately.**

```
production (v1.2.0) has a bug
        │
        ▼
git checkout -b hotfix/prod-jwt-refresh-race v1.2.0
        │
    fix + test
        │
        ▼
PR → main (expedited: 1 reviewer, same-day)
        │
        ▼
merge → tag v1.2.1 → deploy to production immediately
        │
        └─→ if main has moved on, cherry-pick the hotfix commit forward to confirm no conflict
```

**Reasoning:**
- Branching from the **production tag**, not from current `main`, matters because `main` may already contain unreleased work-in-progress from the current sprint — deploying a hotfix built on top of unfinished features would ship unvetted changes to production alongside the actual fix. This is the one case in this workflow where branching from something other than `main`'s tip is correct.
- "Expedited: 1 reviewer, same-day" is an explicit, named exception to the normal 1–2 reviewer standard — stated up front so that during an actual incident, nobody has to debate in the moment whether it's okay to move faster. Ambiguity during an incident costs time that matters.
- The **patch version bump** (v1.2.0 → v1.2.1, Section 12) is automatic and unambiguous under semantic versioning specifically because hotfixes are, by definition, `fix` commits.
- Explicitly forward-merging/cherry-picking into `main` prevents the classic hotfix bug: fixing production but silently losing the fix the next time `main` is deployed, because the fix only ever lived on a branch that was deleted after the hotfix deploy.

---

## 11. Versioning Strategy

**Decision: [Semantic Versioning (SemVer)](https://semver.org/) — `MAJOR.MINOR.PATCH` — derived automatically from Conventional Commit history via `semantic-release` or equivalent tooling.**

| Bump | Triggered by | Example |
|---|---|---|
| **MAJOR** (`x.0.0`) | A commit with a `BREAKING CHANGE:` footer, or `!` after type (e.g., `feat(auth)!: ...`) | Changing the auth model from session-based to JWT-only, breaking existing client integrations |
| **MINOR** (`1.x.0`) | One or more `feat:` commits since the last release | Adding the Knowledge Gap dashboard |
| **PATCH** (`1.2.x`) | Only `fix:` (and non-breaking `chore`/`refactor`/etc.) commits since the last release | Fixing the tenant-filter bug in vector search |

**Reasoning:**
- Deriving the version bump **mechanically from commit types**, rather than a human deciding "does this feel like a minor or major release," removes a recurring source of inconsistency — different developers have different intuitions about what counts as "major," and SemVer's contract (MAJOR = breaking, MINOR = additive, PATCH = fix) only holds if it's applied the same way every time.
- This directly depends on Section 5 (Conventional Commits) being genuinely enforced — semantic versioning automation is only as reliable as the commit history feeding it. This is why the commit convention is enforced via a git hook rather than left as a guideline.
- SemVer specifically (over, say, date-based versioning like `2026.07.04`) is the right choice here because DocuMind AI exposes a versioned REST API (`/api/v1/...`, per the API design recommendations) — API consumers (the frontend, and any future third-party integrations) need a version number that actually communicates compatibility risk, which date-based versioning does not.
- Pre-1.0 exception: while the MVP is being built (before the first production release), versions stay in the `0.x.y` range, where by SemVer convention even `MINOR` bumps may include breaking changes — signaling accurately to the team that the API is still stabilizing. The jump to `1.0.0` is a deliberate, discussed milestone marking "the MVP checklist's Must-Have list is complete and stable," not an automatic event.

---

## Summary: Why This Set of Choices Fits This Specific Project

Every decision above optimizes for the same three constraints that showed up repeatedly across the architecture review, task breakdown, and sprint planning for this project:

1. **A small team (6 devs) shipping in very short cycles (2–3 day sprints)** → trunk-based development with short-lived branches, squash-merges, and fast path-aware CI, so process never becomes the bottleneck.
2. **Tenant isolation as the single highest-stakes risk in the codebase** → a PR template and review checklist that put security/tenant-isolation checks front and center, not buried in generic boilerplate.
3. **A need for traceability from requirement → issue → branch → commit → release** → Task IDs in branch names, Conventional Commits tied to automatic changelogs and version bumps, and PRs that auto-close their linked GitHub Issue.

Nothing here is process for its own sake — every rule maps back to a risk or a friction point this specific project already surfaced.
