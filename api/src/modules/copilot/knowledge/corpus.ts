export interface CopilotCorpusEntry {
  id: string;
  title: string;
  tags: string[];
  content: string;
}

export const COPILOT_KNOWLEDGE_CORPUS: CopilotCorpusEntry[] = [
  {
    id: "corpus-roles",
    title: "User Roles & Permissions",
    tags: ["roles", "permissions", "access", "admin", "employee"],
    content: `DocuMind AI has three built-in roles with different permission levels.
SUPER_ADMIN is a system-wide administrator who manages tenants, users, roles, packages, and billing. They access the /super-admin area and can view or modify any tenant's data.
COMPANY_ADMIN manages a single tenant: they can invite users, change roles, view all tenant documents, run imports, start OCR processing, review quality, and configure tenant settings.
EMPLOYEE is a standard user who can upload and view their own documents, search the knowledge base, and ask questions through chat. Employees cannot manage users, run imports, or access admin settings.
Roles determine which pages and actions a user can access. The copilot revalidates permissions before every action it takes on a user's behalf.`,
  },
  {
    id: "corpus-dashboard",
    title: "Dashboard Overview",
    tags: ["dashboard", "home", "overview", "landing"],
    content: `The Dashboard (/dashboard) is the main landing page after login. It shows recent activity, quick statistics (document counts, processing status), and a summary of documents in the knowledge base. Users can quickly jump to Documents, Search, or Processing from here. The dashboard is read-only; all management actions happen on their dedicated pages.`,
  },
  {
    id: "corpus-documents",
    title: "Documents Page",
    tags: ["documents", "upload", "browse", "list", "grid", "manage"],
    content: `The Documents page (/dashboard/documents) lets users browse, search, upload, and manage documents. It offers two views: a list view (table with columns) and a grid view (cards with thumbnails). A search bar and filters allow narrowing by status (processing/ready/failed), date, classification, and category. The Upload button opens a file picker for supported formats: PDF, DOCX, and images. Each document row has actions: view details, download, delete, and reprocess. Uploaded documents go through OCR, chunking, embedding, and indexing before they appear in search results.`,
  },
  {
    id: "corpus-processing",
    title: "Processing Page",
    tags: ["processing", "ocr", "indexing", "quality", "review"],
    content: `The Processing page (/dashboard/processing) shows the status of document processing pipelines: the OCR queue, indexing queue, and quality review queue. The OCR queue lists documents waiting for or running OCR. The indexing queue shows chunking, embedding, and index activation progress. The quality review tab lists documents whose OCR output needs human review; each entry has Approve and Reject actions. Approving confirms the OCR text quality; rejecting flags it for reprocessing. Processing runs are tracked by job IDs and appear in the run history.`,
  },
  {
    id: "corpus-search",
    title: "Search & AI Answers",
    tags: ["search", "ai", "semantic", "vector", "answer", "chat"],
    content: `Search (/dashboard/search) provides full-text and AI-powered semantic search across all tenant documents. The search bar accepts natural-language queries; results show a relevance score, document title, page number, and a preview snippet. Advanced filters refine by classification, department, category, and date range. Search uses hybrid retrieval that combines vector (semantic) and keyword (lexical) matching and reranks results. The Chat page lets users ask questions and receive grounded answers with citations that link back to the source document and page.`,
  },
  {
    id: "corpus-users",
    title: "Users Page",
    tags: ["users", "invite", "roles", "team", "members"],
    content: `The Users page (/dashboard/users) manages tenant members. It shows a list of users with their email, role badge (SUPER_ADMIN, COMPANY_ADMIN, EMPLOYEE), and status indicator (active, invited, disabled). The Invite button opens a form to enter an email and select a role; an invitation email is sent and the user appears as "invited" until they accept. Admins can change a user's role, disable/enable an account, or resend invitations. Only COMPANY_ADMIN and above can access this page.`,
  },
  {
    id: "corpus-imports",
    title: "Imports Page",
    tags: ["imports", "batch", "upload", "migration"],
    content: `The Imports page (/dashboard/imports) handles bulk imports of documents and employee data. It lists import batches with their source, progress bar, and current state (preview ready, queued, processing, completed, failed). A batch must be confirmed before it starts processing. After confirmation, the system queues the batch, processes each item, and updates progress. Failed batches can be retried. Import batches are idempotent: confirming the same batch twice does not duplicate work.`,
  },
  {
    id: "corpus-upload-workflow",
    title: "How to Upload a Document",
    tags: ["upload", "workflow", "how-to", "steps"],
    content: `To upload a document: 1) Go to the Documents page. 2) Click the Upload button in the top-right corner. 3) Select a PDF, DOCX, or image file from your computer. 4) Optionally name the document or let the system use the filename. 5) Confirm the upload. The system then runs the processing pipeline: OCR (for scanned documents), chunking, embedding, and indexing. When processing completes, the document appears in search results. You can watch progress on the Processing page.`,
  },
  {
    id: "corpus-invite-workflow",
    title: "How to Invite a New User",
    tags: ["invite", "user", "workflow", "how-to", "steps"],
    content: `To invite a new user: 1) Go to the Users page. 2) Click the Invite button. 3) Enter the person's email address. 4) Select a role: EMPLOYEE for standard access, or COMPANY_ADMIN for full tenant administration. 5) Send the invitation. The system sends an invitation email with a secure link. The new user shows as "invited" until they accept the invitation and set their password. You can resend the invitation or cancel it from the user's row menu.`,
  },
  {
    id: "corpus-ocr-workflow",
    title: "How to Run OCR on a Document",
    tags: ["ocr", "scan", "workflow", "how-to"],
    content: `To run OCR on a document: 1) Open the document's details page. 2) Find the processing or actions menu. 3) Select "Run OCR" or "Reprocess". 4) Choose the language settings if prompted (English, Arabic, or mixed). 5) Start the job. The system creates an OCR job and processes the document page by page. You can track the job on the Processing page under the OCR queue. After OCR completes, quality review may be required before the text is used for indexing.`,
  },
  {
    id: "corpus-search-workflow",
    title: "How to Search Documents",
    tags: ["search", "workflow", "how-to", "find"],
    content: `To search documents: 1) Go to the Search page. 2) Type a natural-language query in the search bar, for example "invoices from March". 3) Optionally apply filters for classification, department, category, or date range. 4) Review the results, which show relevance scores, document titles, page numbers, and snippets. 5) Click a result to open the full document. Search uses hybrid retrieval that combines semantic (vector) and keyword matching to find relevant content even when wording differs.`,
  },
  {
    id: "corpus-settings",
    title: "Settings Page",
    tags: ["settings", "billing", "tenant", "configuration"],
    content: `The Settings page (/dashboard/settings) lets COMPANY_ADMIN manage tenant-level configuration: profile details, billing and subscription information, and integration settings. Billing shows the current plan, usage limits, and a link to manage payment methods. Tenant settings cover company name, slug, and contact details. Some settings take effect immediately; others require a subscription plan change.`,
  },
  {
    id: "corpus-system-health",
    title: "System Health",
    tags: ["health", "status", "uptime", "monitoring", "system"],
    content: `System health reports the availability of the core services: the API, the MongoDB database, and the Redis cache. A healthy system reports all dependencies connected. The health endpoint (/healthz) reports liveness, and the readiness endpoint (/readyz) reports dependency connectivity, returning 503 when MongoDB or Redis is unreachable. The metrics endpoint (/metrics) exposes Prometheus-format counters for plans generated, executions, errors, and latencies.`,
  },
  {
    id: "corpus-quality-review",
    title: "Quality Review",
    tags: ["quality", "review", "approve", "reject", "ocr"],
    content: `Quality review ensures OCR output meets accuracy standards before it is indexed. On the Processing page, the quality review queue lists documents whose OCR is complete and awaiting review. Opening a document shows the extracted text against the original page. Approve confirms the text is accurate and allows indexing to proceed. Reject flags the document for reprocessing with a note. Reviews are recorded in the audit trail with the reviewing user.`,
  },
  {
    id: "corpus-entitlements",
    title: "Entitlements & Quotas",
    tags: ["entitlements", "quotas", "limits", "usage", "billing"],
    content: `Entitlements define the usage limits for each subscription package: number of employees, admins, documents, storage, file size, monthly AI queries, tokens, and OCR pages. When a limit is reached, the corresponding action is denied with a quota-exceeded error. The system tracks usage counters per tenant and reconciles them against the active package. Admins can view current usage on the settings or admin pages and request plan upgrades when limits are hit.`,
  },
  {
    id: "corpus-chat-qa",
    title: "Chat & Question Answering",
    tags: ["chat", "qa", "question", "answer", "citations"],
    content: `The Chat feature lets users ask questions about their documents in natural language. Each question is analyzed for intent, then relevant document chunks are retrieved using hybrid search, and an answer is generated with citations pointing to source documents and page numbers. Answers are grounded: the model is restricted to retrieved content and cannot invent facts. Chat history is kept per conversation, and follow-up questions can reference earlier context.`,
  },
  {
    id: "corpus-audit",
    title: "Audit Trail",
    tags: ["audit", "logs", "compliance", "traceability"],
    content: `Every sensitive action in DocuMind AI is recorded in an audit log: logins, document uploads and deletions, role changes, user invitations, OCR runs, quality reviews, and copilot actions. Each audit entry captures the actor, action, resource, tenant, outcome, trace ID, and metadata. Copilot writes dedicated events for plan creation (COPILOT_PLAN_CREATED), cancellation (COPILOT_PLAN_CANCELLED), and every tool execution it performs on behalf of a user, so automation is fully traceable.`,
  },
];
