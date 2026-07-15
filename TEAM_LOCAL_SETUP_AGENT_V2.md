# DOCUMIND AI — Team Local Migration & Verification Guide

> **Purpose:** Give this file to any AI coding agent (Codex, Claude Code, OpenCode, Cursor, etc.) so it can safely update, configure, build, run, and verify the project after Issue 01.
>
> **Agent invocation:**  
> `Read TEAM_LOCAL_SETUP_AGENT.md completely, then execute it step by step. Do not skip safety checks. Stop and report before any destructive action or unresolved conflict.`

---

## 1. Mandatory Safety Rules

The agent must:

1. Work from the repository root.
2. Preserve all local work.
3. Never print, open, expose, or commit real secret values.
4. Never run:
   ```bash
   git reset --hard
   git clean -fd
   docker compose down -v
   ```
5. Never delete MongoDB or Redis named volumes.
6. Never overwrite an existing `.env` or runtime secret file without a backup.
7. Never resolve Git conflicts automatically unless the resolution is unambiguous and approved.
8. Never commit, push, merge, force-push, or rewrite Git history unless the developer explicitly requests it.
9. Use the Node/npm versions declared by the repository.
10. Stop immediately if a command could destroy uncommitted work.

---

## 2. Inspect the Current Repository State

Run:

```bash
git branch --show-current
git status --short
git log -1 --oneline
```

Determine the mode:

- **Mode A:** clean `main`
- **Mode B:** local modified or untracked work exists
- **Mode C:** developer is on an existing feature branch
- **Mode D:** first setup on this machine

Do not continue until the mode is clear.

---

## 3. Preserve Local Work

### Clean main

Confirm:

```bash
git status --porcelain
```

The output should be empty.

### Local work exists

Show only file names:

```bash
git status --short
```

Ask whether to commit or stash the work.

Safe stash command:

```bash
git stash push -u -m "before Issue 01 team migration"
```

Do not continue until the work is preserved.

### Existing feature branch

Save the branch name:

```bash
CURRENT_BRANCH="$(git branch --show-current)"
printf 'Current branch: %s\n' "$CURRENT_BRANCH"
```

---

## 4. Back Up Local Configuration

Create a backup outside the repository:

```bash
BACKUP_DIR="$HOME/documind-local-backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR/secrets"
```

Copy existing local configuration without printing contents:

```bash
cp -a api/.env "$BACKUP_DIR/api.env" 2>/dev/null || true
cp -a app/.env.local "$BACKUP_DIR/app.env.local" 2>/dev/null || true
cp -a workers/.env "$BACKUP_DIR/workers.env" 2>/dev/null || true
cp -a secrets/*.txt "$BACKUP_DIR/secrets/" 2>/dev/null || true
```

Report only:

```bash
printf 'Local configuration backup: %s\n' "$BACKUP_DIR"
```

---

## 5. Update Git Safely

Fetch:

```bash
git fetch origin
```

### Mode A or D

```bash
git switch main
git pull --ff-only origin main
```

### Mode C

```bash
git switch main
git pull --ff-only origin main
git switch "$CURRENT_BRANCH"
git rebase origin/main
```

If a conflict occurs:

1. Stop.
2. Show conflicted file names only:
   ```bash
   git status --short
   ```
3. Explain the conflict.
4. Do not choose a resolution without developer approval.

After approved resolution:

```bash
git add <resolved-files>
git rebase --continue
```

---

## 6. Activate the Approved Toolchain

Use repository metadata as the source of truth:

```bash
cat .nvmrc
node -p "require('./package.json').packageManager || ''"
node -p "JSON.stringify(require('./package.json').engines || {})"
```

Activate Node:

```bash
nvm install
nvm use
```

Verify:

```bash
node --version
npm --version
```

Expected Issue 01 toolchain:

- Node.js 22
- npm 10.9.8

If npm differs from the repository declaration:

```bash
npm install --global npm@10.9.8
npm --version
```

Do not install dependencies with Node 24/npm 11.

---

## 7. Mandatory One-Time Dependency Migration

