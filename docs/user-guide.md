# DocuMind AI — User Guide

> A practical guide covering the full user journey in DocuMind AI: from first
> login to uploading documents, asking questions, and — for admins — managing
> users and reviewing analytics.

---

## Table of Contents

1. [Getting Started (Login / Register)](#1-getting-started-login--register)
2. [Uploading Documents](#2-uploading-documents)
3. [Asking Questions](#3-asking-questions)
4. [Understanding Citations and Sources](#4-understanding-citations-and-sources)
5. [Providing Feedback](#5-providing-feedback)
6. [Admin: Managing Users and Roles](#6-admin-managing-users-and-roles)
7. [Admin: Viewing Analytics Dashboard](#7-admin-viewing-the-analytics-dashboard)

---

## 1. Getting Started (Login / Register)

### Register a new workspace

1. Open the app at the registered workspace URL.
2. Click **Register** (top-right of the login screen).
3. Fill in your **company name**, your **admin name**, your **email**, and choose a **password** (at least 8 characters, containing at least one letter and one number).
4. Click **Create account**.
5. Check your inbox for a **verification email** and click the link inside it to activate your account.

> ![Register screen](images/user-guide/register.png)
> *Placeholder: replace with a screenshot of the register form.*

### Log in

1. Go to **/login**.
2. Enter your **company slug** (e.g. `acme`), **email**, and **password**.
3. Click **Log in**.

You'll land on the dashboard. If you forgot your password, use the **Forgot password** link on the login page — a reset link will be emailed to you.

> ![Login screen](images/user-guide/login.png)
> *Placeholder: replace with a screenshot of the login form.*

---

## 2. Uploading Documents

Supported formats include **PDF, DOCX, XLSX, and images** (up to the size
limit configured for your workspace). Both **Arabic** and **English**
documents are supported; scanned PDFs are processed with OCR.

### Upload

1. From the dashboard, open **Documents** (`/dashboard/documents`).
2. Either **drag-and-drop** a file into the upload zone, or click **Upload** and pick a file.
3. Optionally add a **title**, **description**, and **tags**.
4. Click **Upload**.

The document appears in the list with a processing status:
`uploading → processing → processed`. Once it reaches **processed** (and the
search status shows **Ready**), the document's content is answerable by the AI.

> ![Upload documents](images/user-guide/upload.png)
> *Placeholder: replace with a screenshot of the documents page with the upload drop zone.*

### Manage documents

- **Search / filter** the list by name, category, status, or classification.
- **Download** or **preview** a document from its row actions.
- **Archive** documents you no longer want visible in normal listings.
- Admins can attach a **title/description/tags** and set a **document classification** (public, internal, confidential, restricted, highly confidential) which controls who the AI may cite.

---

## 3. Asking Questions

1. Open **Chat** (`/dashboard/chat`).
2. Type a natural-language question, for example:
   - *"What is the company's remote work policy?"*
   - *"كم مدة إجازة الأمومة؟"* (How long is maternity leave?)
3. Press **Send** (or Enter).

The assistant answers **using only your organization's documents**. If the
evidence is missing or contradictory, it will say so rather than guessing —
or it will ask a clarifying question when your question is ambiguous.

You can continue a conversation in the same thread, or start a new one from
the conversation list on the left.

> ![Chat interface](images/user-guide/chat.png)
> *Placeholder: replace with a screenshot of the chat interface with a question and an answer.*

---

## 4. Understanding Citations and Sources

Every AI answer is grounded in your documents. Below each answer you'll see a
**Sources** section listing the documents (and page/section where available)
that the answer is based on.

- Click a source to open the referenced document.
- Citations are shown whenever your workspace has **citations enabled** in
  the AI runtime settings; when disabled, sources are omitted entirely.

> ![Citations](images/user-guide/citations.png)
> *Placeholder: replace with a screenshot of an answer with its source citations.*

### Why citations matter

- **Verifiability** — you can always check the answer against the original document.
- **Trust** — answers that lack supporting evidence are refused instead of fabricated.

---

## 5. Providing Feedback

Next to each assistant answer you'll find **thumbs up / thumbs down** buttons.

- **Thumbs up** marks the answer as helpful.
- **Thumbs down** asks for a short reason, and feeds directly into the
  **knowledge-gap** and **quality** analytics — it tells the team where the AI
  needs better source material or clearer answers.

Your feedback is anonymous and never changes your conversation history.

> ![Feedback](images/user-guide/feedback.png)
> *Placeholder: replace with a screenshot of the feedback buttons under an answer.*

---

## 6. Admin: Managing Users and Roles

Admins manage who can access the workspace and what they can do.

### Invite a user

1. Open **Users** (`/dashboard/users`).
2. Click **Invite user**.
3. Enter the user's **name**, **email**, **role**, and optional **department**.
4. Send the invitation — the user receives an email with a link to set their password.

### Assign roles

Roles control permissions (e.g. read-only viewer, document uploader, admin).
From the user's row, click **Edit** to change their role or deactivate their
account. Manage the full set of roles and their permissions under **Roles**
(`/dashboard/roles`).

> ![Users management](images/user-guide/users.png)
> *Placeholder: replace with a screenshot of the users page with role assignment.*

---

## 7. Admin: Viewing the Analytics Dashboard

Open **Analytics** (`/dashboard/analytics`) to see how your workspace is
being used:

- **Overview** — queries, documents, active users, and AI cost for the selected period.
- **Time series** — usage trends over time.
- **Cost breakdown** — spend by model / feature.
- **Top consumers** — which users or departments ask the most.
- **Quality metrics** — citation rates, thumbs-down feedback, and knowledge gaps.
- **Events** — a detailed, filterable history of usage events.

Use the date-range picker to zoom in on a specific period, and **Export** to
download the data.

> ![Analytics dashboard](images/user-guide/analytics.png)
> *Placeholder: replace with a screenshot of the analytics overview page.*

---

## Need help?

- Check the [architecture](architecture.md) and
  [model selection rationale](model-selection-rationale.md) for how the system works.
- For developers: the interactive API reference is served at **`/api-docs`** (Swagger UI).
