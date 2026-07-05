# DocuMind AI

DocuMind AI is an AI-powered knowledge assistant that allows users to upload documents, search their knowledge, and chat with AI.

---

# Tech Stack

### Frontend
- Next.js
- TypeScript

### Backend
- Node.js
- Express
- TypeScript

### Database
- MongoDB

### Containerization
- Docker
- Docker Compose

---

# Project Structure

```text
docsai/
│
├── app/                  # Frontend (Next.js)
├── api/                  # Backend (Node.js + Express)
├── docs/                 # Project documentation
├── docker-compose.yml
└── README.md
```

---

# Requirements

Before running the project, install:

- Docker
- Docker Compose

No need to install MongoDB locally.

---

# Setup

Clone the repository:

```bash
git clone https://github.com/mahmoudrabbas/documind-ai
cd documind-ai
```

---

# Environment Variables

Create the following file:

```text
api/.env
```

Example:

```env
PORT=5000
MONGODB_URI=mongodb://mongodb:27017/docsai
```

---

# Run the Project

Build and start all services:

```bash
docker compose up --build
```

For the next runs:

```bash
docker compose up
```

Stop the project:

```bash
docker compose down
```

---

# Application URLs

Frontend

```
http://localhost:3000
```

Backend API

```
http://localhost:5000
```

MongoDB runs inside Docker and connects automatically to the backend.

---

# Backend Architecture

The backend follows a feature-based architecture.

Each module contains:

```text
module/
├── controller
├── service
├── repository
├── routes
├── dto
├── validator
└── types
```

Current modules:

- Auth
- Users
- Tenants
- Documents
- Processing
- Retrieval
- Chat
- Citations
- Feedback
- Knowledge Gaps
- Analytics
- Admin

---

# Frontend Architecture

The frontend is organized by features.

```text
src/
├── app/
├── components/
├── hooks/
├── services/
├── providers/
├── schemas/
├── lib/
├── constants/
└── types/
```

---

# For Teammates – Git Development Workflow

Follow these steps for every task.

## 1. Pick an Issue
- Open the Project Board.
- Choose an issue assigned to you from the current sprint.
- Read the description, acceptance criteria, and dependencies.
- Make sure all dependency tasks are already merged into `main`.

---

## 2. Create a Feature Branch

```bash
git checkout main
git pull origin main
git checkout -b feature/<task-id>-<short-description>
```

**Example**

```bash
git checkout -b feature/t2.1.1-tenant-user-schemas
```

---

## 3. Implement the Task
- Work only inside your assigned module.
- Follow the issue requirements.
- Keep your changes focused on the current task.

---

## 4. Commit Your Changes

```bash
git add .
git commit -m "feat(auth): add tenant and user schemas"
```

Use **Conventional Commits**, such as:
- `feat`
- `fix`
- `refactor`
- `docs`
- `test`
- `chore`

---

## 5. Push Your Branch

```bash
git push origin feature/<task-id>-<short-description>
```

---

## 6. Open a Pull Request
- Create a Pull Request targeting **main**.
- Complete the PR template.
- Add the following to the PR description:

```text
Closes #<issue-number>
```

This will:
- Link the PR to the issue.
- Move the issue to **In Progress** automatically.
- Close the issue automatically after the PR is merged.

---

## 7. Wait for Review
- Wait for CI checks (when available).
- Request a code review.
- Move the task to **Code Review** manually.

If changes are requested:

```bash
git add .
git commit -m "fix(auth): address review comments"
git push
```

Continue pushing to the **same branch** until the PR is approved.

---

## 8. Testing (If Needed)
- Move the task to **Testing**.
- Verify everything works correctly.

---

## 9. Merge the Pull Request
Once the PR is approved:

- Use **Squash and Merge**.

GitHub will automatically:
- Close the linked issue.
- Move the task to **Done**.

---

## 10. Clean Up

```bash
git checkout main
git pull origin main
git branch -d feature/<task-id>-<short-description>
```

Then delete the remote branch from GitHub.

---

## 11. Notify the Team

Example:

```text
T2.1.1 merged into main. It now unblocks T2.1.2 and T2.1.3.
```

---

# Workflow Summary

```text
Pick Issue
    ↓
Create Branch
    ↓
Implement Task
    ↓
Commit Changes
    ↓
Push Branch
    ↓
Open PR (Closes #Issue)
    ↓
Auto → In Progress
    ↓
Code Review
    ↓
Testing (if needed)
    ↓
Squash & Merge
    ↓
Auto → Done
    ↓
Delete Branch
    ↓
Notify Team
```
---

# Notes

- Do not commit `.env` files.
- Do not commit `node_modules`.
- Keep each feature inside its own module.
- Put shared code in shared folders.
- Discuss changes before modifying shared files like:
  - `docker-compose.yml`
  - configuration files
  - project structure