> **This section is mandatory for every team member the first time they pull the Issue 01 changes.**
>
> Issue 01 changed the approved Node/npm toolchain, moved the repository to a single root workspace lockfile, changed Docker build behavior, and affects native packages such as `argon2`. Existing `node_modules` directories must not be reused.

Before installing dependencies, delete all old local dependency and build outputs:

```bash
rm -rf node_modules
rm -rf api/node_modules
rm -rf app/node_modules
rm -rf workers/node_modules

rm -rf api/dist
rm -rf app/.next
rm -rf workers/dist
```

Do not delete the root `package-lock.json`.

Install from the single root lockfile:

```bash
MONGOMS_DISABLE_POSTINSTALL=1 npm ci
```

Validate the workspace dependency tree:

```bash
npm ls --workspaces --depth=0
```

This clean deletion and reinstall is required:

- the first time Issue 01 is pulled;
- whenever Node/npm versions change;
- whenever the root lockfile or workspace manifests change significantly;
- when native modules such as `argon2` fail;
- when the dependency tree is invalid or corrupted.

For normal daily pulls where dependency metadata did not change, do not repeat this full cleanup.

Do not add fake direct dependencies merely to hide optional platform WASM packages.

---

## 8. Create Local Environment Files

Copy examples only when targets do not exist:

```bash
cp -n api/.env.example api/.env
cp -n app/.env.example app/.env.local
cp -n workers/.env.example workers/.env
```

For local browser use:

```env
NEXT_PUBLIC_API_URL=http://localhost:5000
```

Do not introduce a production fallback to localhost.

---

## 9. Create Runtime Secret Files

Create runtime files from examples without overwriting existing files:

```bash
for example in secrets/*.txt.example; do
  target="${example%.example}"
  cp -n "$example" "$target"
done
```

Generate independent application secrets only when a copied placeholder remains:

```bash
for name in \
  api_jwt_secret \
  api_refresh_secret \
  api_email_verification_secret \
  api_password_reset_secret \
  api_super_admin_bootstrap_key
do
  file="secrets/${name}.txt"

  if grep -qE 'replace-me|example|change-me' "$file" 2>/dev/null; then
    node -e "process.stdout.write(require('node:crypto').randomBytes(48).toString('base64url'))" \
      > "$file"
  fi
done
```

Configure Docker-internal worker endpoints:

```bash
printf '%s' 'mongodb://mongodb:27017/docsai' > secrets/worker_mongodb_uri.txt
printf '%s' 'redis://redis:6379' > secrets/worker_redis_url.txt
```

The developer must manually enter the development SMTP password into:

```text
secrets/api_smtp_pass.txt
```

The agent must not ask for that value in chat and must not print it.

Protect files:

```bash
chmod 600 secrets/*.txt
```

---

## 10. Verify Secret Safety

Runtime secrets must be ignored:

```bash
FAILED=0

for file in secrets/*.txt; do
  if ! git check-ignore -q "$file"; then
    echo "ERROR: runtime secret is not ignored: $file"
    FAILED=1
  fi
done

test "$FAILED" -eq 0
```

Show tracked secret paths only:

```bash
git ls-files 'secrets/*'
```

Allowed:

- `secrets/README.md`
- `secrets/*.txt.example`

Forbidden:

- `secrets/*.txt`

Check local environment files:

```bash
git check-ignore api/.env app/.env.local workers/.env
```

Run:

```bash
npm run security:secrets
npm run test:security
```

---

## 11. Mandatory One-Time Docker Cleanup

> **This section is also mandatory the first time Issue 01 is pulled.**

Old anonymous Docker `node_modules` volumes can preserve binaries built against the previous image and cause native `argon2` or GLIBC incompatibility.

Remove only application containers and their anonymous volumes:

```bash
docker compose rm -sfv api app worker
docker compose down --remove-orphans
```

Never use:

```bash
docker compose down -v
```

---

## 12. Validate and Build Docker Images

Validate:

```bash
docker compose config --quiet
docker compose config --services
```

Expected services:

