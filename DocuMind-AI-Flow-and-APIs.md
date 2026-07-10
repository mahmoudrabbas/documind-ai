# DocuMind AI — Flow, APIs, and Frontend Access Guide

_Status: Auth + User Management are fully implemented and testable end-to-end. Documents, Chat/RAG, Analytics, and Knowledge Gaps are stubbed (empty backend modules, "coming soon" frontend pages)._

Base URL used in examples: `http://localhost:5000` (backend), `http://localhost:3000` (frontend).

---

## 1. End-to-End Flow

```
Register (company + admin)
   → Verification email sent
   → Click link → Verify email → tenant + user activated
   → Login (companySlug + email + password)
   → Access token (in-memory) + refresh token (httpOnly cookie)
   → Company Admin invites users → invited user gets email
   → Invited user clicks link → Sets password → account activated
   → Users list page shows all tenant users, paginated
```

Everything past this point (chat, document upload, retrieval, analytics, knowledge gaps) exists only as empty module files and placeholder pages — see Section 4.

---

## 2. Auth Endpoints (`/auth`)

### POST `/auth/register`
Creates a tenant + the first `COMPANY_ADMIN` user. No auth required.

**Request**
```bash
curl -X POST http://localhost:5000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "companyName": "Acme Consulting",
    "companySlug": "acme-consulting",
    "adminName": "Sarah Ahmed",
    "email": "sarah@acme.com",
    "password": "StrongPass123!"
  }'
```

**Response (201)**
```json
{
  "success": true,
  "message": "Tenant and company admin created successfully. Please verify your email to activate the account.",
  "data": {
    "tenant": {
      "id": "665f1a2b3c4d5e6f7a8b9c0d",
      "name": "Acme Consulting",
      "slug": "acme-consulting",
      "status": "pending_verification",
      "plan": "free",
      "createdAt": "2026-07-10T10:30:00.000Z"
    },
    "user": {
      "id": "665f1a2b3c4d5e6f7a8b9c0e",
      "tenantId": "665f1a2b3c4d5e6f7a8b9c0d",
      "name": "Sarah Ahmed",
      "email": "sarah@acme.com",
      "role": "COMPANY_ADMIN",
      "status": "pending_email_verification",
      "emailVerified": false,
      "createdAt": "2026-07-10T10:30:00.000Z"
    }
  }
}
```

**Frontend access:** Go to `/register`. Form auto-generates `companySlug` from `companyName` (editable). No auto-redirect on success — the message is shown in place; the admin must check their email next.

---

### POST `/auth/verify-email`
Activates the user and tenant using the token from the verification email. No auth required.

**Request**
```bash
curl -X POST http://localhost:5000/auth/verify-email \
  -H "Content-Type: application/json" \
  -d '{ "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." }'
```

**Response (200)**
```json
{
  "success": true,
  "message": "Email verified successfully. You can now sign in.",
  "data": {
    "user": {
      "id": "665f1a2b3c4d5e6f7a8b9c0e",
      "tenantId": "665f1a2b3c4d5e6f7a8b9c0d",
      "name": "Sarah Ahmed",
      "email": "sarah@acme.com",
      "role": "COMPANY_ADMIN",
      "status": "active",
      "emailVerified": true
    },
    "tenant": {
      "id": "665f1a2b3c4d5e6f7a8b9c0d",
      "status": "active"
    }
  }
}
```

**Frontend access:** The verification email links to `/verify-email?token=...`. That page calls this endpoint automatically on mount and shows success/error with a "Back to Login" button — no manual action needed beyond clicking the email link.

---

### POST `/auth/resend-verification-email`
Always returns the same generic response, whether or not the email exists (prevents email enumeration).

**Request**
```bash
curl -X POST http://localhost:5000/auth/resend-verification-email \
  -H "Content-Type: application/json" \
  -d '{ "email": "sarah@acme.com" }'
```

**Response (200)**
```json
{
  "success": true,
  "message": "If the email exists and is not verified, a verification email has been sent"
}
```

**Frontend access:** Not currently wired to any UI button — call it directly if you need to test resending.

---

### POST `/auth/login`
Returns an access token in the body and sets the refresh token as an httpOnly cookie (`documind_refresh_token`).

**Request**
```bash
curl -X POST http://localhost:5000/auth/login \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{
    "companySlug": "acme-consulting",
    "email": "sarah@acme.com",
    "password": "StrongPass123!"
  }'
```

