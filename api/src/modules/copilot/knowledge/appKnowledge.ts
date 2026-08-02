export const APP_KNOWLEDGE = `## DocuMind AI — Platform Overview

DocuMind AI is a document management and AI-powered knowledge base platform. Here's everything the copilot needs to know about the app:

### Dashboard Pages
- **Dashboard** (/dashboard) — Main landing page with recent activity, quick stats, and document overview
- **Documents** (/dashboard/documents) — Browse, search, upload, and manage all documents in the knowledge base
- **Processing** (/dashboard/processing) — View document processing status (OCR, indexing, quality review)
- **Search** (/dashboard/search) — Full-text and AI-powered semantic search across all documents
- **Users** (/dashboard/users) — Manage tenant users (list, invite, change roles)
- **Roles** (/dashboard/roles) — Manage tenant roles and permissions
- **Analytics** (/dashboard/analytics) — Usage statistics and analytics
- **Emails** (/dashboard/emails) — Email integration and templates
- **Knowledge Gaps** (/dashboard/knowledge-gaps) — AI-detected knowledge gaps in documents
- **Audit** (/dashboard/audit) — Audit trail of tenant activity
- **Chat** (/dashboard/chat) — AI chat and Q&A with your documents
- **Imports** (/dashboard/imports) — Import batches and monitor import progress
- **Settings** (/dashboard/settings) — Tenant settings, billing, integrations
- **Admin** (/super-admin) — Super admin area for system-wide management (tenants, users, roles, billing)

When the user asks for a guided walkthrough (guide mode), navigate to the relevant page with a single navigate step. The UI automatically highlights and annotates the destination page — you do not need to specify elementId parameters.

### Key Features
- **Document Upload & Processing** — Upload documents (PDF, DOCX, images), auto-OCR, chunk, embed, and index for AI search
- **AI-Powered Semantic Search** — Vector + keyword hybrid search across all documents with tenant-isolated access
- **Chat & Q&A** — Ask questions about documents, get grounded answers with citations and source references
- **Quality Review** — Review OCR and processing quality, approve or reject results
- **User Management** — Role-based access (SUPER_ADMIN, COMPANY_ADMIN, EMPLOYEE) with granular permissions
- **Import System** — Batch import documents from external sources with progress tracking
- **Entitlements & Billing** — Per-tenant usage quotas, subscription plans, billing integration

### User Roles
- **SUPER_ADMIN** — System-wide access: manage tenants, users, roles, billing. Access to /super-admin/* routes
- **COMPANY_ADMIN** — Tenant-level admin: manage users, view all documents, run imports, configure settings
- **EMPLOYEE** — Standard user: upload/view own documents, search, chat with AI, limited management

### Page Details
- Documents page has: list view, grid view, search bar, filters (status, date, classification), upload button
- Processing page shows: OCR queue, indexing queue, quality review queue with approve/reject actions
- Users page shows: user list, invite button, role badges, status indicators (active/invited/disabled)
- Search page has: search input, advanced filters, results list with relevance scores and document previews
- Import page shows: import batches, progress bars, source details, run/retry actions

### Common Workflows
1. "Upload a document" → Navigate to Documents page → Click Upload → Select file → Wait for processing
2. "Search for documents about X" → Navigate to Search → Type query → Filter results
3. "Invite a user" → Navigate to Users → Click Invite → Enter email → Select role → Send invitation
4. "Check system health" → View system status, uptime, and service health indicators
5. "Run an import" → Navigate to Imports → Select batch → Confirm and run → Monitor progress
6. "Ask about documents" → Use chat to ask questions, get AI-powered answers with citations
7. "Review quality" → Navigate to Processing → Quality Review tab → Approve or reject OCR results
`;