```text
mongodb
redis
worker
api
app
```

For the first migration after Issue 01:

```bash
docker compose build --no-cache --progress=plain api app worker
```

For routine updates:

```bash
docker compose build --progress=plain
```

Do not start services until required images build successfully.

---

## 13. Start the Project

```bash
docker compose up -d
```

Check status repeatedly:

```bash
for attempt in $(seq 1 24); do
  docker compose ps
  sleep 5
done
```

Expected:

- MongoDB: healthy
- Redis: healthy
- API: healthy
- App: healthy
- Worker: healthy

---

## 14. Diagnose Unhealthy Services

```bash
docker compose ps
docker compose logs api --tail=150
docker compose logs app --tail=150
docker compose logs worker --tail=150
docker compose logs mongodb --tail=50
docker compose logs redis --tail=50
```

### Known `argon2` symptom

```text
GLIBC_2.34 not found
```

Safe recovery:

```bash
docker compose rm -sfv api
docker compose build --no-cache --progress=plain api
docker compose up -d --force-recreate api
```

Do not downgrade security libraries to bypass the error.

---

## 15. Verify Health Endpoints

```bash
curl --fail --show-error http://localhost:5000/healthz
curl --fail --show-error http://localhost:5000/readyz
curl --fail --show-error http://localhost:3000/ready
```

For the worker, use its published health endpoint when available; otherwise verify through `docker compose ps` and logs.

---

## 16. Run Root Verification

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run security:secrets
npm run test:security
git diff --check
```

Do not silently ignore any failure.

---

## 17. Manual Browser Smoke Test

Ask the developer to open:

```text
http://localhost:3000
```

Minimum checks:

1. Landing page loads.
2. Login page loads.
3. Existing user can log in.
4. Logout works.
5. Company Admin dashboard loads.
6. Super Admin dashboard loads for an authorized account.
7. Browser console has no refresh loop, CORS error, or hydration failure.
8. Local browser requests target `http://localhost:5000`.

Do not claim these passed unless the developer confirms them or browser automation verified them.

---

## 18. Final Git Safety Check

```bash
git status --short
```

The following must never be staged as additions or modifications:

- `.env`
- `api/.env`
- `app/.env.local`
- `workers/.env`
- `secrets/*.txt`

Check staged sensitive paths:

```bash
if git diff --cached --name-only --diff-filter=AM | \
  grep -E '(^|/)\.env$|(^|/)\.env\.local$|^secrets/.*\.txt$'
then
  echo "ERROR: sensitive runtime file is staged"
  exit 1
fi
```

Do not commit or push unless explicitly instructed.

---

## 19. Required Final Report

Report exactly what was executed:

```text
Branch:
Update mode:
Node version:
npm version:
npm ci:
Dependency validation:
Compose validation:
API image build:
App image build:
Worker image build:
MongoDB status:
Redis status:
API status:
App status:
Worker status:
API healthz:
API readyz:
App ready:
Root lint:
Root typecheck:
Root tests:
Root build:
Secret scan:
Security tests:
Unexpected tracked changes:
Manual checks still required:
```

Never report `PASSED` for an action that was not executed.

---

# Routine Daily Update

Only after the mandatory one-time dependency migration and Docker cleanup have completed successfully:

```bash
git status
git pull --ff-only origin main
docker compose up -d
```

Run `npm ci` only when dependency metadata changes or the dependency tree requires a clean reinstall.

Run:

```bash
docker compose up --build -d
```

when Dockerfiles, Compose configuration, or application build inputs change.

---

# Prompt to Send to Any AI Agent

```text
Read TEAM_LOCAL_SETUP_AGENT.md completely and execute the correct mode for my current repository state.

Requirements:
- Preserve all local work.
- Do not use git reset --hard, git clean -fd, or docker compose down -v.
- Do not print or open real secret values.
- Do not commit, push, merge, or rewrite history.
- Stop on unresolved Git conflicts.
- Use the repository-defined Node/npm versions.
- Build and start the project, run all verification commands, and give me the required final report.
```