**Response (200)**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "id": "665f1a2b3c4d5e6f7a8b9c0e",
      "tenantId": "665f1a2b3c4d5e6f7a8b9c0d",
      "name": "Sarah Ahmed",
      "email": "sarah@acme.com",
      "role": "COMPANY_ADMIN",
      "status": "active",
      "emailVerified": true
    },
    "tenant": {
      "id": "665f1a2b3c4d5e6f7a8b9c0d",
      "name": "Acme Consulting",
      "slug": "acme-consulting",
      "status": "active",
      "plan": "free"
    },
    "tokens": {
      "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "tokenType": "Bearer",
      "expiresIn": "15m"
    }
  }
}
```
> Note: `refreshToken` is never returned in the JSON body — it only ever lives in the httpOnly cookie.

**Frontend access:** Go to `/login`. Requires `companySlug` + `email` + `password`. On success, `setAccessToken()` stores the token **in memory only** and redirects to `/`.
> ⚠️ Known gap: `/` is the public marketing page, not a dashboard — there's no visible confirmation you're logged in until you manually navigate to `/users`.

---

### POST `/auth/refresh`
Rotates the refresh token using the httpOnly cookie; no body needed.

**Request**
```bash
curl -X POST http://localhost:5000/auth/refresh \
  -b cookies.txt -c cookies.txt
```

**Response (200)**
```json
{
  "success": true,
  "data": {
    "tokens": {
      "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "tokenType": "Bearer",
      "expiresIn": "15m"
    }
  }
}
```

**Frontend access:** Never called manually — `apiClient` (in `app/src/lib/api-client.ts`) automatically calls this once, silently, whenever any authenticated request gets a `401`, then retries the original request.

---

### POST `/auth/logout`
Revokes the current refresh token and clears the cookie.

**Request**
```bash
curl -X POST http://localhost:5000/auth/logout -b cookies.txt
```

**Response (200)**
```json
{ "success": true, "message": "Logged out successfully" }
```

**Frontend access:** Not currently wired to a visible "Logout" button anywhere in the UI — call it directly to test, or clear the in-memory token + cookie manually.

---

### GET `/auth/me`
Returns the current user + tenant for a valid access token.

**Request**
```bash
curl http://localhost:5000/auth/me \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

**Response (200)**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "665f1a2b3c4d5e6f7a8b9c0e",
      "tenantId": "665f1a2b3c4d5e6f7a8b9c0d",
      "name": "Sarah Ahmed",
      "email": "sarah@acme.com",
      "role": "COMPANY_ADMIN",
      "status": "active",
      "emailVerified": true
    },
    "tenant": {
      "id": "665f1a2b3c4d5e6f7a8b9c0d",
      "name": "Acme Consulting",
      "slug": "acme-consulting",
      "status": "active",
      "plan": "free"
    }
  }
}
```

**Response (401 — missing/invalid token)**
```json
{
  "success": false,
  "message": "Authentication required",
  "error": "UNAUTHORIZED",
  "details": null
}
```

**Frontend access:** Not called from any page yet — good candidate for a "who am I" check on app load / a header user-menu.

---

## 3. Users Endpoints (`/users`)

### POST `/users` — Invite a User
Requires `COMPANY_ADMIN`. Creates a pending user and sends them an invite email.

**Request**
```bash
curl -X POST http://localhost:5000/users \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <accessToken>" \
  -d '{
    "name": "John Doe",
    "email": "john@acme.com",
    "role": "EMPLOYEE"
  }'
```

**Response (201)**
```json
{
  "success": true,
  "message": "User invitation created successfully. An email has been sent to the invited user.",
  "data": {
    "user": {
      "id": "665f2b3c4d5e6f7a8b9c0d1e",
      "tenantId": "665f1a2b3c4d5e6f7a8b9c0d",
      "name": "John Doe",
      "email": "john@acme.com",
      "role": "EMPLOYEE",
      "status": "pending_email_verification",
      "emailVerified": false,
      "createdAt": "2026-07-10T11:00:00.000Z"
    }
  }
}
```

**Frontend access:** On `/users`, use the invite form (name / email / role) at the top of the page. Requires being logged in as `COMPANY_ADMIN`.

---

### GET `/users` — List Users
Requires `COMPANY_ADMIN` or `EMPLOYEE`. Paginated, scoped to your tenant.

**Request**
```bash
curl "http://localhost:5000/users?page=1&pageSize=10" \
  -H "Authorization: Bearer <accessToken>"
