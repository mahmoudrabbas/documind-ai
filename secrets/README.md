# DocuMind AI

## Team Setup Guide (After `git pull`)

Follow these steps after pulling the latest changes.

---

## Step 1: Copy Example Secret Files

Run the following commands:

```bash
cp secrets/api_jwt_secret.txt.example secrets/api_jwt_secret.txt
cp secrets/api_refresh_secret.txt.example secrets/api_refresh_secret.txt
cp secrets/api_email_verification_secret.txt.example secrets/api_email_verification_secret.txt
cp secrets/api_password_reset_secret.txt.example secrets/api_password_reset_secret.txt
cp secrets/api_smtp_pass.txt.example secrets/api_smtp_pass.txt
cp secrets/api_super_admin_bootstrap_key.txt.example secrets/api_super_admin_bootstrap_key.txt
cp secrets/worker_mongodb_uri.txt.example secrets/worker_mongodb_uri.txt
cp secrets/worker_redis_url.txt.example secrets/worker_redis_url.txt
```

---

## Step 2: Generate Secret Values

Generate secure secrets:

```bash
openssl rand -hex 32 > secrets/api_jwt_secret.txt
openssl rand -hex 32 > secrets/api_refresh_secret.txt
openssl rand -hex 32 > secrets/api_email_verification_secret.txt
openssl rand -hex 32 > secrets/api_password_reset_secret.txt
openssl rand -hex 32 > secrets/api_super_admin_bootstrap_key.txt
```

Configure the worker connection strings:

```bash
echo -n "mongodb://mongodb:27017/docsai" > secrets/worker_mongodb_uri.txt
echo -n "redis://redis:6379" > secrets/worker_redis_url.txt
```

---

## Step 3: Configure SMTP

Each developer should generate their own Gmail App Password.

```bash
echo -n "your-gmail-app-password" > secrets/api_smtp_pass.txt
```

Generate one here:

1. https://myaccount.google.com/security
2. Enable **2-Step Verification**
3. Open **App passwords**
4. Generate a password for **Mail**
5. Save it into `secrets/api_smtp_pass.txt`

---

## Step 4: Update `api/.env`

Each developer must set their own email address:

```env
SMTP_USER=your-email@gmail.com
SMTP_FROM=your-email@gmail.com
```

Everything else can remain unchanged.

---

## Step 5: Start the Project

```bash
docker compose up --build -d
```

### Automatic Replica Set Initialization

Nothing needs to be configured manually.

During startup:

1. MongoDB starts with `--replSet rs0`.
2. `mongos-init-replicaset` waits until MongoDB is healthy.
3. It executes `rs.initiate()`.
4. The API starts only after the replica set is ready.

---

## Step 6: Verify Everything

Check container status:

```bash
docker compose ps
```

Expected:

- All application services are **Up**
- `mongos-init-replicaset` shows:

```text
Exited (0)
```

Check the API logs:

```bash
docker compose logs api
```

Expected:

```text
Server listening...
```

---

## MongoDB Compass

Use the following connection string:

```text
mongodb://localhost:27017/docsai?directConnection=true
```

> **Important:** `directConnection=true` is required.

---

## Troubleshooting

### Verify Replica Set

```bash
docker compose exec mongodb mongosh --quiet --eval "rs.status().ok"
```

Expected output:

```text
1
```

---

### Replica Set Initialization Failed

View the logs:

```bash
docker compose logs mongos-init-replicaset
```

---

### Existing MongoDB Volume

If you previously started MongoDB before replica set support was added:

```bash
docker compose down -v
docker compose up --build -d
```

> ⚠️ **Warning:** This deletes all local MongoDB data.

---

# Feature Flows (Implemented)

## 1. Registration & Onboarding

```
User visits /register
        │
        ▼
Fill company + admin information
        │
        ▼
Backend creates:
• Company
• COMPANY_ADMIN user
• JWT
        │
        ▼
Redirect to /dashboard
        │
        ▼
Admin sees empty dashboard and can invite users
```

---

## 2. Invitation Flow

```
COMPANY_ADMIN
        │
        ▼
Dashboard → Users
        │
        ▼
Invite User
        │
        ▼
Enter email + role
        │
        ▼
SMTP sends invitation email
        │
        ▼
Employee opens:
set-password-from-invite?token=...
        │
        ▼
Sets password
        │
        ▼
Employee account activated
```

---

## 3. Document Upload

```
Dashboard → Documents
        │
        ▼
Upload file
        │
        ▼
Fill metadata
(title, description, tags)
        │
        ▼
Backend validation
• File type
• Max size (50 MB)
• Duplicate SHA-256 check
• Tags parsing
        │
        ▼
Store file
        │
        ▼
Create MongoDB document
        │
        ▼
Queue extraction job
        │
        ▼
Status:
Uploaded → Processing → Processed
```

Supported file types:

- PDF
- DOCX
- TXT
- MD

---

## 4. Document Processing Pipeline

```
Worker picks extraction job
        │
        ▼
Extract text
├── PDF
├── DOCX
├── TXT
└── MD
        │
        ▼
Create ExtractionArtifact
        │
        ▼
Document status = Processed
```

---

## 5. OCR Flow

```
Upload scanned PDF/image
        │
        ▼
Quality & OCR
        │
        ▼
Run OCR
        │
        ▼
Python OCR Service (:8501)
        │
        ▼
Extract text
        │
        ▼
Confidence analysis
        │
        ▼
Quality result:
• Ready for indexing
• Ready with warnings
• Review required
        │
        ▼
Save extraction artifacts
```

---

## 6. Chat (Mock)

Current implementation:

- Chat UI
- Conversation sidebar
- Suggested prompts
- Message history
- Mock AI responses
- Mock source citations

> **Note:** Not connected to a real RAG pipeline yet.

---

## 7. Billing & Subscription

```
Dashboard → Checkout
        │
        ▼
Choose plan
(Basic / Pro / Enterprise)
        │
        ▼
Stripe Checkout
(or fake provider in development)
        │
        ▼
Subscription saved
        │
        ▼
Limits enforced
• Users
• Documents
• Storage
```

---

## 8. Super Admin

Platform dashboard includes:

- Companies
- Subscriptions
- Usage
- Processing jobs
- System health
- AI configuration
- Security & Audit
- Global settings

Has full multi-tenant access.

---

## 9. Email System

Emails supported:

- Verification
- Invitations
- Password reset

Admin dashboard includes:

- Email history
- Delivery status
- Retry failed emails

Statuses:

- SENT
- DELIVERED
- FAILED
- CANCELLED

---

## 10. User Management

COMPANY_ADMIN can:

- View users
- Invite users
- Change roles
- Deactivate users
- Import users from CSV

---

## 11. Role-Based Access Control

### SUPER_ADMIN

- Full platform access

### COMPANY_ADMIN

Access to:

- Documents
- Users
- Roles
- Billing
- Settings
- Audit
- Chat

### EMPLOYEE

Access to:

- Documents (read)
- Chat

Cannot access:

- Billing
- User management
- Settings

Sidebar navigation is permission-aware.

---

# Current Roadmap

| Feature | Status |
|----------|--------|
| Real AI Chat (RAG) | 🚧 Mock UI only |
| Embeddings & Vector Store | ❌ Not started |
| Knowledge Gap Detection | 🚧 UI exists, logic pending |
| Analytics Dashboard | 🚧 Permissions only |
| Real-time Processing Updates | 🚧 Basic polling |
| Document Version Diff Viewer | 🚧 Version history exists, diff viewer pending |

---

## Setup Complete

Your local development environment is ready, and the above flows represent the current implementation status of DocuMind AI.