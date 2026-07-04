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
git clone <repository-url>
cd docsai
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

# Git Workflow

Create a new branch before starting any task.

Example:

```bash
git checkout -b feature/auth-login
```

Write clear commit messages.

Open a Pull Request before merging into the main branch.

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