```

**Response (200)**
```json
{
  "success": true,
  "data": {
    "users": [
      {
        "id": "665f1a2b3c4d5e6f7a8b9c0e",
        "tenantId": "665f1a2b3c4d5e6f7a8b9c0d",
        "name": "Sarah Ahmed",
        "email": "sarah@acme.com",
        "role": "COMPANY_ADMIN",
        "status": "active",
        "emailVerified": true,
        "createdAt": "2026-07-10T10:30:00.000Z"
      },
      {
        "id": "665f2b3c4d5e6f7a8b9c0d1e",
        "tenantId": "665f1a2b3c4d5e6f7a8b9c0d",
        "name": "John Doe",
        "email": "john@acme.com",
        "role": "EMPLOYEE",
        "status": "pending_email_verification",
        "emailVerified": false,
        "createdAt": "2026-07-10T11:00:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "pageSize": 10,
      "totalPages": 1,
      "totalRecords": 2
    }
  }
}
```

**Frontend access:** Navigate to `/users` after logging in. The page loads this automatically and re-fetches whenever you invite a user or change pages.

---

### PATCH `/users/:id` — Update a User
Requires `COMPANY_ADMIN`. Updates role and/or status; writes an audit log entry.

**Request**
```bash
curl -X PATCH http://localhost:5000/users/665f2b3c4d5e6f7a8b9c0d1e \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <accessToken>" \
  -d '{ "role": "COMPANY_ADMIN", "status": "active" }'
```

**Response (200)**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "665f2b3c4d5e6f7a8b9c0d1e",
      "tenantId": "665f1a2b3c4d5e6f7a8b9c0d",
      "name": "John Doe",
      "email": "john@acme.com",
      "role": "COMPANY_ADMIN",
      "status": "active",
      "emailVerified": true,
      "createdAt": "2026-07-10T11:00:00.000Z"
    }
  }
}
```

**Frontend access:** **No UI for this yet.** The `/users` page only lists users and lets you invite — there's no role/status editor in the table. Test via curl/Postman for now.

---

### POST `/users/set-password-from-invite` — Complete an Invite
No auth required (public — protected by the one-time token instead).

**Request**
```bash
curl -X POST http://localhost:5000/users/set-password-from-invite \
  -H "Content-Type: application/json" \
  -d '{
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "password": "NewPassword123"
  }'
```

**Response (200)**
```json
{
  "success": true,
  "message": "Password set successfully. You can now log in.",
  "data": {
    "user": {
      "id": "665f2b3c4d5e6f7a8b9c0d1e",
      "tenantId": "665f1a2b3c4d5e6f7a8b9c0d",
      "name": "John Doe",
      "email": "john@acme.com",
      "role": "EMPLOYEE",
      "status": "active",
      "emailVerified": true,
      "createdAt": "2026-07-10T11:00:00.000Z"
    }
  }
}
```

**Frontend access:** The invite email links to `/set-password-from-invite?token=...`. That page has a password + confirm-password form wired to this endpoint.

---

## 4. Platform Endpoint (`/platform`)

### GET `/platform/tenants` — List All Tenants
Requires `SUPER_ADMIN`. Supports `page`, `pageSize`, `status`, `plan`, `search`.

**Request**
```bash
curl "http://localhost:5000/platform/tenants?page=1&pageSize=20&status=active" \
  -H "Authorization: Bearer <superAdminAccessToken>"
```

**Response (200)**
```json
{
  "success": true,
  "data": {
    "tenants": [
      {
        "id": "665f1a2b3c4d5e6f7a8b9c0d",
        "name": "Acme Consulting",
        "slug": "acme-consulting",
        "status": "active",
        "plan": "free",
        "createdAt": "2026-07-10T10:30:00.000Z",
        "updatedAt": "2026-07-10T10:45:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "totalPages": 1,
      "totalRecords": 1
    }
  }
}
```

**Frontend access:** **No UI exists for this at all.** There's also no way to create a `SUPER_ADMIN` account through the API or UI yet — that user has to be inserted directly into MongoDB to test this endpoint.

---

## 5. Health Endpoints

### GET `/healthz`
```bash
curl http://localhost:5000/healthz
```
```json
{ "status": "ok" }
```

### GET `/readyz`
```bash
curl http://localhost:5000/readyz
```
```json
{
  "status": "ready",
  "checks": { "mongo": "connected", "redis": "connected" }
}
```

**Frontend access:** Not used by the UI — these are for Docker/orchestrator health checks.

---

## 6. Not Implemented Yet

These frontend routes currently render placeholder "coming soon" content, and their corresponding backend module files (`api/src/modules/*`) are empty:

- `/documents` — upload, list, processing pipeline
- `/chat` — conversations, retrieval, RAG answers, citations
- `/analytics` — usage / KPI dashboards
- `/knowledge-gaps` — refusal tracking
- `/settings`

---

## 7. Suggested Next Steps

1. **Post-login redirect** — send users to `/users` (or a real dashboard landing) instead of the marketing page at `/`.
2. **Role/status editor UI** for `PATCH /users/:id` — the API exists but the `/users` page has no way to trigger it.
3. **Logout button** — `/auth/logout` exists but isn't wired to any visible UI control.
4. **Super admin seeding** — a script or endpoint to create the first `SUPER_ADMIN`, since there's currently no path to one.
5. **Document upload module** (`T4.1.x`) — natural next piece given the current checklist order.
