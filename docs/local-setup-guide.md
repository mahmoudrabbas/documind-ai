# Local Development Setup Guide

> For colleagues onboarding the project. This guide walks through getting a fully working local environment including email sending.

---

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (with Docker Compose v2.6+)
- [Git](https://git-scm.com/)
- A Gmail account (for sending verification/password-reset emails)

---

## 1. Clone & Branch

```bash
git clone https://github.com/mahmoudrabbas/documind-ai
cd documind-ai
```

Checkout the feature branch you're working on:

```bash
git checkout feature/09-employee-import  # or your branch
```

---

## 2. Set Up Docker Secrets

Copy all `.example` files to their real names (gitignored — safe locally):

```bash
# From project root:
cp secrets/api_jwt_secret.txt.example        secrets/api_jwt_secret.txt
cp secrets/api_refresh_secret.txt.example     secrets/api_refresh_secret.txt
cp secrets/api_email_verification_secret.txt.example secrets/api_email_verification_secret.txt
cp secrets/api_password_reset_secret.txt.example     secrets/api_password_reset_secret.txt
cp secrets/api_smtp_pass.txt.example          secrets/api_smtp_pass.txt
cp secrets/api_super_admin_bootstrap_key.txt.example  secrets/api_super_admin_bootstrap_key.txt
cp secrets/worker_mongodb_uri.txt.example     secrets/worker_mongodb_uri.txt
cp secrets/worker_redis_url.txt.example       secrets/worker_redis_url.txt
```

**No need to change the placeholder values for local dev** — the defaults work with Docker Compose. The only exception is `api_smtp_pass.txt` (see step 4).

---

## 3. Configure `api/.env`

Copy the example file:

```bash
cp api/.env.example api/.env
```

Then edit `api/.env` and set at minimum:

```env
SEND_EMAILS=true
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=  # Leave empty — will be read from Docker secret
SMTP_FROM="DocuMind AI <your-email@gmail.com>"
```

Key points:

| Variable | Value | Why |
|---|---|---|
| `SEND_EMAILS=true` | Enables email sending (default is `false`) |
| `SMTP_USER` | Your Gmail address | Used to authenticate with Gmail SMTP |
| `SMTP_FROM` | Must match your Gmail address | Gmail rejects unmatched sender addresses |
| `SMTP_PASS` | Set via secret file instead | Keeps password out of git |

---

## 4. Gmail App Password

Gmail requires an [App Password](https://support.google.com/accounts/answer/185833) instead of your regular password for SMTP.

### Generate one:

1. Go to your [Google Account](https://myaccount.google.com/)
2. **Security** → **2-Step Verification** (must be ON)
3. **App passwords** (search if not visible)
4. Create a new app: select **Mail** + **Other** → name it `DocuMind`
5. Copy the 16-character password

### Set the password (two places):

```bash
# 1. Docker secret (used by the API service at runtime)
echo -n "your-16-char-app-password" > secrets/api_smtp_pass.txt

# 2. Workers .env (used by the Worker service)
```

---

## 5. Configure `workers/.env`

Create or edit `workers/.env`:

```env
# ─── Workers Service ─────────────────────────────────────
NODE_ENV=development

# ─── Database ────────────────────────────────────────────
MONGODB_URI=mongodb://mongodb:27017/docsai

# ─── Cache ───────────────────────────────────────────────
REDIS_URL=redis://redis:6379

# ─── Worker Configuration ────────────────────────────────
WORKER_CONCURRENCY=1

# ─── SMTP (local only, gitignored) ───────────────────────
SMTP_HOST=smtp.gmail.com
SMTP_USER=your-email@gmail.com
SMTP_FROM="DocuMind AI <your-email@gmail.com>"

# ─── Logging ─────────────────────────────────────────────
LOG_LEVEL=info
```

> **Why both `api/.env` and `workers/.env`?**  
> The API enqueues email jobs via BullMQ (Redis queue). The **worker** service picks them up and actually sends them via nodemailer. Each service needs its own SMTP config.

---

## 6. Build & Run

```bash
docker compose up -d --build
```

First build takes a few minutes. Subsequent starts are instant:

```bash
docker compose up -d
```

Stop everything:

```bash
docker compose down
```

### Verify services are healthy:

```bash
docker compose ps
```

All services should show `running` and pass their health checks.

---

## 7. Test Email Sending

### Via Postman

Import the collection from `docs/Documind-API.postman_collection.json`.

**Register a new user:**

```
POST http://localhost:5000/auth/register
Content-Type: application/json

{
  "email": "colleague@example.com",
  "password": "Test123!",
  "name": "Test User",
  "companyName": "Test Corp"
}
```

On success (201), the API enqueues a verification email.

### Check the logs

**API logs** — confirm job was enqueued:

```bash
docker compose logs api | grep "job enqueued"
```

Expected output:
```
"jobType":"email.send",...,"message":"job enqueued"
```

**Worker logs** — confirm email was dispatched:

```bash
docker compose logs worker | grep "Email sent"
```

Expected output:
```
"message":"Email sent successfully"
"message":"job success"
```

If you see `"state":"PERMANENT_FAILURE"` or `"config_missing"`, check that:
- `SMTP_HOST`, `SMTP_USER`, `SMTP_FROM` are set in `workers/.env`
- `secrets/api_smtp_pass.txt` contains the correct app password

### Check the inbox

The verification email goes to the email address you registered with. Check spam folder if not in inbox.

---

## 8. Register a New User via Frontend

Once the API is running, open `http://localhost:3000` and complete the registration flow through the UI.

---

## Troubleshooting

### "delivery disabled in development"

`SEND_EMAILS=true` is not reaching the container. Ensure it's set in `api/.env`, then rebuild:

```bash
docker compose up -d --build api
```

### SMTP auth fails (worker logs show `EAUTH`)

1. Confirm your Gmail App Password is correct in `secrets/api_smtp_pass.txt`
2. Gmail 2-Step Verification must be **enabled** (App Passwords require it)
3. If you changed the password, restart the worker: `docker compose restart worker`

### Worker has no SMTP config

If worker logs show `"config_missing"`, `SMTP_HOST`/`SMTP_USER` are not set in `workers/.env`. Add them and restart:

```bash
docker compose restart worker
```

### Forgot-password returns 200 but no email sent

This is **by design** for security — the endpoint always returns the same generic response. The email is only enqueued when:

1. The **tenant slug** matches an existing company
2. The **email** matches an active user belonging to that tenant
3. The user's `status` is **`active`** (not `pending_email_verification`)

Verify the user's status in MongoDB:

```bash
docker compose exec mongodb mongosh documind --quiet \
  --eval 'db.users.find({email:"user@example.com"}).toArray().map(u => ({email:u.email, status:u.status}))'
```

If the status is `pending_email_verification`, the user must click the verification link first.

### 429 rate limit on resend

After requesting a verification email, you must wait **60 seconds** before requesting another. This is controlled by `RESEND_VERIFICATION_COOLDOWN_MS` in `api/.env`.

### Docker Compose ignores `.env` on Windows (long syntax)

Docker Compose's `env_file:` long syntax silently fails to load `.env` on Windows. If email config looks correct but logs show `"delivery disabled"`, sensitive env vars should be passed via `environment:` block in `docker-compose.yml` instead (as done for `SEND_EMAILS`).

---

## Files Reference

| File | Tracked by Git | Purpose |
|---|---|---|
| `api/.env` | No (`.gitignore`) | API service configuration |
| `workers/.env` | No (`.gitignore`) | Worker service configuration |
| `secrets/*.txt` | No (`secrets/*`) | Docker secrets mounted at `/run/secrets/` |
| `secrets/*.example` | Yes (`!secrets/*.example`) | Templates for secrets |
| `docker-compose.yml` | Yes | Service orchestration and env passthrough |
| `docs/local-setup-guide.md` | Yes | This guide |
