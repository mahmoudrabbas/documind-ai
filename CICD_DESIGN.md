# DocuMind AI — CI/CD Pipeline Design

Scoped intentionally small: **1 required workflow, 0-1 optional workflow, zero deploy YAML if you take the recommended path.** Everything below is sized for a 6-person student team, not an enterprise platform team.

---

## 1. Folder Structure

```
documind-ai/
└── .github/
    ├── workflows/
    │   └── ci.yml                 # the only required workflow
    ├── CODEOWNERS                 # you already have this
    └── PULL_REQUEST_TEMPLATE.md   # you already have this
```

That's it. No `deploy-frontend.yml` and no `deploy-backend.yml` in the required set — see point 8 for why, and point 10 for an optional one if you want it anyway.

---

## 2. How Many Workflows

**One.** `ci.yml`. It runs on every push and PR targeting `main`, and internally splits into a backend job and a frontend job (since you're a monorepo with `api/` and `app/`) using path filtering — so touching only the frontend doesn't waste minutes rebuilding the backend, and vice versa.

If you later add the optional deploy trigger from point 10, that's workflow #2. You do not need more than that for a project this size. Enterprise setups add separate workflows per environment (staging/prod), per service, security scanning, dependency-bots, etc. — deliberately out of scope here per your ask.

---

## 3. What the Workflow Does

**`ci.yml`** runs on every `push` to `main` and every `pull_request` targeting `main`:

1. **Detect what changed** — a small filter job checks whether `api/**` or `app/**` files changed in this push/PR.
2. **Backend job** (only runs if `api/**` changed):
   - Checkout code
   - Setup Node.js with npm cache (this is the "cache dependencies" step — GitHub's official `setup-node` action handles it natively, no extra config needed)
   - `npm ci` (install)
   - ESLint
   - `tsc --noEmit` (type-check without emitting files)
   - Unit tests (if present)
   - Build
3. **Frontend job** (only runs if `app/**` changed): identical shape, using `app/`'s scripts.
4. **Any failed step fails the whole job**, which blocks merge once branch protection is turned on (point 7).

Both jobs run in parallel, not sequentially — so a PR touching both frontend and backend still finishes in the time of the slower one, not the sum of both.

---

## 4. Best Practices Applied (and why each one matters here)

- **Path-filtered jobs, not one giant job** — avoids wasting free-tier Actions minutes rebuilding the backend when only a frontend file changed. GitHub Actions free tier gives you 2,000 minutes/month on a private repo; this stretches that further.
- **`npm ci` not `npm install`** — installs exactly what's in `package-lock.json`, reproducible and faster in CI. `npm install` can silently update the lockfile, which you don't want happening inside CI.
- **Dependency caching via `setup-node`'s built-in cache** — avoids re-downloading `node_modules` from npm's registry on every run; this alone often cuts CI time by 30-60%.
- **`--if-present` on lint/test scripts** — right now your `api/package.json` has no `lint` or `test` script yet, and `app/package.json` has no `test` script. Using `--if-present` means the workflow won't hard-fail on a missing script today, but will start enforcing it the moment you add one — no workflow edit needed later. **You should still add these scripts soon** (see the gap flagged below).
- **`tsc --noEmit` as a separate step from build** — catches type errors explicitly and quickly, rather than relying on the bundler's type-checking (which can be slower or, in some Next.js configs, skipped by default).
- **Fail-fast, not fail-silent** — every step's non-zero exit code fails the job by default; no step deliberately swallows errors.
- **Required checks, not required workflows** — branch protection (point 7) references the specific job names (`backend-ci`, `frontend-ci`), not the workflow file itself, so a skipped job (because that path didn't change) still counts as passing rather than blocking your merge.

**Gap to close soon, not blocking:** neither `api/package.json` nor `app/package.json` currently defines a `test` script (no Jest/Vitest installed yet), and `api/package.json` has no `lint` script. The CI workflow is written to tolerate this today, but real coverage requires adding: `jest` + `supertest` + `mongodb-memory-server` to `api/` (matches the tech recommendations from your architecture review), and `vitest` or Jest to `app/`. Until then, the "Run unit tests" step effectively does nothing — worth being honest with your supervisor about that gap rather than letting a green checkmark imply test coverage that doesn't exist yet.

---

## 5. Required GitHub Secrets

**For the CI workflow itself: none.** Linting, type-checking, and building don't need real database credentials or API keys.

**For the optional deploy workflow (point 10), if you choose to use it:**

| Secret | Used for |
|---|---|
| `RENDER_DEPLOY_HOOK_URL` | Triggers a Render deploy via a plain HTTPS POST — no API key needed, Render generates this URL per-service |

That's the only one. You do **not** need to put `MONGODB_URI`, JWT secrets, or LLM API keys into GitHub Secrets at all, because — per point 8 — GitHub Actions isn't the thing running your app in production. Those live in Vercel's and Render's own dashboards instead.

---

## 6. Required Environment Variables

These are **not** GitHub Secrets — they're configured directly in each hosting platform's dashboard, since that's where your app actually runs.

**Backend (Render/Railway/Fly dashboard):**
```
NODE_ENV=production
PORT=5000
MONGODB_URI=<your MongoDB Atlas connection string>
JWT_ACCESS_SECRET=<random string, 32+ chars>
JWT_REFRESH_SECRET=<different random string, 32+ chars>
CORS_ORIGIN=https://your-app.vercel.app
```
Add later as those modules land: `REDIS_URL` (once BullMQ/rate-limiting is built), an LLM provider key (`OPENAI_API_KEY` or equivalent), and embedding/OCR provider config.

**Frontend (Vercel dashboard):**
```
NEXT_PUBLIC_API_URL=https://your-backend.onrender.com
NODE_ENV=production
```
Anything prefixed `NEXT_PUBLIC_` is bundled into client-side JS and is **not** a secret by the time it ships — never put a real secret behind that prefix.

**Local development (`.env` files, already gitignored):** unchanged from what you have — this doc only concerns CI/deploy, not local dev.

---

## 7. Branch Protection Rules

On `main`, in repo Settings → Branches → Add rule:

- ✅ **Require a pull request before merging** — no direct pushes to `main`, including for repo admins (check "Include administrators")
- ✅ **Require approvals: 1** (bump to 2 for paths matching your CODEOWNERS entries touching `api/src/common/middlewares/` or `api/src/modules/auth/` — tenant-isolation-critical code, per your existing Git workflow doc)
- ✅ **Require status checks to pass before merging** — select `backend-ci` and `frontend-ci` specifically (not the path-filter job) as required checks
- ✅ **Require branches to be up to date before merging** — forces a rebase/merge of `main` into the PR branch first, catching conflicts before merge rather than after
- ✅ **Require conversation resolution before merging** — no unresolved PR review comments at merge time
- ❌ Do not allow force pushes to `main`
- ❌ Do not allow deletion of `main`

This is what actually gates bad code — the CI workflow only produces a red/green signal; branch protection is what makes that signal binding.

---

## 8. Should Deployment Be GitHub Actions, or Native Vercel/Render?

**Native Vercel/Render, not GitHub Actions.** This is the single biggest simplification available to you, and it's genuinely the production-standard choice for exactly this stack, not a "beginner shortcut."

**Why:**
- Both Vercel and Render have a **native GitHub App integration**: connect the repo once, tell it which folder to build from (`app/` or `api/`), and it deploys automatically on every push to `main` — zero YAML, zero secrets in GitHub, zero maintenance.
- They each run their **own build step** as part of deploying (`next build` for Vercel, `npm run build && npm start` for Render), so a broken build still fails the deploy even without GitHub Actions being involved.
- Using GitHub Actions to deploy would mean managing deploy credentials as GitHub Secrets, writing and maintaining deploy scripts, and duplicating logic these platforms already provide for free — pure added complexity for a team of 6 students, with no corresponding benefit at this scale.
- The quality gate still exists — it just lives in **branch protection**, not in the deploy step. Nothing merges to `main` unless `backend-ci`/`frontend-ci` pass; only merged code ever reaches Vercel/Render. That's the same safety property an Actions-based deploy pipeline would give you, achieved with less to maintain.

**Setup (one-time, ~10 minutes each):**
- **Vercel:** New Project → Import your GitHub repo → set Root Directory to `app` → deploy. Every push to `main` (i.e., every merged PR) auto-deploys; every PR also gets its own free preview URL automatically, which is a nice bonus for reviewing UI changes before merge.
- **Render:** New Web Service → connect the same repo → set Root Directory to `api`, Build Command `npm install && npm run build`, Start Command `npm start` → deploy. Same auto-deploy-on-merge behavior.

---

## 9. Complete CI/CD Architecture Diagram

```
Developer                                                                
    │
    │  git push origin feature/t2.1.1-...
    ▼
┌─────────────────────────────┐
│   Pull Request opened        │
│   (target: main)             │
└───────────────┬──────────────┘
                │  triggers
                ▼
┌───────────────────────────────────────────────────────────┐
│  GitHub Actions: ci.yml                                    │
│                                                              │
│   ┌────────────────┐                                        │
│   │  changes job    │  detects api/** or app/** touched      │
│   └───────┬─────────┘                                        │
│           │                                                  │
│   ┌───────┴────────┐          ┌────────────────┐            │
│   │  backend-ci     │          │  frontend-ci    │            │
│   │  (if api/** )   │          │  (if app/** )   │            │
│   │  npm ci          │          │  npm ci          │            │
│   │  eslint          │          │  eslint          │            │
│   │  tsc --noEmit    │          │  tsc --noEmit    │            │
│   │  tests           │          │  tests           │            │
│   │  build           │          │  build           │            │
│   └───────┬─────────┘          └────────┬─────────┘            │
│           │                              │                      │
│           └──────────┬───────────────────┘                      │
└──────────────────────┼──────────────────────────────────────────┘
                        │  both green?
                        ▼
        ┌───────────────────────────────┐
        │  Branch protection on main     │
        │  - status checks required      │
        │  - 1-2 approvals required      │
        └───────────────┬────────────────┘
                         │  merge allowed
                         ▼
              ┌────────────────────┐
              │  Merge to main       │
              └──────────┬───────────┘
                         │
        ┌────────────────┴─────────────────┐
        │  triggers (native, not Actions)   │
        ▼                                    ▼
┌───────────────────┐              ┌────────────────────┐
│  Vercel             │              │  Render              │
│  builds app/         │              │  builds+runs api/     │
│  deploys frontend     │              │  deploys backend       │
│  → your-app.vercel.app│              │  → your-api.onrender.com│
└──────────┬──────────┘              └──────────┬───────────┘
           │                                     │
           │          both talk to               │
           └───────────────┬─────────────────────┘
                            ▼
                 ┌────────────────────────┐
                 │  MongoDB Atlas           │
                 │  (always-on, no deploy    │
                 │   step — just a           │
                 │   connection string)       │
                 └────────────────────────┘
```

---

## 10. Example Workflow Files

`ci.yml` is the required file — see the companion file for the ready-to-use version.

An **optional** `deploy-backend.yml` is also included, only for the case where you specifically want a visible "Deploy" entry in your Actions tab in addition to Render's native dashboard. It is *not* required if you set up Render's native GitHub integration per point 8 — that already auto-deploys on merge with no YAML at all. Only add this file if you disable Render's auto-deploy-on-push and want deploys explicitly gated behind `ci.yml` passing first (a slightly more conservative setup some teams prefer).
