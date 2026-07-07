# DocuMind AI — GitHub Issues Backlog

Converted from the full technical task breakdown. All issues assigned across the 6-developer team, balanced by cumulative story points/effort.

**Team:** Mahmoud Ramadan · Marco Reda · Omar Abdelsattar · Isac Nady · Abdullah Adel · Sohyla Gomaa

---


## EPIC 1: Platform Foundation & Infrastructure


### F1.1 — Project Scaffolding & Environment


#### Issue #001 — [T1.1.1] Initialize monorepo structure (frontend/, backend/, workers/)

| Field | Details |
|---|---|
| **Title** | [T1.1.1] Initialize monorepo structure (frontend/, backend/, workers/) |
| **Description** | Implement: Initialize monorepo structure (frontend/, backend/, workers/). Part of Project Scaffolding & Environment within EPIC 1 (Platform Foundation & Infrastructure). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | High (Must Have) |
| **Story Points** | 1 |
| **Estimated Time** | 0.5 day(s) |
| **Labels** | `full-stack`, `epic-1`, `f1.1` |
| **Epic** | EPIC 1 — Platform Foundation & Infrastructure |
| **Dependencies** | — |
| **Checklist** | - [x] Branch created from `main` (`2-t111-initialize-monorepo-structure-frontend-backend-workers`)<br>- [x] Implementation complete<br>- [x] Unit/integration tests written (where applicable) — N/A for scaffolding; verified via `npm run typecheck`<br>- [x] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [x] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. |
| **Assignee** | Mahmoud Ramadan |

#### Issue #002 — [T1.1.2] Write base docker-compose.yml (Mongo, Redis, backend, worker, frontend)

| Field | Details |
|---|---|
| **Title** | [T1.1.2] Write base docker-compose.yml (Mongo, Redis, backend, worker, frontend) |
| **Description** | Implement: Write base docker-compose.yml (Mongo, Redis, backend, worker, frontend). Part of Project Scaffolding & Environment within EPIC 1 (Platform Foundation & Infrastructure). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | High (Must Have) |
| **Story Points** | 2 |
| **Estimated Time** | 1 day(s) |
| **Labels** | `backend`, `epic-1`, `f1.1` |
| **Epic** | EPIC 1 — Platform Foundation & Infrastructure |
| **Dependencies** | T1.1.1 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t1.1.2`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. |
| **Assignee** | Marco Reda |

#### Issue #003 — [T1.1.3] Environment variable management (.env, config module, per-service validation)

| Field | Details |
|---|---|
| **Title** | [T1.1.3] Environment variable management (.env, config module, per-service validation) |
| **Description** | Implement: Environment variable management (.env, config module, per-service validation). Part of Project Scaffolding & Environment within EPIC 1 (Platform Foundation & Infrastructure). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | High (Must Have) |
| **Story Points** | 1 |
| **Estimated Time** | 0.5 day(s) |
| **Labels** | `backend`, `epic-1`, `f1.1` |
| **Epic** | EPIC 1 — Platform Foundation & Infrastructure |
| **Dependencies** | T1.1.1 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t1.1.3`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. |
| **Assignee** | Omar Abdelsattar |

#### Issue #004 — [T1.1.4] Shared TypeScript configs (base tsconfig, path aliases) for FE & BE

| Field | Details |
|---|---|
| **Title** | [T1.1.4] Shared TypeScript configs (base tsconfig, path aliases) for FE & BE |
| **Description** | Implement: Shared TypeScript configs (base tsconfig, path aliases) for FE & BE. Part of Project Scaffolding & Environment within EPIC 1 (Platform Foundation & Infrastructure). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | High (Must Have) |
| **Story Points** | 1 |
| **Estimated Time** | 0.5 day(s) |
| **Labels** | `full-stack`, `epic-1`, `f1.1` |
| **Epic** | EPIC 1 — Platform Foundation & Infrastructure |
| **Dependencies** | T1.1.1 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t1.1.4`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. |
| **Assignee** | Isac Nady |

#### Issue #005 — [T1.1.5] Shared ESLint/Prettier config across packages

| Field | Details |
|---|---|
| **Title** | [T1.1.5] Shared ESLint/Prettier config across packages |
| **Description** | Implement: Shared ESLint/Prettier config across packages. Part of Project Scaffolding & Environment within EPIC 1 (Platform Foundation & Infrastructure). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | High (Must Have) |
| **Story Points** | 1 |
| **Estimated Time** | 0.5 day(s) |
| **Labels** | `full-stack`, `epic-1`, `f1.1` |
| **Epic** | EPIC 1 — Platform Foundation & Infrastructure |
| **Dependencies** | T1.1.1 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t1.1.5`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. |
| **Assignee** | Abdullah Adel |

#### Issue #006 — [T1.1.6] GitHub Actions CI skeleton (lint -> build -> test stages)

| Field | Details |
|---|---|
| **Title** | [T1.1.6] GitHub Actions CI skeleton (lint -> build -> test stages) |
| **Description** | Implement: GitHub Actions CI skeleton (lint -> build -> test stages). Part of Project Scaffolding & Environment within EPIC 1 (Platform Foundation & Infrastructure). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | High (Must Have) |
| **Story Points** | 2 |
| **Estimated Time** | 1 day(s) |
| **Labels** | `backend`, `epic-1`, `f1.1` |
| **Epic** | EPIC 1 — Platform Foundation & Infrastructure |
| **Dependencies** | T1.1.2 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t1.1.6`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. |
| **Assignee** | Sohyla Gomaa |

### F1.2 — Core Backend Skeleton


#### Issue #007 — [T1.2.1] Bootstrap Express app with folder structure (config/modules/common/workers/providers/db)

| Field | Details |
|---|---|
| **Title** | [T1.2.1] Bootstrap Express app with folder structure (config/modules/common/workers/providers/db) |
| **Description** | Implement: Bootstrap Express app with folder structure (config/modules/common/workers/providers/db). Part of Core Backend Skeleton within EPIC 1 (Platform Foundation & Infrastructure). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | High (Must Have) |
| **Story Points** | 2 |
| **Estimated Time** | 1 day(s) |
| **Labels** | `backend`, `epic-1`, `f1.2` |
| **Epic** | EPIC 1 — Platform Foundation & Infrastructure |
| **Dependencies** | T1.1.1 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t1.2.1`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. |
| **Assignee** | Mahmoud Ramadan |

#### Issue #008 — [T1.2.2] MongoDB connection module (Mongoose) with retry/backoff

| Field | Details |
|---|---|
| **Title** | [T1.2.2] MongoDB connection module (Mongoose) with retry/backoff |
| **Description** | Implement: MongoDB connection module (Mongoose) with retry/backoff. Part of Core Backend Skeleton within EPIC 1 (Platform Foundation & Infrastructure). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | High (Must Have) |
| **Story Points** | 1 |
| **Estimated Time** | 0.5 day(s) |
| **Labels** | `backend`, `epic-1`, `f1.2`, `database` |
| **Epic** | EPIC 1 — Platform Foundation & Infrastructure |
| **Dependencies** | T1.2.1 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t1.2.2`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. DB schema/index changes reviewed (Connection setup). |
| **Assignee** | Omar Abdelsattar |

#### Issue #009 — [T1.2.3] Redis connection module (shared by rate-limit, BullMQ, cache)

| Field | Details |
|---|---|
| **Title** | [T1.2.3] Redis connection module (shared by rate-limit, BullMQ, cache) |
| **Description** | Implement: Redis connection module (shared by rate-limit, BullMQ, cache). Part of Core Backend Skeleton within EPIC 1 (Platform Foundation & Infrastructure). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | High (Must Have) |
| **Story Points** | 1 |
| **Estimated Time** | 0.5 day(s) |
| **Labels** | `backend`, `epic-1`, `f1.2` |
| **Epic** | EPIC 1 — Platform Foundation & Infrastructure |
| **Dependencies** | T1.2.1 |
| **Checklist** | - [x] Branch created from `main` (`feature/t1.2.3`)<br>- [x] Implementation complete<br>- [x] Unit/integration tests written (where applicable)<br>- [x] Manually verified against acceptance criteria<br>- [x] Code reviewed by at least one other developer<br>- [] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. |
| **Assignee** | Isac Nady |

#### Issue #010 — [T1.2.4] /healthz and /readyz endpoints

| Field | Details |
|---|---|
| **Title** | [T1.2.4] /healthz and /readyz endpoints |
| **Description** | Implement: /healthz and /readyz endpoints. Part of Core Backend Skeleton within EPIC 1 (Platform Foundation & Infrastructure). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | High (Must Have) |
| **Story Points** | 1 |
| **Estimated Time** | 0.5 day(s) |
| **Labels** | `backend`, `epic-1`, `f1.2` |
| **Epic** | EPIC 1 — Platform Foundation & Infrastructure |
| **Dependencies** | T1.2.2, T1.2.3 |
| **Checklist** | - [] Branch created from `main` (`feature/t1.2.4`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. |
| **Assignee** | Abdullah Adel |

#### Issue #011 — [T1.2.5] Global error-handling middleware + standardized error envelope

| Field | Details |
|---|---|
| **Title** | [T1.2.5] Global error-handling middleware + standardized error envelope |
| **Description** | Implement: Global error-handling middleware + standardized error envelope. Part of Core Backend Skeleton within EPIC 1 (Platform Foundation & Infrastructure). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | High (Must Have) |
| **Story Points** | 2 |
| **Estimated Time** | 1 day(s) |
| **Labels** | `backend`, `epic-1`, `f1.2` |
| **Epic** | EPIC 1 — Platform Foundation & Infrastructure |
| **Dependencies** | T1.2.1 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t1.2.5`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. |
| **Assignee** | Marco Reda |

#### Issue #012 — [T1.2.6] Structured logging (pino/Winston) with request correlation ID

| Field | Details |
|---|---|
| **Title** | [T1.2.6] Structured logging (pino/Winston) with request correlation ID |
| **Description** | Implement: Structured logging (pino/Winston) with request correlation ID. Part of Core Backend Skeleton within EPIC 1 (Platform Foundation & Infrastructure). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | High (Must Have) |
| **Story Points** | 2 |
| **Estimated Time** | 1 day(s) |
| **Labels** | `backend`, `epic-1`, `f1.2` |
| **Epic** | EPIC 1 — Platform Foundation & Infrastructure |
| **Dependencies** | T1.2.1 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t1.2.6`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. |
| **Assignee** | Omar Abdelsattar |

### F1.3 — Core Frontend Skeleton


#### Issue #013 — [T1.3.1] Bootstrap Next.js (App Router) + TS + Tailwind

| Field | Details |
|---|---|
| **Title** | [T1.3.1] Bootstrap Next.js (App Router) + TS + Tailwind |
| **Description** | Implement: Bootstrap Next.js (App Router) + TS + Tailwind. Part of Core Frontend Skeleton within EPIC 1 (Platform Foundation & Infrastructure). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | High (Must Have) |
| **Story Points** | 1 |
| **Estimated Time** | 0.5 day(s) |
| **Labels** | `frontend`, `epic-1`, `f1.3` |
| **Epic** | EPIC 1 — Platform Foundation & Infrastructure |
| **Dependencies** | T1.1.1 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t1.3.1`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. |
| **Assignee** | Isac Nady |

#### Issue #014 — [T1.3.2] i18n scaffolding (ar/en) with automatic RTL/LTR layout switching

| Field | Details |
|---|---|
| **Title** | [T1.3.2] i18n scaffolding (ar/en) with automatic RTL/LTR layout switching |
| **Description** | Implement: i18n scaffolding (ar/en) with automatic RTL/LTR layout switching. Part of Core Frontend Skeleton within EPIC 1 (Platform Foundation & Infrastructure). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | High (Must Have) |
| **Story Points** | 2 |
| **Estimated Time** | 1 day(s) |
| **Labels** | `frontend`, `epic-1`, `f1.3` |
| **Epic** | EPIC 1 — Platform Foundation & Infrastructure |
| **Dependencies** | T1.3.1 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t1.3.2`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. |
| **Assignee** | Abdullah Adel |

#### Issue #015 — [T1.3.3] Base design system (colors, type scale, shared components)

| Field | Details |
|---|---|
| **Title** | [T1.3.3] Base design system (colors, type scale, shared components) |
| **Description** | Implement: Base design system (colors, type scale, shared components). Part of Core Frontend Skeleton within EPIC 1 (Platform Foundation & Infrastructure). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | High (Must Have) |
| **Story Points** | 3 |
| **Estimated Time** | 1.5 day(s) |
| **Labels** | `frontend`, `epic-1`, `f1.3` |
| **Epic** | EPIC 1 — Platform Foundation & Infrastructure |
| **Dependencies** | T1.3.1 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t1.3.3`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. |
| **Assignee** | Sohyla Gomaa |

#### Issue #016 — [T1.3.4] API client wrapper with access-token attach + refresh interceptor

| Field | Details |
|---|---|
| **Title** | [T1.3.4] API client wrapper with access-token attach + refresh interceptor |
| **Description** | Implement: API client wrapper with access-token attach + refresh interceptor. Part of Core Frontend Skeleton within EPIC 1 (Platform Foundation & Infrastructure). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | High (Must Have) |
| **Story Points** | 2 |
| **Estimated Time** | 1 day(s) |
| **Labels** | `frontend`, `epic-1`, `f1.3` |
| **Epic** | EPIC 1 — Platform Foundation & Infrastructure |
| **Dependencies** | T1.3.1 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t1.3.4`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. |
| **Assignee** | Mahmoud Ramadan |

## EPIC 2: Authentication & Authorization


### F2.1 — Tenant Registration & Account Bootstrap


#### Issue #017 — [T2.1.1] Design tenants and users Mongoose schemas + indexes (tenantId+email unique)

| Field | Details |
|---|---|
| **Title** | [T2.1.1] Design tenants and users Mongoose schemas + indexes (tenantId+email unique) |
| **Description** | Implement: Design tenants and users Mongoose schemas + indexes (tenantId+email unique). Part of Tenant Registration & Account Bootstrap within EPIC 2 (Authentication & Authorization). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | High (Must Have) |
| **Story Points** | 2 |
| **Estimated Time** | 1 day(s) |
| **Labels** | `backend`, `epic-2`, `f2.1`, `database` |
| **Epic** | EPIC 2 — Authentication & Authorization |
| **Dependencies** | T1.2.2 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t2.1.1`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. DB schema/index changes reviewed (Schema + indexes). |
| **Assignee** | Isac Nady |

#### Issue #018 — [T2.1.2] POST /auth/register - creates tenant + first Company Admin

| Field | Details |
|---|---|
| **Title** | [T2.1.2] POST /auth/register - creates tenant + first Company Admin |
| **Description** | Implement: POST /auth/register - creates tenant + first Company Admin. Part of Tenant Registration & Account Bootstrap within EPIC 2 (Authentication & Authorization). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | High (Must Have) |
| **Story Points** | 3 |
| **Estimated Time** | 1.5 day(s) |
| **Labels** | `backend`, `epic-2`, `f2.1`, `database` |
| **Epic** | EPIC 2 — Authentication & Authorization |
| **Dependencies** | T2.1.1 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t2.1.2`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. DB schema/index changes reviewed (Writes). |
| **Assignee** | Marco Reda |

#### Issue #019 — [T2.1.3] Password hashing utility (argon2)

| Field | Details |
|---|---|
| **Title** | [T2.1.3] Password hashing utility (argon2) |
| **Description** | Implement: Password hashing utility (argon2). Part of Tenant Registration & Account Bootstrap within EPIC 2 (Authentication & Authorization). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | High (Must Have) |
| **Story Points** | 1 |
| **Estimated Time** | 0.5 day(s) |
| **Labels** | `backend`, `epic-2`, `f2.1` |
| **Epic** | EPIC 2 — Authentication & Authorization |
| **Dependencies** | T2.1.1 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t2.1.3`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. |
| **Assignee** | Omar Abdelsattar |

#### Issue #020 — [T2.1.4] Email verification token generation + verify endpoint

| Field | Details |
|---|---|
| **Title** | [T2.1.4] Email verification token generation + verify endpoint |
| **Description** | Implement: Email verification token generation + verify endpoint. Part of Tenant Registration & Account Bootstrap within EPIC 2 (Authentication & Authorization). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | High (Must Have) |
| **Story Points** | 2 |
| **Estimated Time** | 1 day(s) |
| **Labels** | `backend`, `epic-2`, `f2.1`, `database` |
| **Epic** | EPIC 2 — Authentication & Authorization |
| **Dependencies** | T2.1.2 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t2.1.4`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. DB schema/index changes reviewed (verification field). |
| **Assignee** | Abdullah Adel |

#### Issue #021 — [T2.1.5] Registration UI form + client-side validation

| Field | Details |
|---|---|
| **Title** | [T2.1.5] Registration UI form + client-side validation |
| **Description** | Implement: Registration UI form + client-side validation. Part of Tenant Registration & Account Bootstrap within EPIC 2 (Authentication & Authorization). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | High (Must Have) |
| **Story Points** | 2 |
| **Estimated Time** | 1 day(s) |
| **Labels** | `frontend`, `epic-2`, `f2.1` |
| **Epic** | EPIC 2 — Authentication & Authorization |
| **Dependencies** | T1.3.3 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t2.1.5`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. |
| **Assignee** | Mahmoud Ramadan |

### F2.2 — Login & Token Management (JWT)


#### Issue #022 — [T2.2.1] POST /auth/login - credential check, issue JWT access + refresh tokens

| Field | Details |
|---|---|
| **Title** | [T2.2.1] POST /auth/login - credential check, issue JWT access + refresh tokens |
| **Description** | Implement: POST /auth/login - credential check, issue JWT access + refresh tokens. Part of Login & Token Management (JWT) within EPIC 2 (Authentication & Authorization). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | High (Must Have) |
| **Story Points** | 3 |
| **Estimated Time** | 1.5 day(s) |
| **Labels** | `backend`, `epic-2`, `f2.2`, `database` |
| **Epic** | EPIC 2 — Authentication & Authorization |
| **Dependencies** | T2.1.1, T2.1.3 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t2.2.1`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. DB schema/index changes reviewed (Read). |
| **Assignee** | Omar Abdelsattar |

#### Issue #023 — [T2.2.2] Refresh-token storage & rotation strategy (hashed, Redis/Mongo)

| Field | Details |
|---|---|
| **Title** | [T2.2.2] Refresh-token storage & rotation strategy (hashed, Redis/Mongo) |
| **Description** | Implement: Refresh-token storage & rotation strategy (hashed, Redis/Mongo). Part of Login & Token Management (JWT) within EPIC 2 (Authentication & Authorization). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | High (Must Have) |
| **Story Points** | 5 |
| **Estimated Time** | 2 day(s) |
| **Labels** | `backend`, `epic-2`, `f2.2`, `database` |
| **Epic** | EPIC 2 — Authentication & Authorization |
| **Dependencies** | T2.2.1 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t2.2.2`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. DB schema/index changes reviewed (refresh_tokens collection). |
| **Assignee** | Isac Nady |

#### Issue #024 — [T2.2.3] POST /auth/refresh with reuse-detection (revoke token family on reuse)

| Field | Details |
|---|---|
| **Title** | [T2.2.3] POST /auth/refresh with reuse-detection (revoke token family on reuse) |
| **Description** | Implement: POST /auth/refresh with reuse-detection (revoke token family on reuse). Part of Login & Token Management (JWT) within EPIC 2 (Authentication & Authorization). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | High (Must Have) |
| **Story Points** | 3 |
| **Estimated Time** | 1.5 day(s) |
| **Labels** | `backend`, `epic-2`, `f2.2`, `database` |
| **Epic** | EPIC 2 — Authentication & Authorization |
| **Dependencies** | T2.2.2 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t2.2.3`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. DB schema/index changes reviewed (Reads/writes). |
| **Assignee** | Sohyla Gomaa |

#### Issue #025 — [T2.2.4] POST /auth/logout - revoke active refresh token

| Field | Details |
|---|---|
| **Title** | [T2.2.4] POST /auth/logout - revoke active refresh token |
| **Description** | Implement: POST /auth/logout - revoke active refresh token. Part of Login & Token Management (JWT) within EPIC 2 (Authentication & Authorization). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | High (Must Have) |
| **Story Points** | 1 |
| **Estimated Time** | 0.5 day(s) |
| **Labels** | `backend`, `epic-2`, `f2.2`, `database` |
| **Epic** | EPIC 2 — Authentication & Authorization |
| **Dependencies** | T2.2.2 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t2.2.4`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. DB schema/index changes reviewed (Write). |
| **Assignee** | Abdullah Adel |

#### Issue #026 — [T2.2.5] GET /auth/me

| Field | Details |
|---|---|
| **Title** | [T2.2.5] GET /auth/me |
| **Description** | Implement: GET /auth/me. Part of Login & Token Management (JWT) within EPIC 2 (Authentication & Authorization). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | High (Must Have) |
| **Story Points** | 1 |
| **Estimated Time** | 0.5 day(s) |
| **Labels** | `backend`, `epic-2`, `f2.2`, `database` |
| **Epic** | EPIC 2 — Authentication & Authorization |
| **Dependencies** | T2.2.1 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t2.2.5`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. DB schema/index changes reviewed (Read). |
| **Assignee** | Mahmoud Ramadan |

#### Issue #027 — [T2.2.6] Login UI + secure token storage (httpOnly cookie or in-memory)

| Field | Details |
|---|---|
| **Title** | [T2.2.6] Login UI + secure token storage (httpOnly cookie or in-memory) |
| **Description** | Implement: Login UI + secure token storage (httpOnly cookie or in-memory). Part of Login & Token Management (JWT) within EPIC 2 (Authentication & Authorization). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | High (Must Have) |
| **Story Points** | 3 |
| **Estimated Time** | 1.5 day(s) |
| **Labels** | `frontend`, `epic-2`, `f2.2` |
| **Epic** | EPIC 2 — Authentication & Authorization |
| **Dependencies** | T1.3.4 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t2.2.6`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. |
| **Assignee** | Marco Reda |

#### Issue #028 — [T2.2.7] Auth guard middleware (verify JWT, attach req.user)

| Field | Details |
|---|---|
| **Title** | [T2.2.7] Auth guard middleware (verify JWT, attach req.user) |
| **Description** | Implement: Auth guard middleware (verify JWT, attach req.user). Part of Login & Token Management (JWT) within EPIC 2 (Authentication & Authorization). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | High (Must Have) |
| **Story Points** | 2 |
| **Estimated Time** | 1 day(s) |
| **Labels** | `backend`, `epic-2`, `f2.2` |
| **Epic** | EPIC 2 — Authentication & Authorization |
| **Dependencies** | T2.2.1 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t2.2.7`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. |
| **Assignee** | Abdullah Adel |

### F2.3 — RBAC & Tenant Isolation Middleware


#### Issue #029 — [T2.3.1] Tenant-scoping middleware - extracts tenantId from verified JWT only

| Field | Details |
|---|---|
| **Title** | [T2.3.1] Tenant-scoping middleware - extracts tenantId from verified JWT only |
| **Description** | Implement: Tenant-scoping middleware - extracts tenantId from verified JWT only. Part of RBAC & Tenant Isolation Middleware within EPIC 2 (Authentication & Authorization). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | High (Must Have) |
| **Story Points** | 5 |
| **Estimated Time** | 2 day(s) |
| **Labels** | `backend`, `epic-2`, `f2.3` |
| **Epic** | EPIC 2 — Authentication & Authorization |
| **Dependencies** | T2.2.7 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t2.3.1`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. |
| **Assignee** | Mahmoud Ramadan |

#### Issue #030 — [T2.3.2] Role-based authorization guard

| Field | Details |
|---|---|
| **Title** | [T2.3.2] Role-based authorization guard |
| **Description** | Implement: Role-based authorization guard. Part of RBAC & Tenant Isolation Middleware within EPIC 2 (Authentication & Authorization). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | High (Must Have) |
| **Story Points** | 3 |
| **Estimated Time** | 1.5 day(s) |
| **Labels** | `backend`, `epic-2`, `f2.3` |
| **Epic** | EPIC 2 — Authentication & Authorization |
| **Dependencies** | T2.3.1 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t2.3.2`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. |
| **Assignee** | Omar Abdelsattar |

#### Issue #031 — [T2.3.3] Repository-layer wrapper requiring tenantId param on every query

| Field | Details |
|---|---|
| **Title** | [T2.3.3] Repository-layer wrapper requiring tenantId param on every query |
| **Description** | Implement: Repository-layer wrapper requiring tenantId param on every query. Part of RBAC & Tenant Isolation Middleware within EPIC 2 (Authentication & Authorization). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | High (Must Have) |
| **Story Points** | 5 |
| **Estimated Time** | 2 day(s) |
| **Labels** | `backend`, `epic-2`, `f2.3`, `database` |
| **Epic** | EPIC 2 — Authentication & Authorization |
| **Dependencies** | T2.3.1 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t2.3.3`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. DB schema/index changes reviewed (Repository pattern). |
| **Assignee** | Sohyla Gomaa |

#### Issue #032 — [T2.3.4] Automated cross-tenant isolation test suite (mongodb-memory-server)

| Field | Details |
|---|---|
| **Title** | [T2.3.4] Automated cross-tenant isolation test suite (mongodb-memory-server) |
| **Description** | Implement: Automated cross-tenant isolation test suite (mongodb-memory-server). Part of RBAC & Tenant Isolation Middleware within EPIC 2 (Authentication & Authorization). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | High (Must Have) |
| **Story Points** | 5 |
| **Estimated Time** | 2 day(s) |
| **Labels** | `backend`, `epic-2`, `f2.3`, `database` |
| **Epic** | EPIC 2 — Authentication & Authorization |
| **Dependencies** | T2.3.3 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t2.3.4`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. DB schema/index changes reviewed (Test fixtures). |
| **Assignee** | Isac Nady |

#### Issue #033 — [T2.3.5] Rate-limiting middleware (express-rate-limit + Redis store)

| Field | Details |
|---|---|
| **Title** | [T2.3.5] Rate-limiting middleware (express-rate-limit + Redis store) |
| **Description** | Implement: Rate-limiting middleware (express-rate-limit + Redis store). Part of RBAC & Tenant Isolation Middleware within EPIC 2 (Authentication & Authorization). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | High (Must Have) |
| **Story Points** | 2 |
| **Estimated Time** | 1 day(s) |
| **Labels** | `backend`, `epic-2`, `f2.3` |
| **Epic** | EPIC 2 — Authentication & Authorization |
| **Dependencies** | T1.2.3 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t2.3.5`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. |
| **Assignee** | Abdullah Adel |

## EPIC 3: Tenant & User Management


### F3.1 — Company User Management


#### Issue #034 — [T3.1.1] POST /users - invite with email token

| Field | Details |
|---|---|
| **Title** | [T3.1.1] POST /users - invite with email token |
| **Description** | Implement: POST /users - invite with email token. Part of Company User Management within EPIC 3 (Tenant & User Management). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | Medium (Should Have) |
| **Story Points** | 3 |
| **Estimated Time** | 1.5 day(s) |
| **Labels** | `backend`, `epic-3`, `f3.1`, `database` |
| **Epic** | EPIC 3 — Tenant & User Management |
| **Dependencies** | T2.3.2 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t3.1.1`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. DB schema/index changes reviewed (Write). |
| **Assignee** | Marco Reda |

#### Issue #035 — [T3.1.2] GET /users - paginated list

| Field | Details |
|---|---|
| **Title** | [T3.1.2] GET /users - paginated list |
| **Description** | Implement: GET /users - paginated list. Part of Company User Management within EPIC 3 (Tenant & User Management). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | Medium (Should Have) |
| **Story Points** | 2 |
| **Estimated Time** | 1 day(s) |
| **Labels** | `backend`, `epic-3`, `f3.1`, `database` |
| **Epic** | EPIC 3 — Tenant & User Management |
| **Dependencies** | T2.3.2 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t3.1.2`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. DB schema/index changes reviewed (Read + index). |
| **Assignee** | Omar Abdelsattar |

#### Issue #036 — [T3.1.3] PATCH /users/:id - role/status update + audit log write

| Field | Details |
|---|---|
| **Title** | [T3.1.3] PATCH /users/:id - role/status update + audit log write |
| **Description** | Implement: PATCH /users/:id - role/status update + audit log write. Part of Company User Management within EPIC 3 (Tenant & User Management). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | Medium (Should Have) |
| **Story Points** | 2 |
| **Estimated Time** | 1 day(s) |
| **Labels** | `backend`, `epic-3`, `f3.1`, `database` |
| **Epic** | EPIC 3 — Tenant & User Management |
| **Dependencies** | T3.1.1 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t3.1.3`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. DB schema/index changes reviewed (Write + audit_logs). |
| **Assignee** | Abdullah Adel |

#### Issue #037 — [T3.1.4] Set-password-from-invite flow

| Field | Details |
|---|---|
| **Title** | [T3.1.4] Set-password-from-invite flow |
| **Description** | Implement: Set-password-from-invite flow. Part of Company User Management within EPIC 3 (Tenant & User Management). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | Medium (Should Have) |
| **Story Points** | 2 |
| **Estimated Time** | 1 day(s) |
| **Labels** | `backend`, `epic-3`, `f3.1`, `database` |
| **Epic** | EPIC 3 — Tenant & User Management |
| **Dependencies** | T3.1.1 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t3.1.4`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. DB schema/index changes reviewed (Write). |
| **Assignee** | Mahmoud Ramadan |

#### Issue #038 — [T3.1.5] Users management UI (list, invite modal, role editor)

| Field | Details |
|---|---|
| **Title** | [T3.1.5] Users management UI (list, invite modal, role editor) |
| **Description** | Implement: Users management UI (list, invite modal, role editor). Part of Company User Management within EPIC 3 (Tenant & User Management). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | Medium (Should Have) |
| **Story Points** | 5 |
| **Estimated Time** | 2 day(s) |
| **Labels** | `frontend`, `epic-3`, `f3.1` |
| **Epic** | EPIC 3 — Tenant & User Management |
| **Dependencies** | T1.3.3 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t3.1.5`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. |
| **Assignee** | Sohyla Gomaa |

### F3.2 — Super Admin Platform Management


#### Issue #039 — [T3.2.1] GET /platform/tenants - list all, filters, pagination

| Field | Details |
|---|---|
| **Title** | [T3.2.1] GET /platform/tenants - list all, filters, pagination |
| **Description** | Implement: GET /platform/tenants - list all, filters, pagination. Part of Super Admin Platform Management within EPIC 3 (Tenant & User Management). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | Medium (Should Have) |
| **Story Points** | 3 |
| **Estimated Time** | 1.5 day(s) |
| **Labels** | `backend`, `epic-3`, `f3.2`, `database` |
| **Epic** | EPIC 3 — Tenant & User Management |
| **Dependencies** | T2.3.2 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t3.2.1`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. DB schema/index changes reviewed (Read). |
| **Assignee** | Marco Reda |

#### Issue #040 — [T3.2.2] PATCH /platform/tenants/:id - suspend/reinstate/change plan

| Field | Details |
|---|---|
| **Title** | [T3.2.2] PATCH /platform/tenants/:id - suspend/reinstate/change plan |
| **Description** | Implement: PATCH /platform/tenants/:id - suspend/reinstate/change plan. Part of Super Admin Platform Management within EPIC 3 (Tenant & User Management). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | Medium (Should Have) |
| **Story Points** | 3 |
| **Estimated Time** | 1.5 day(s) |
| **Labels** | `backend`, `epic-3`, `f3.2`, `database` |
| **Epic** | EPIC 3 — Tenant & User Management |
| **Dependencies** | T3.2.1 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t3.2.2`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. DB schema/index changes reviewed (Write). |
| **Assignee** | Omar Abdelsattar |

#### Issue #041 — [T3.2.3] Super Admin dashboard UI (tenant list + actions)

| Field | Details |
|---|---|
| **Title** | [T3.2.3] Super Admin dashboard UI (tenant list + actions) |
| **Description** | Implement: Super Admin dashboard UI (tenant list + actions). Part of Super Admin Platform Management within EPIC 3 (Tenant & User Management). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | Medium (Should Have) |
| **Story Points** | 5 |
| **Estimated Time** | 2 day(s) |
| **Labels** | `frontend`, `epic-3`, `f3.2` |
| **Epic** | EPIC 3 — Tenant & User Management |
| **Dependencies** | T1.3.3 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t3.2.3`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. |
| **Assignee** | Isac Nady |

## EPIC 4: Document Management & Ingestion Pipeline


### F4.1 — Document Upload & Storage


#### Issue #042 — [T4.1.1] Design documents + document_versions schemas + indexes

| Field | Details |
|---|---|
| **Title** | [T4.1.1] Design documents + document_versions schemas + indexes |
| **Description** | Implement: Design documents + document_versions schemas + indexes. Part of Document Upload & Storage within EPIC 4 (Document Management & Ingestion Pipeline). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | High (Must Have) |
| **Story Points** | 2 |
| **Estimated Time** | 1 day(s) |
| **Labels** | `backend`, `epic-4`, `f4.1`, `database` |
| **Epic** | EPIC 4 — Document Management & Ingestion Pipeline |
| **Dependencies** | T1.2.2 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t4.1.1`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. DB schema/index changes reviewed (Schema). |
| **Assignee** | Abdullah Adel |

#### Issue #043 — [T4.1.2] File-storage adapter interface (local disk now, S3/MinIO-pluggable later)

| Field | Details |
|---|---|
| **Title** | [T4.1.2] File-storage adapter interface (local disk now, S3/MinIO-pluggable later) |
| **Description** | Implement: File-storage adapter interface (local disk now, S3/MinIO-pluggable later). Part of Document Upload & Storage within EPIC 4 (Document Management & Ingestion Pipeline). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | High (Must Have) |
| **Story Points** | 3 |
| **Estimated Time** | 1.5 day(s) |
| **Labels** | `backend`, `epic-4`, `f4.1` |
| **Epic** | EPIC 4 — Document Management & Ingestion Pipeline |
| **Dependencies** | T1.2.1 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t4.1.2`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. |
| **Assignee** | Mahmoud Ramadan |

#### Issue #044 — [T4.1.3] POST /documents/upload - multipart, MIME + size + magic-byte validation

| Field | Details |
|---|---|
| **Title** | [T4.1.3] POST /documents/upload - multipart, MIME + size + magic-byte validation |
| **Description** | Implement: POST /documents/upload - multipart, MIME + size + magic-byte validation. Part of Document Upload & Storage within EPIC 4 (Document Management & Ingestion Pipeline). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | High (Must Have) |
| **Story Points** | 5 |
| **Estimated Time** | 2 day(s) |
| **Labels** | `backend`, `epic-4`, `f4.1`, `database` |
| **Epic** | EPIC 4 — Document Management & Ingestion Pipeline |
| **Dependencies** | T4.1.1, T4.1.2 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t4.1.3`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. DB schema/index changes reviewed (Write). |
| **Assignee** | Abdullah Adel |

#### Issue #045 — [T4.1.4] Idempotency-key handling for upload retries

| Field | Details |
|---|---|
| **Title** | [T4.1.4] Idempotency-key handling for upload retries |
| **Description** | Implement: Idempotency-key handling for upload retries. Part of Document Upload & Storage within EPIC 4 (Document Management & Ingestion Pipeline). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | High (Must Have) |
| **Story Points** | 2 |
| **Estimated Time** | 1 day(s) |
| **Labels** | `backend`, `epic-4`, `f4.1` |
| **Epic** | EPIC 4 — Document Management & Ingestion Pipeline |
| **Dependencies** | T4.1.3 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t4.1.4`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. |
| **Assignee** | Marco Reda |

#### Issue #046 — [T4.1.5] Upload UI (drag/drop, metadata form, progress bar)

| Field | Details |
|---|---|
| **Title** | [T4.1.5] Upload UI (drag/drop, metadata form, progress bar) |
| **Description** | Implement: Upload UI (drag/drop, metadata form, progress bar). Part of Document Upload & Storage within EPIC 4 (Document Management & Ingestion Pipeline). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | High (Must Have) |
| **Story Points** | 5 |
| **Estimated Time** | 2 day(s) |
| **Labels** | `frontend`, `epic-4`, `f4.1` |
| **Epic** | EPIC 4 — Document Management & Ingestion Pipeline |
| **Dependencies** | T1.3.3 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t4.1.5`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. |
| **Assignee** | Omar Abdelsattar |

### F4.2 — Processing Pipeline (Extraction, OCR, Cleaning, Chunking)


#### Issue #047 — [T4.2.1] Set up BullMQ queues - separate CPU-bound vs I/O-bound queues

| Field | Details |
|---|---|
| **Title** | [T4.2.1] Set up BullMQ queues - separate CPU-bound vs I/O-bound queues |
| **Description** | Implement: Set up BullMQ queues - separate CPU-bound vs I/O-bound queues. Part of Processing Pipeline (Extraction, OCR, Cleaning, Chunking) within EPIC 4 (Document Management & Ingestion Pipeline). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | High (Must Have) |
| **Story Points** | 5 |
| **Estimated Time** | 2 day(s) |
| **Labels** | `backend`, `epic-4`, `f4.2` |
| **Epic** | EPIC 4 — Document Management & Ingestion Pipeline |
| **Dependencies** | T1.2.3 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t4.2.1`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. |
| **Assignee** | Sohyla Gomaa |

#### Issue #048 — [T4.2.2] Text-extraction adapters (pdf-parse, mammoth, plain TXT)

| Field | Details |
|---|---|
| **Title** | [T4.2.2] Text-extraction adapters (pdf-parse, mammoth, plain TXT) |
| **Description** | Implement: Text-extraction adapters (pdf-parse, mammoth, plain TXT). Part of Processing Pipeline (Extraction, OCR, Cleaning, Chunking) within EPIC 4 (Document Management & Ingestion Pipeline). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | High (Must Have) |
| **Story Points** | 3 |
| **Estimated Time** | 1.5 day(s) |
| **Labels** | `backend`, `epic-4`, `f4.2` |
| **Epic** | EPIC 4 — Document Management & Ingestion Pipeline |
| **Dependencies** | T4.2.1 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t4.2.2`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. |
| **Assignee** | Mahmoud Ramadan |

#### Issue #049 — [T4.2.3] OCR path (Tesseract, Arabic+English packs) with quality scoring

| Field | Details |
|---|---|
| **Title** | [T4.2.3] OCR path (Tesseract, Arabic+English packs) with quality scoring |
| **Description** | Implement: OCR path (Tesseract, Arabic+English packs) with quality scoring. Part of Processing Pipeline (Extraction, OCR, Cleaning, Chunking) within EPIC 4 (Document Management & Ingestion Pipeline). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | High (Must Have) |
| **Story Points** | 8 |
| **Estimated Time** | 2.5 day(s) |
| **Labels** | `backend`, `epic-4`, `f4.2` |
| **Epic** | EPIC 4 — Document Management & Ingestion Pipeline |
| **Dependencies** | T4.2.2 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t4.2.3`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. |
| **Assignee** | Isac Nady |

#### Issue #050 — [T4.2.4] Text cleaning (headers/footers/boilerplate/noise removal)

| Field | Details |
|---|---|
| **Title** | [T4.2.4] Text cleaning (headers/footers/boilerplate/noise removal) |
| **Description** | Implement: Text cleaning (headers/footers/boilerplate/noise removal). Part of Processing Pipeline (Extraction, OCR, Cleaning, Chunking) within EPIC 4 (Document Management & Ingestion Pipeline). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | High (Must Have) |
| **Story Points** | 3 |
| **Estimated Time** | 1.5 day(s) |
| **Labels** | `backend`, `epic-4`, `f4.2` |
| **Epic** | EPIC 4 — Document Management & Ingestion Pipeline |
| **Dependencies** | T4.2.2 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t4.2.4`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. |
| **Assignee** | Marco Reda |

#### Issue #051 — [T4.2.5] Semantic chunking (~600-900 tokens, configurable overlap)

| Field | Details |
|---|---|
| **Title** | [T4.2.5] Semantic chunking (~600-900 tokens, configurable overlap) |
| **Description** | Implement: Semantic chunking (~600-900 tokens, configurable overlap). Part of Processing Pipeline (Extraction, OCR, Cleaning, Chunking) within EPIC 4 (Document Management & Ingestion Pipeline). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | High (Must Have) |
| **Story Points** | 5 |
| **Estimated Time** | 2 day(s) |
| **Labels** | `backend`, `epic-4`, `f4.2` |
| **Epic** | EPIC 4 — Document Management & Ingestion Pipeline |
| **Dependencies** | T4.2.4 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t4.2.5`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. |
| **Assignee** | Abdullah Adel |

#### Issue #052 — [T4.2.6] document_chunks schema + metadata attach

| Field | Details |
|---|---|
| **Title** | [T4.2.6] document_chunks schema + metadata attach |
| **Description** | Implement: document_chunks schema + metadata attach. Part of Processing Pipeline (Extraction, OCR, Cleaning, Chunking) within EPIC 4 (Document Management & Ingestion Pipeline). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | High (Must Have) |
| **Story Points** | 3 |
| **Estimated Time** | 1.5 day(s) |
| **Labels** | `backend`, `epic-4`, `f4.2`, `database` |
| **Epic** | EPIC 4 — Document Management & Ingestion Pipeline |
| **Dependencies** | T4.2.5 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t4.2.6`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. DB schema/index changes reviewed (Schema + writes). |
| **Assignee** | Mahmoud Ramadan |

#### Issue #053 — [T4.2.7] processing_jobs status tracking + retry/backoff logic

| Field | Details |
|---|---|
| **Title** | [T4.2.7] processing_jobs status tracking + retry/backoff logic |
| **Description** | Implement: processing_jobs status tracking + retry/backoff logic. Part of Processing Pipeline (Extraction, OCR, Cleaning, Chunking) within EPIC 4 (Document Management & Ingestion Pipeline). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | High (Must Have) |
| **Story Points** | 3 |
| **Estimated Time** | 1.5 day(s) |
| **Labels** | `backend`, `epic-4`, `f4.2`, `database` |
| **Epic** | EPIC 4 — Document Management & Ingestion Pipeline |
| **Dependencies** | T4.2.1 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t4.2.7`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. DB schema/index changes reviewed (Schema). |
| **Assignee** | Omar Abdelsattar |

#### Issue #054 — [T4.2.8] Document status state machine (uploaded->...->ready/failed)

| Field | Details |
|---|---|
| **Title** | [T4.2.8] Document status state machine (uploaded->...->ready/failed) |
| **Description** | Implement: Document status state machine (uploaded->...->ready/failed). Part of Processing Pipeline (Extraction, OCR, Cleaning, Chunking) within EPIC 4 (Document Management & Ingestion Pipeline). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | High (Must Have) |
| **Story Points** | 2 |
| **Estimated Time** | 1 day(s) |
| **Labels** | `backend`, `epic-4`, `f4.2`, `database` |
| **Epic** | EPIC 4 — Document Management & Ingestion Pipeline |
| **Dependencies** | T4.2.7 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t4.2.8`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. DB schema/index changes reviewed (Writes). |
| **Assignee** | Sohyla Gomaa |

### F4.3 — Embedding & Vector Indexing


#### Issue #055 — [T4.3.1] Embedding-provider adapter interface (env-configurable)

| Field | Details |
|---|---|
| **Title** | [T4.3.1] Embedding-provider adapter interface (env-configurable) |
| **Description** | Implement: Embedding-provider adapter interface (env-configurable). Part of Embedding & Vector Indexing within EPIC 4 (Document Management & Ingestion Pipeline). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | High (Must Have) |
| **Story Points** | 3 |
| **Estimated Time** | 1.5 day(s) |
| **Labels** | `backend`, `epic-4`, `f4.3` |
| **Epic** | EPIC 4 — Document Management & Ingestion Pipeline |
| **Dependencies** | T4.2.6 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t4.3.1`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. |
| **Assignee** | Marco Reda |

#### Issue #056 — [T4.3.2] Batch embedding calls with retry

| Field | Details |
|---|---|
| **Title** | [T4.3.2] Batch embedding calls with retry |
| **Description** | Implement: Batch embedding calls with retry. Part of Embedding & Vector Indexing within EPIC 4 (Document Management & Ingestion Pipeline). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | High (Must Have) |
| **Story Points** | 5 |
| **Estimated Time** | 2 day(s) |
| **Labels** | `backend`, `epic-4`, `f4.3` |
| **Epic** | EPIC 4 — Document Management & Ingestion Pipeline |
| **Dependencies** | T4.3.1 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t4.3.2`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. |
| **Assignee** | Isac Nady |

#### Issue #057 — [T4.3.3] Configure vector index with tenantId+accessRoles pre-filter

| Field | Details |
|---|---|
| **Title** | [T4.3.3] Configure vector index with tenantId+accessRoles pre-filter |
| **Description** | Implement: Configure vector index with tenantId+accessRoles pre-filter. Part of Embedding & Vector Indexing within EPIC 4 (Document Management & Ingestion Pipeline). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | High (Must Have) |
| **Story Points** | 5 |
| **Estimated Time** | 2 day(s) |
| **Labels** | `backend`, `epic-4`, `f4.3`, `database` |
| **Epic** | EPIC 4 — Document Management & Ingestion Pipeline |
| **Dependencies** | T4.3.2 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t4.3.3`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. DB schema/index changes reviewed (Index config). |
| **Assignee** | Sohyla Gomaa |

#### Issue #058 — [T4.3.4] POST /documents/:id/reprocess

| Field | Details |
|---|---|
| **Title** | [T4.3.4] POST /documents/:id/reprocess |
| **Description** | Implement: POST /documents/:id/reprocess. Part of Embedding & Vector Indexing within EPIC 4 (Document Management & Ingestion Pipeline). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | High (Must Have) |
| **Story Points** | 2 |
| **Estimated Time** | 1 day(s) |
| **Labels** | `backend`, `epic-4`, `f4.3` |
| **Epic** | EPIC 4 — Document Management & Ingestion Pipeline |
| **Dependencies** | T4.3.3 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t4.3.4`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. |
| **Assignee** | Mahmoud Ramadan |

### F4.4 — Document Administration


#### Issue #059 — [T4.4.1] GET /documents - list + status, paginated

| Field | Details |
|---|---|
| **Title** | [T4.4.1] GET /documents - list + status, paginated |
| **Description** | Implement: GET /documents - list + status, paginated. Part of Document Administration within EPIC 4 (Document Management & Ingestion Pipeline). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | High (Must Have) |
| **Story Points** | 2 |
| **Estimated Time** | 1 day(s) |
| **Labels** | `backend`, `epic-4`, `f4.4`, `database` |
| **Epic** | EPIC 4 — Document Management & Ingestion Pipeline |
| **Dependencies** | T4.1.1 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t4.4.1`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. DB schema/index changes reviewed (Read + index). |
| **Assignee** | Omar Abdelsattar |

#### Issue #060 — [T4.4.2] GET /documents/:id - detail

| Field | Details |
|---|---|
| **Title** | [T4.4.2] GET /documents/:id - detail |
| **Description** | Implement: GET /documents/:id - detail. Part of Document Administration within EPIC 4 (Document Management & Ingestion Pipeline). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | High (Must Have) |
| **Story Points** | 1 |
| **Estimated Time** | 0.5 day(s) |
| **Labels** | `backend`, `epic-4`, `f4.4`, `database` |
| **Epic** | EPIC 4 — Document Management & Ingestion Pipeline |
| **Dependencies** | T4.4.1 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t4.4.2`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. DB schema/index changes reviewed (Read). |
| **Assignee** | Abdullah Adel |

#### Issue #061 — [T4.4.3] PATCH /documents/:id - accessRoles/metadata update

| Field | Details |
|---|---|
| **Title** | [T4.4.3] PATCH /documents/:id - accessRoles/metadata update |
| **Description** | Implement: PATCH /documents/:id - accessRoles/metadata update. Part of Document Administration within EPIC 4 (Document Management & Ingestion Pipeline). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | High (Must Have) |
| **Story Points** | 2 |
| **Estimated Time** | 1 day(s) |
| **Labels** | `backend`, `epic-4`, `f4.4`, `database` |
| **Epic** | EPIC 4 — Document Management & Ingestion Pipeline |
| **Dependencies** | T4.4.1 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t4.4.3`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. DB schema/index changes reviewed (Write). |
| **Assignee** | Marco Reda |

#### Issue #062 — [T4.4.4] DELETE /documents/:id - cascades chunks + versions + storage + vector index

| Field | Details |
|---|---|
| **Title** | [T4.4.4] DELETE /documents/:id - cascades chunks + versions + storage + vector index |
| **Description** | Implement: DELETE /documents/:id - cascades chunks + versions + storage + vector index. Part of Document Administration within EPIC 4 (Document Management & Ingestion Pipeline). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | High (Must Have) |
| **Story Points** | 5 |
| **Estimated Time** | 2 day(s) |
| **Labels** | `backend`, `epic-4`, `f4.4`, `database` |
| **Epic** | EPIC 4 — Document Management & Ingestion Pipeline |
| **Dependencies** | T4.4.1 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t4.4.4`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. DB schema/index changes reviewed (Cascade delete). |
| **Assignee** | Abdullah Adel |

#### Issue #063 — [T4.4.5] Document versioning on replace-upload (preserve citation integrity)

| Field | Details |
|---|---|
| **Title** | [T4.4.5] Document versioning on replace-upload (preserve citation integrity) |
| **Description** | Implement: Document versioning on replace-upload (preserve citation integrity). Part of Document Administration within EPIC 4 (Document Management & Ingestion Pipeline). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | High (Must Have) |
| **Story Points** | 5 |
| **Estimated Time** | 2 day(s) |
| **Labels** | `backend`, `epic-4`, `f4.4`, `database` |
| **Epic** | EPIC 4 — Document Management & Ingestion Pipeline |
| **Dependencies** | T4.1.1 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t4.4.5`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. DB schema/index changes reviewed (document_versions writes). |
| **Assignee** | Mahmoud Ramadan |

#### Issue #064 — [T4.4.6] Documents management UI (list, filters, detail panel)

| Field | Details |
|---|---|
| **Title** | [T4.4.6] Documents management UI (list, filters, detail panel) |
| **Description** | Implement: Documents management UI (list, filters, detail panel). Part of Document Administration within EPIC 4 (Document Management & Ingestion Pipeline). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | High (Must Have) |
| **Story Points** | 8 |
| **Estimated Time** | 2.5 day(s) |
| **Labels** | `frontend`, `epic-4`, `f4.4` |
| **Epic** | EPIC 4 — Document Management & Ingestion Pipeline |
| **Dependencies** | T1.3.3 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t4.4.6`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. |
| **Assignee** | Omar Abdelsattar |

## EPIC 5: Retrieval & RAG Chat Engine


### F5.1 — Conversation & Messaging


#### Issue #065 — [T5.1.1] Design conversations + messages schemas + indexes

| Field | Details |
|---|---|
| **Title** | [T5.1.1] Design conversations + messages schemas + indexes |
| **Description** | Implement: Design conversations + messages schemas + indexes. Part of Conversation & Messaging within EPIC 5 (Retrieval & RAG Chat Engine). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | High (Must Have) |
| **Story Points** | 2 |
| **Estimated Time** | 1 day(s) |
| **Labels** | `backend`, `epic-5`, `f5.1`, `database` |
| **Epic** | EPIC 5 — Retrieval & RAG Chat Engine |
| **Dependencies** | T1.2.2 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t5.1.1`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. DB schema/index changes reviewed (Schema). |
| **Assignee** | Marco Reda |

#### Issue #066 — [T5.1.2] POST /conversations

| Field | Details |
|---|---|
| **Title** | [T5.1.2] POST /conversations |
| **Description** | Implement: POST /conversations. Part of Conversation & Messaging within EPIC 5 (Retrieval & RAG Chat Engine). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | High (Must Have) |
| **Story Points** | 1 |
| **Estimated Time** | 0.5 day(s) |
| **Labels** | `backend`, `epic-5`, `f5.1`, `database` |
| **Epic** | EPIC 5 — Retrieval & RAG Chat Engine |
| **Dependencies** | T5.1.1 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t5.1.2`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. DB schema/index changes reviewed (Write). |
| **Assignee** | Isac Nady |

#### Issue #067 — [T5.1.3] GET /conversations - own, paginated

| Field | Details |
|---|---|
| **Title** | [T5.1.3] GET /conversations - own, paginated |
| **Description** | Implement: GET /conversations - own, paginated. Part of Conversation & Messaging within EPIC 5 (Retrieval & RAG Chat Engine). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | High (Must Have) |
| **Story Points** | 1 |
| **Estimated Time** | 0.5 day(s) |
| **Labels** | `backend`, `epic-5`, `f5.1`, `database` |
| **Epic** | EPIC 5 — Retrieval & RAG Chat Engine |
| **Dependencies** | T5.1.1 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t5.1.3`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. DB schema/index changes reviewed (Read). |
| **Assignee** | Sohyla Gomaa |

#### Issue #068 — [T5.1.4] POST /conversations/:id/messages - entrypoint

| Field | Details |
|---|---|
| **Title** | [T5.1.4] POST /conversations/:id/messages - entrypoint |
| **Description** | Implement: POST /conversations/:id/messages - entrypoint. Part of Conversation & Messaging within EPIC 5 (Retrieval & RAG Chat Engine). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | High (Must Have) |
| **Story Points** | 2 |
| **Estimated Time** | 1 day(s) |
| **Labels** | `backend`, `epic-5`, `f5.1`, `database` |
| **Epic** | EPIC 5 — Retrieval & RAG Chat Engine |
| **Dependencies** | T5.1.1 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t5.1.4`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. DB schema/index changes reviewed (Write). |
| **Assignee** | Isac Nady |

#### Issue #069 — [T5.1.5] Chat UI shell (message list, input box, language toggle)

| Field | Details |
|---|---|
| **Title** | [T5.1.5] Chat UI shell (message list, input box, language toggle) |
| **Description** | Implement: Chat UI shell (message list, input box, language toggle). Part of Conversation & Messaging within EPIC 5 (Retrieval & RAG Chat Engine). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | High (Must Have) |
| **Story Points** | 5 |
| **Estimated Time** | 2 day(s) |
| **Labels** | `frontend`, `epic-5`, `f5.1` |
| **Epic** | EPIC 5 — Retrieval & RAG Chat Engine |
| **Dependencies** | T1.3.3 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t5.1.5`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. |
| **Assignee** | Sohyla Gomaa |

### F5.2 — Hybrid Retrieval Engine


#### Issue #070 — [T5.2.1] Query-embedding step

| Field | Details |
|---|---|
| **Title** | [T5.2.1] Query-embedding step |
| **Description** | Implement: Query-embedding step. Part of Hybrid Retrieval Engine within EPIC 5 (Retrieval & RAG Chat Engine). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | High (Must Have) |
| **Story Points** | 2 |
| **Estimated Time** | 1 day(s) |
| **Labels** | `backend`, `epic-5`, `f5.2` |
| **Epic** | EPIC 5 — Retrieval & RAG Chat Engine |
| **Dependencies** | T4.3.1 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t5.2.1`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. |
| **Assignee** | Marco Reda |

#### Issue #071 — [T5.2.2] Vector similarity search with tenant+role filter

| Field | Details |
|---|---|
| **Title** | [T5.2.2] Vector similarity search with tenant+role filter |
| **Description** | Implement: Vector similarity search with tenant+role filter. Part of Hybrid Retrieval Engine within EPIC 5 (Retrieval & RAG Chat Engine). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | High (Must Have) |
| **Story Points** | 5 |
| **Estimated Time** | 2 day(s) |
| **Labels** | `backend`, `epic-5`, `f5.2`, `database` |
| **Epic** | EPIC 5 — Retrieval & RAG Chat Engine |
| **Dependencies** | T4.3.3 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t5.2.2`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. DB schema/index changes reviewed (Query). |
| **Assignee** | Abdullah Adel |

#### Issue #072 — [T5.2.3] Keyword/text-index search

| Field | Details |
|---|---|
| **Title** | [T5.2.3] Keyword/text-index search |
| **Description** | Implement: Keyword/text-index search. Part of Hybrid Retrieval Engine within EPIC 5 (Retrieval & RAG Chat Engine). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | High (Must Have) |
| **Story Points** | 3 |
| **Estimated Time** | 1.5 day(s) |
| **Labels** | `backend`, `epic-5`, `f5.2`, `database` |
| **Epic** | EPIC 5 — Retrieval & RAG Chat Engine |
| **Dependencies** | T4.2.6 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t5.2.3`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. DB schema/index changes reviewed (Text index). |
| **Assignee** | Mahmoud Ramadan |

#### Issue #073 — [T5.2.4] Result merge + de-duplication

| Field | Details |
|---|---|
| **Title** | [T5.2.4] Result merge + de-duplication |
| **Description** | Implement: Result merge + de-duplication. Part of Hybrid Retrieval Engine within EPIC 5 (Retrieval & RAG Chat Engine). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | High (Must Have) |
| **Story Points** | 2 |
| **Estimated Time** | 1 day(s) |
| **Labels** | `backend`, `epic-5`, `f5.2` |
| **Epic** | EPIC 5 — Retrieval & RAG Chat Engine |
| **Dependencies** | T5.2.2, T5.2.3 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t5.2.4`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. |
| **Assignee** | Isac Nady |

#### Issue #074 — [T5.2.5] Reranking step (define + implement chosen method)

| Field | Details |
|---|---|
| **Title** | [T5.2.5] Reranking step (define + implement chosen method) |
| **Description** | Implement: Reranking step (define + implement chosen method). Part of Hybrid Retrieval Engine within EPIC 5 (Retrieval & RAG Chat Engine). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | High (Must Have) |
| **Story Points** | 8 |
| **Estimated Time** | 2.5 day(s) |
| **Labels** | `backend`, `epic-5`, `f5.2` |
| **Epic** | EPIC 5 — Retrieval & RAG Chat Engine |
| **Dependencies** | T5.2.4 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t5.2.5`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. |
| **Assignee** | Marco Reda |

#### Issue #075 — [T5.2.6] Query rewrite step (rule-based or LLM-based)

| Field | Details |
|---|---|
| **Title** | [T5.2.6] Query rewrite step (rule-based or LLM-based) |
| **Description** | Implement: Query rewrite step (rule-based or LLM-based). Part of Hybrid Retrieval Engine within EPIC 5 (Retrieval & RAG Chat Engine). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | High (Must Have) |
| **Story Points** | 3 |
| **Estimated Time** | 1.5 day(s) |
| **Labels** | `backend`, `epic-5`, `f5.2` |
| **Epic** | EPIC 5 — Retrieval & RAG Chat Engine |
| **Dependencies** | T5.1.4 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t5.2.6`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. |
| **Assignee** | Omar Abdelsattar |

### F5.3 — Answer Generation & Compliance


#### Issue #076 — [T5.3.1] LLM-provider adapter (env-configurable)

| Field | Details |
|---|---|
| **Title** | [T5.3.1] LLM-provider adapter (env-configurable) |
| **Description** | Implement: LLM-provider adapter (env-configurable). Part of Answer Generation & Compliance within EPIC 5 (Retrieval & RAG Chat Engine). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | High (Must Have) |
| **Story Points** | 8 |
| **Estimated Time** | 2.5 day(s) |
| **Labels** | `backend`, `epic-5`, `f5.3` |
| **Epic** | EPIC 5 — Retrieval & RAG Chat Engine |
| **Dependencies** | T1.2.1 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t5.3.1`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. |
| **Assignee** | Isac Nady |

#### Issue #077 — [T5.3.2] Evidence-only prompt construction + injection-hardening rules

| Field | Details |
|---|---|
| **Title** | [T5.3.2] Evidence-only prompt construction + injection-hardening rules |
| **Description** | Implement: Evidence-only prompt construction + injection-hardening rules. Part of Answer Generation & Compliance within EPIC 5 (Retrieval & RAG Chat Engine). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | High (Must Have) |
| **Story Points** | 5 |
| **Estimated Time** | 2 day(s) |
| **Labels** | `backend`, `epic-5`, `f5.3` |
| **Epic** | EPIC 5 — Retrieval & RAG Chat Engine |
| **Dependencies** | T5.2.5 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t5.3.2`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. |
| **Assignee** | Sohyla Gomaa |

#### Issue #078 — [T5.3.3] Draft-answer generation call

| Field | Details |
|---|---|
| **Title** | [T5.3.3] Draft-answer generation call |
| **Description** | Implement: Draft-answer generation call. Part of Answer Generation & Compliance within EPIC 5 (Retrieval & RAG Chat Engine). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | High (Must Have) |
| **Story Points** | 2 |
| **Estimated Time** | 1 day(s) |
| **Labels** | `backend`, `epic-5`, `f5.3` |
| **Epic** | EPIC 5 — Retrieval & RAG Chat Engine |
| **Dependencies** | T5.3.1, T5.3.2 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t5.3.3`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. |
| **Assignee** | Mahmoud Ramadan |

#### Issue #079 — [T5.3.4] Confidence/refusal threshold logic (quantified)

| Field | Details |
|---|---|
| **Title** | [T5.3.4] Confidence/refusal threshold logic (quantified) |
| **Description** | Implement: Confidence/refusal threshold logic (quantified). Part of Answer Generation & Compliance within EPIC 5 (Retrieval & RAG Chat Engine). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | High (Must Have) |
| **Story Points** | 5 |
| **Estimated Time** | 2 day(s) |
| **Labels** | `backend`, `epic-5`, `f5.3` |
| **Epic** | EPIC 5 — Retrieval & RAG Chat Engine |
| **Dependencies** | T5.3.3 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t5.3.4`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. |
| **Assignee** | Abdullah Adel |

#### Issue #080 — [T5.3.5] Citation verification (claim <-> chunk matching)

| Field | Details |
|---|---|
| **Title** | [T5.3.5] Citation verification (claim <-> chunk matching) |
| **Description** | Implement: Citation verification (claim <-> chunk matching). Part of Answer Generation & Compliance within EPIC 5 (Retrieval & RAG Chat Engine). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | High (Must Have) |
| **Story Points** | 8 |
| **Estimated Time** | 2.5 day(s) |
| **Labels** | `backend`, `epic-5`, `f5.3` |
| **Epic** | EPIC 5 — Retrieval & RAG Chat Engine |
| **Dependencies** | T5.3.3 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t5.3.5`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. |
| **Assignee** | Omar Abdelsattar |

#### Issue #081 — [T5.3.6] citations as first-class collection + persistence

| Field | Details |
|---|---|
| **Title** | [T5.3.6] citations as first-class collection + persistence |
| **Description** | Implement: citations as first-class collection + persistence. Part of Answer Generation & Compliance within EPIC 5 (Retrieval & RAG Chat Engine). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | High (Must Have) |
| **Story Points** | 3 |
| **Estimated Time** | 1.5 day(s) |
| **Labels** | `backend`, `epic-5`, `f5.3`, `database` |
| **Epic** | EPIC 5 — Retrieval & RAG Chat Engine |
| **Dependencies** | T5.3.5 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t5.3.6`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. DB schema/index changes reviewed (Schema + writes). |
| **Assignee** | Mahmoud Ramadan |

#### Issue #082 — [T5.3.7] Refusal-mode response formatting (bilingual)

| Field | Details |
|---|---|
| **Title** | [T5.3.7] Refusal-mode response formatting (bilingual) |
| **Description** | Implement: Refusal-mode response formatting (bilingual). Part of Answer Generation & Compliance within EPIC 5 (Retrieval & RAG Chat Engine). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | High (Must Have) |
| **Story Points** | 2 |
| **Estimated Time** | 1 day(s) |
| **Labels** | `backend`, `epic-5`, `f5.3` |
| **Epic** | EPIC 5 — Retrieval & RAG Chat Engine |
| **Dependencies** | T5.3.4 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t5.3.7`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. |
| **Assignee** | Marco Reda |

#### Issue #083 — [T5.3.8] Multi-agent orchestration (Supervisor -> Retrieval -> Draft -> Compliance -> Final)

| Field | Details |
|---|---|
| **Title** | [T5.3.8] Multi-agent orchestration (Supervisor -> Retrieval -> Draft -> Compliance -> Final) |
| **Description** | Implement: Multi-agent orchestration (Supervisor -> Retrieval -> Draft -> Compliance -> Final). Part of Answer Generation & Compliance within EPIC 5 (Retrieval & RAG Chat Engine). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | High (Must Have) |
| **Story Points** | 8 |
| **Estimated Time** | 2.5 day(s) |
| **Labels** | `backend`, `epic-5`, `f5.3` |
| **Epic** | EPIC 5 — Retrieval & RAG Chat Engine |
| **Dependencies** | T5.3.7 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t5.3.8`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. |
| **Assignee** | Sohyla Gomaa |

#### Issue #084 — [T5.3.9] Persist final message + usage_logs (tokens, latency, cost)

| Field | Details |
|---|---|
| **Title** | [T5.3.9] Persist final message + usage_logs (tokens, latency, cost) |
| **Description** | Implement: Persist final message + usage_logs (tokens, latency, cost). Part of Answer Generation & Compliance within EPIC 5 (Retrieval & RAG Chat Engine). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | High (Must Have) |
| **Story Points** | 3 |
| **Estimated Time** | 1.5 day(s) |
| **Labels** | `backend`, `epic-5`, `f5.3`, `database` |
| **Epic** | EPIC 5 — Retrieval & RAG Chat Engine |
| **Dependencies** | T5.3.8 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t5.3.9`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. DB schema/index changes reviewed (Schema + writes). |
| **Assignee** | Isac Nady |

#### Issue #085 — [T5.3.10] Answer-rendering UI with inline citations + source-viewer panel

| Field | Details |
|---|---|
| **Title** | [T5.3.10] Answer-rendering UI with inline citations + source-viewer panel |
| **Description** | Implement: Answer-rendering UI with inline citations + source-viewer panel. Part of Answer Generation & Compliance within EPIC 5 (Retrieval & RAG Chat Engine). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | High (Must Have) |
| **Story Points** | 8 |
| **Estimated Time** | 2.5 day(s) |
| **Labels** | `frontend`, `epic-5`, `f5.3` |
| **Epic** | EPIC 5 — Retrieval & RAG Chat Engine |
| **Dependencies** | T5.1.5 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t5.3.10`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. |
| **Assignee** | Abdullah Adel |

#### Issue #086 — [T5.3.11] SSE/polling for progressive chat-response status

| Field | Details |
|---|---|
| **Title** | [T5.3.11] SSE/polling for progressive chat-response status |
| **Description** | Implement: SSE/polling for progressive chat-response status. Part of Answer Generation & Compliance within EPIC 5 (Retrieval & RAG Chat Engine). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | High (Must Have) |
| **Story Points** | 5 |
| **Estimated Time** | 2 day(s) |
| **Labels** | `full-stack`, `epic-5`, `f5.3` |
| **Epic** | EPIC 5 — Retrieval & RAG Chat Engine |
| **Dependencies** | T5.3.8 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t5.3.11`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. |
| **Assignee** | Mahmoud Ramadan |

## EPIC 6: Citations, Feedback & Knowledge Gaps


### F6.1 — Citation Viewing


#### Issue #087 — [T6.1.1] GET /messages/:id/citations

| Field | Details |
|---|---|
| **Title** | [T6.1.1] GET /messages/:id/citations |
| **Description** | Implement: GET /messages/:id/citations. Part of Citation Viewing within EPIC 6 (Citations, Feedback & Knowledge Gaps). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | Medium (Should Have) |
| **Story Points** | 2 |
| **Estimated Time** | 1 day(s) |
| **Labels** | `backend`, `epic-6`, `f6.1`, `database` |
| **Epic** | EPIC 6 — Citations, Feedback & Knowledge Gaps |
| **Dependencies** | T5.3.6 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t6.1.1`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. DB schema/index changes reviewed (Read). |
| **Assignee** | Marco Reda |

#### Issue #088 — [T6.1.2] Source Viewer UI component (doc name, page, snippet)

| Field | Details |
|---|---|
| **Title** | [T6.1.2] Source Viewer UI component (doc name, page, snippet) |
| **Description** | Implement: Source Viewer UI component (doc name, page, snippet). Part of Citation Viewing within EPIC 6 (Citations, Feedback & Knowledge Gaps). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | Medium (Should Have) |
| **Story Points** | 3 |
| **Estimated Time** | 1.5 day(s) |
| **Labels** | `frontend`, `epic-6`, `f6.1` |
| **Epic** | EPIC 6 — Citations, Feedback & Knowledge Gaps |
| **Dependencies** | T5.3.10 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t6.1.2`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. |
| **Assignee** | Omar Abdelsattar |

### F6.2 — Feedback


#### Issue #089 — [T6.2.1] Design feedback schema + index

| Field | Details |
|---|---|
| **Title** | [T6.2.1] Design feedback schema + index |
| **Description** | Implement: Design feedback schema + index. Part of Feedback within EPIC 6 (Citations, Feedback & Knowledge Gaps). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | Medium (Should Have) |
| **Story Points** | 1 |
| **Estimated Time** | 0.5 day(s) |
| **Labels** | `backend`, `epic-6`, `f6.2`, `database` |
| **Epic** | EPIC 6 — Citations, Feedback & Knowledge Gaps |
| **Dependencies** | T5.1.1 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t6.2.1`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. DB schema/index changes reviewed (Schema). |
| **Assignee** | Marco Reda |

#### Issue #090 — [T6.2.2] POST /messages/:id/feedback

| Field | Details |
|---|---|
| **Title** | [T6.2.2] POST /messages/:id/feedback |
| **Description** | Implement: POST /messages/:id/feedback. Part of Feedback within EPIC 6 (Citations, Feedback & Knowledge Gaps). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | Medium (Should Have) |
| **Story Points** | 2 |
| **Estimated Time** | 1 day(s) |
| **Labels** | `backend`, `epic-6`, `f6.2`, `database` |
| **Epic** | EPIC 6 — Citations, Feedback & Knowledge Gaps |
| **Dependencies** | T6.2.1 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t6.2.2`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. DB schema/index changes reviewed (Write). |
| **Assignee** | Isac Nady |

#### Issue #091 — [T6.2.3] Thumbs up/down UI + comment modal

| Field | Details |
|---|---|
| **Title** | [T6.2.3] Thumbs up/down UI + comment modal |
| **Description** | Implement: Thumbs up/down UI + comment modal. Part of Feedback within EPIC 6 (Citations, Feedback & Knowledge Gaps). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | Medium (Should Have) |
| **Story Points** | 2 |
| **Estimated Time** | 1 day(s) |
| **Labels** | `frontend`, `epic-6`, `f6.2` |
| **Epic** | EPIC 6 — Citations, Feedback & Knowledge Gaps |
| **Dependencies** | T5.3.10 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t6.2.3`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. |
| **Assignee** | Marco Reda |

### F6.3 — Knowledge Gap Tracking


#### Issue #092 — [T6.3.1] Design knowledge_gaps schema + index

| Field | Details |
|---|---|
| **Title** | [T6.3.1] Design knowledge_gaps schema + index |
| **Description** | Implement: Design knowledge_gaps schema + index. Part of Knowledge Gap Tracking within EPIC 6 (Citations, Feedback & Knowledge Gaps). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | Medium (Should Have) |
| **Story Points** | 2 |
| **Estimated Time** | 1 day(s) |
| **Labels** | `backend`, `epic-6`, `f6.3`, `database` |
| **Epic** | EPIC 6 — Citations, Feedback & Knowledge Gaps |
| **Dependencies** | T5.1.1 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t6.3.1`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. DB schema/index changes reviewed (Schema). |
| **Assignee** | Sohyla Gomaa |

#### Issue #093 — [T6.3.2] Topic normalization/clustering on refusal events

| Field | Details |
|---|---|
| **Title** | [T6.3.2] Topic normalization/clustering on refusal events |
| **Description** | Implement: Topic normalization/clustering on refusal events. Part of Knowledge Gap Tracking within EPIC 6 (Citations, Feedback & Knowledge Gaps). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | Medium (Should Have) |
| **Story Points** | 8 |
| **Estimated Time** | 2.5 day(s) |
| **Labels** | `backend`, `epic-6`, `f6.3` |
| **Epic** | EPIC 6 — Citations, Feedback & Knowledge Gaps |
| **Dependencies** | T6.3.1, T5.3.7 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t6.3.2`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. |
| **Assignee** | Mahmoud Ramadan |

#### Issue #094 — [T6.3.3] GET /admin/analytics/knowledge-gaps

| Field | Details |
|---|---|
| **Title** | [T6.3.3] GET /admin/analytics/knowledge-gaps |
| **Description** | Implement: GET /admin/analytics/knowledge-gaps. Part of Knowledge Gap Tracking within EPIC 6 (Citations, Feedback & Knowledge Gaps). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | Medium (Should Have) |
| **Story Points** | 2 |
| **Estimated Time** | 1 day(s) |
| **Labels** | `backend`, `epic-6`, `f6.3`, `database` |
| **Epic** | EPIC 6 — Citations, Feedback & Knowledge Gaps |
| **Dependencies** | T6.3.1 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t6.3.3`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. DB schema/index changes reviewed (Read). |
| **Assignee** | Omar Abdelsattar |

#### Issue #095 — [T6.3.4] Mark-as-resolved action

| Field | Details |
|---|---|
| **Title** | [T6.3.4] Mark-as-resolved action |
| **Description** | Implement: Mark-as-resolved action. Part of Knowledge Gap Tracking within EPIC 6 (Citations, Feedback & Knowledge Gaps). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | Medium (Should Have) |
| **Story Points** | 1 |
| **Estimated Time** | 0.5 day(s) |
| **Labels** | `backend`, `epic-6`, `f6.3`, `database` |
| **Epic** | EPIC 6 — Citations, Feedback & Knowledge Gaps |
| **Dependencies** | T6.3.1 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t6.3.4`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. DB schema/index changes reviewed (Write). |
| **Assignee** | Isac Nady |

#### Issue #096 — [T6.3.5] Knowledge Gaps dashboard UI

| Field | Details |
|---|---|
| **Title** | [T6.3.5] Knowledge Gaps dashboard UI |
| **Description** | Implement: Knowledge Gaps dashboard UI. Part of Knowledge Gap Tracking within EPIC 6 (Citations, Feedback & Knowledge Gaps). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | Medium (Should Have) |
| **Story Points** | 5 |
| **Estimated Time** | 2 day(s) |
| **Labels** | `frontend`, `epic-6`, `f6.3` |
| **Epic** | EPIC 6 — Citations, Feedback & Knowledge Gaps |
| **Dependencies** | T1.3.3 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t6.3.5`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. |
| **Assignee** | Abdullah Adel |

## EPIC 7: Admin Analytics & Dashboard


### F7.1 — Usage Analytics


#### Issue #097 — [T7.1.1] Design usage_logs schema + index

| Field | Details |
|---|---|
| **Title** | [T7.1.1] Design usage_logs schema + index |
| **Description** | Implement: Design usage_logs schema + index. Part of Usage Analytics within EPIC 7 (Admin Analytics & Dashboard). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | Medium (Should Have) |
| **Story Points** | 1 |
| **Estimated Time** | 0.5 day(s) |
| **Labels** | `backend`, `epic-7`, `f7.1`, `database` |
| **Epic** | EPIC 7 — Admin Analytics & Dashboard |
| **Dependencies** | T5.3.9 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t7.1.1`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. DB schema/index changes reviewed (Schema). |
| **Assignee** | Marco Reda |

#### Issue #098 — [T7.1.2] Analytics aggregation queries (overview KPIs)

| Field | Details |
|---|---|
| **Title** | [T7.1.2] Analytics aggregation queries (overview KPIs) |
| **Description** | Implement: Analytics aggregation queries (overview KPIs). Part of Usage Analytics within EPIC 7 (Admin Analytics & Dashboard). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | Medium (Should Have) |
| **Story Points** | 5 |
| **Estimated Time** | 2 day(s) |
| **Labels** | `backend`, `epic-7`, `f7.1`, `database` |
| **Epic** | EPIC 7 — Admin Analytics & Dashboard |
| **Dependencies** | T7.1.1 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t7.1.2`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. DB schema/index changes reviewed (Aggregation pipeline). |
| **Assignee** | Isac Nady |

#### Issue #099 — [T7.1.3] GET /admin/analytics/overview

| Field | Details |
|---|---|
| **Title** | [T7.1.3] GET /admin/analytics/overview |
| **Description** | Implement: GET /admin/analytics/overview. Part of Usage Analytics within EPIC 7 (Admin Analytics & Dashboard). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | Medium (Should Have) |
| **Story Points** | 2 |
| **Estimated Time** | 1 day(s) |
| **Labels** | `backend`, `epic-7`, `f7.1` |
| **Epic** | EPIC 7 — Admin Analytics & Dashboard |
| **Dependencies** | T7.1.2 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t7.1.3`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. |
| **Assignee** | Sohyla Gomaa |

#### Issue #100 — [T7.1.4] GET /admin/analytics/usage (tokens/cost/latency)

| Field | Details |
|---|---|
| **Title** | [T7.1.4] GET /admin/analytics/usage (tokens/cost/latency) |
| **Description** | Implement: GET /admin/analytics/usage (tokens/cost/latency). Part of Usage Analytics within EPIC 7 (Admin Analytics & Dashboard). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | Medium (Should Have) |
| **Story Points** | 2 |
| **Estimated Time** | 1 day(s) |
| **Labels** | `backend`, `epic-7`, `f7.1` |
| **Epic** | EPIC 7 — Admin Analytics & Dashboard |
| **Dependencies** | T7.1.2 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t7.1.4`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. |
| **Assignee** | Marco Reda |

#### Issue #101 — [T7.1.5] Overview dashboard UI (KPI cards, charts)

| Field | Details |
|---|---|
| **Title** | [T7.1.5] Overview dashboard UI (KPI cards, charts) |
| **Description** | Implement: Overview dashboard UI (KPI cards, charts). Part of Usage Analytics within EPIC 7 (Admin Analytics & Dashboard). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | Medium (Should Have) |
| **Story Points** | 8 |
| **Estimated Time** | 2.5 day(s) |
| **Labels** | `frontend`, `epic-7`, `f7.1` |
| **Epic** | EPIC 7 — Admin Analytics & Dashboard |
| **Dependencies** | T1.3.3 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t7.1.5`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. |
| **Assignee** | Omar Abdelsattar |

### F7.2 — Audit Logging


#### Issue #102 — [T7.2.1] Design audit_logs schema + index (append-only)

| Field | Details |
|---|---|
| **Title** | [T7.2.1] Design audit_logs schema + index (append-only) |
| **Description** | Implement: Design audit_logs schema + index (append-only). Part of Audit Logging within EPIC 7 (Admin Analytics & Dashboard). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | Medium (Should Have) |
| **Story Points** | 2 |
| **Estimated Time** | 1 day(s) |
| **Labels** | `backend`, `epic-7`, `f7.2`, `database` |
| **Epic** | EPIC 7 — Admin Analytics & Dashboard |
| **Dependencies** | T1.2.2 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t7.2.1`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. DB schema/index changes reviewed (Schema). |
| **Assignee** | Sohyla Gomaa |

#### Issue #103 — [T7.2.2] Async, non-blocking audit-log writer

| Field | Details |
|---|---|
| **Title** | [T7.2.2] Async, non-blocking audit-log writer |
| **Description** | Implement: Async, non-blocking audit-log writer. Part of Audit Logging within EPIC 7 (Admin Analytics & Dashboard). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | Medium (Should Have) |
| **Story Points** | 3 |
| **Estimated Time** | 1.5 day(s) |
| **Labels** | `backend`, `epic-7`, `f7.2` |
| **Epic** | EPIC 7 — Admin Analytics & Dashboard |
| **Dependencies** | T7.2.1 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t7.2.2`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. |
| **Assignee** | Marco Reda |

#### Issue #104 — [T7.2.3] Wire audit writes into auth, document-delete, role-change flows

| Field | Details |
|---|---|
| **Title** | [T7.2.3] Wire audit writes into auth, document-delete, role-change flows |
| **Description** | Implement: Wire audit writes into auth, document-delete, role-change flows. Part of Audit Logging within EPIC 7 (Admin Analytics & Dashboard). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | Medium (Should Have) |
| **Story Points** | 3 |
| **Estimated Time** | 1.5 day(s) |
| **Labels** | `backend`, `epic-7`, `f7.2` |
| **Epic** | EPIC 7 — Admin Analytics & Dashboard |
| **Dependencies** | T7.2.2 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t7.2.3`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. |
| **Assignee** | Abdullah Adel |

#### Issue #105 — [T7.2.4] Audit Trail UI (searchable log viewer)

| Field | Details |
|---|---|
| **Title** | [T7.2.4] Audit Trail UI (searchable log viewer) |
| **Description** | Implement: Audit Trail UI (searchable log viewer). Part of Audit Logging within EPIC 7 (Admin Analytics & Dashboard). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | Medium (Should Have) |
| **Story Points** | 5 |
| **Estimated Time** | 2 day(s) |
| **Labels** | `frontend`, `epic-7`, `f7.2` |
| **Epic** | EPIC 7 — Admin Analytics & Dashboard |
| **Dependencies** | T1.3.3 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t7.2.4`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. |
| **Assignee** | Mahmoud Ramadan |

### F7.3 — Notifications


#### Issue #106 — [T7.3.1] Design notifications schema + index

| Field | Details |
|---|---|
| **Title** | [T7.3.1] Design notifications schema + index |
| **Description** | Implement: Design notifications schema + index. Part of Notifications within EPIC 7 (Admin Analytics & Dashboard). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | Medium (Should Have) |
| **Story Points** | 1 |
| **Estimated Time** | 0.5 day(s) |
| **Labels** | `backend`, `epic-7`, `f7.3`, `database` |
| **Epic** | EPIC 7 — Admin Analytics & Dashboard |
| **Dependencies** | T1.2.2 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t7.3.1`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. DB schema/index changes reviewed (Schema). |
| **Assignee** | Isac Nady |

#### Issue #107 — [T7.3.2] Notification-creation triggers (processing failure, quota, new gap)

| Field | Details |
|---|---|
| **Title** | [T7.3.2] Notification-creation triggers (processing failure, quota, new gap) |
| **Description** | Implement: Notification-creation triggers (processing failure, quota, new gap). Part of Notifications within EPIC 7 (Admin Analytics & Dashboard). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | Medium (Should Have) |
| **Story Points** | 3 |
| **Estimated Time** | 1.5 day(s) |
| **Labels** | `backend`, `epic-7`, `f7.3`, `database` |
| **Epic** | EPIC 7 — Admin Analytics & Dashboard |
| **Dependencies** | T7.3.1 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t7.3.2`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. DB schema/index changes reviewed (Writes). |
| **Assignee** | Sohyla Gomaa |

#### Issue #108 — [T7.3.3] GET /notifications + mark-read

| Field | Details |
|---|---|
| **Title** | [T7.3.3] GET /notifications + mark-read |
| **Description** | Implement: GET /notifications + mark-read. Part of Notifications within EPIC 7 (Admin Analytics & Dashboard). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | Medium (Should Have) |
| **Story Points** | 2 |
| **Estimated Time** | 1 day(s) |
| **Labels** | `backend`, `epic-7`, `f7.3` |
| **Epic** | EPIC 7 — Admin Analytics & Dashboard |
| **Dependencies** | T7.3.1 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t7.3.3`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. |
| **Assignee** | Isac Nady |

#### Issue #109 — [T7.3.4] Notification bell/dropdown UI

| Field | Details |
|---|---|
| **Title** | [T7.3.4] Notification bell/dropdown UI |
| **Description** | Implement: Notification bell/dropdown UI. Part of Notifications within EPIC 7 (Admin Analytics & Dashboard). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | Medium (Should Have) |
| **Story Points** | 3 |
| **Estimated Time** | 1.5 day(s) |
| **Labels** | `frontend`, `epic-7`, `f7.3` |
| **Epic** | EPIC 7 — Admin Analytics & Dashboard |
| **Dependencies** | T1.3.3 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t7.3.4`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. |
| **Assignee** | Marco Reda |

## EPIC 8: Security, Observability & DevOps


### F8.1 — Security Hardening


#### Issue #110 — [T8.1.1] Add helmet security headers

| Field | Details |
|---|---|
| **Title** | [T8.1.1] Add helmet security headers |
| **Description** | Implement: Add helmet security headers. Part of Security Hardening within EPIC 8 (Security, Observability & DevOps). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | High (Must Have) |
| **Story Points** | 1 |
| **Estimated Time** | 0.25 day(s) |
| **Labels** | `backend`, `epic-8`, `f8.1` |
| **Epic** | EPIC 8 — Security, Observability & DevOps |
| **Dependencies** | T1.2.1 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t8.1.1`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. |
| **Assignee** | Omar Abdelsattar |

#### Issue #111 — [T8.1.2] Request-validation layer (Zod schemas per endpoint)

| Field | Details |
|---|---|
| **Title** | [T8.1.2] Request-validation layer (Zod schemas per endpoint) |
| **Description** | Implement: Request-validation layer (Zod schemas per endpoint). Part of Security Hardening within EPIC 8 (Security, Observability & DevOps). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | High (Must Have) |
| **Story Points** | 8 |
| **Estimated Time** | 2.5 day(s) |
| **Labels** | `backend`, `epic-8`, `f8.1` |
| **Epic** | EPIC 8 — Security, Observability & DevOps |
| **Dependencies** | T1.2.1 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t8.1.2`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. |
| **Assignee** | Abdullah Adel |

#### Issue #112 — [T8.1.3] File-type magic-byte validation on upload

| Field | Details |
|---|---|
| **Title** | [T8.1.3] File-type magic-byte validation on upload |
| **Description** | Implement: File-type magic-byte validation on upload. Part of Security Hardening within EPIC 8 (Security, Observability & DevOps). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | High (Must Have) |
| **Story Points** | 2 |
| **Estimated Time** | 1 day(s) |
| **Labels** | `backend`, `epic-8`, `f8.1` |
| **Epic** | EPIC 8 — Security, Observability & DevOps |
| **Dependencies** | T4.1.3 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t8.1.3`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. |
| **Assignee** | Omar Abdelsattar |

#### Issue #113 — [T8.1.4] Secrets management via Docker secrets/.env conventions

| Field | Details |
|---|---|
| **Title** | [T8.1.4] Secrets management via Docker secrets/.env conventions |
| **Description** | Implement: Secrets management via Docker secrets/.env conventions. Part of Security Hardening within EPIC 8 (Security, Observability & DevOps). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | High (Must Have) |
| **Story Points** | 1 |
| **Estimated Time** | 0.5 day(s) |
| **Labels** | `backend`, `epic-8`, `f8.1` |
| **Epic** | EPIC 8 — Security, Observability & DevOps |
| **Dependencies** | T1.1.2 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t8.1.4`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. |
| **Assignee** | Isac Nady |

#### Issue #114 — [T8.1.5] Cross-tenant + RBAC security test suite

| Field | Details |
|---|---|
| **Title** | [T8.1.5] Cross-tenant + RBAC security test suite |
| **Description** | Implement: Cross-tenant + RBAC security test suite. Part of Security Hardening within EPIC 8 (Security, Observability & DevOps). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | High (Must Have) |
| **Story Points** | 8 |
| **Estimated Time** | 2.5 day(s) |
| **Labels** | `backend`, `epic-8`, `f8.1`, `database` |
| **Epic** | EPIC 8 — Security, Observability & DevOps |
| **Dependencies** | T2.3.4 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t8.1.5`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. DB schema/index changes reviewed (Test fixtures). |
| **Assignee** | Sohyla Gomaa |

### F8.2 — Observability


#### Issue #115 — [T8.2.1] Request correlation-ID propagation (API -> worker -> LLM call)

| Field | Details |
|---|---|
| **Title** | [T8.2.1] Request correlation-ID propagation (API -> worker -> LLM call) |
| **Description** | Implement: Request correlation-ID propagation (API -> worker -> LLM call). Part of Observability within EPIC 8 (Security, Observability & DevOps). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | High (Must Have) |
| **Story Points** | 3 |
| **Estimated Time** | 1.5 day(s) |
| **Labels** | `backend`, `epic-8`, `f8.2` |
| **Epic** | EPIC 8 — Security, Observability & DevOps |
| **Dependencies** | T1.2.6 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t8.2.1`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. |
| **Assignee** | Mahmoud Ramadan |

#### Issue #116 — [T8.2.2] Structured JSON logging across all services

| Field | Details |
|---|---|
| **Title** | [T8.2.2] Structured JSON logging across all services |
| **Description** | Implement: Structured JSON logging across all services. Part of Observability within EPIC 8 (Security, Observability & DevOps). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | High (Must Have) |
| **Story Points** | 2 |
| **Estimated Time** | 1 day(s) |
| **Labels** | `backend`, `epic-8`, `f8.2` |
| **Epic** | EPIC 8 — Security, Observability & DevOps |
| **Dependencies** | T8.2.1 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t8.2.2`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. |
| **Assignee** | Isac Nady |

#### Issue #117 — [T8.2.3] Optional Langfuse/tracing integration for the RAG pipeline

| Field | Details |
|---|---|
| **Title** | [T8.2.3] Optional Langfuse/tracing integration for the RAG pipeline |
| **Description** | Implement: Optional Langfuse/tracing integration for the RAG pipeline. Part of Observability within EPIC 8 (Security, Observability & DevOps). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | High (Must Have) |
| **Story Points** | 3 |
| **Estimated Time** | 1.5 day(s) |
| **Labels** | `backend`, `epic-8`, `f8.2` |
| **Epic** | EPIC 8 — Security, Observability & DevOps |
| **Dependencies** | T5.3.8 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t8.2.3`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. |
| **Assignee** | Omar Abdelsattar |

#### Issue #118 — [T8.2.4] Health/readiness checks for all containers

| Field | Details |
|---|---|
| **Title** | [T8.2.4] Health/readiness checks for all containers |
| **Description** | Implement: Health/readiness checks for all containers. Part of Observability within EPIC 8 (Security, Observability & DevOps). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | High (Must Have) |
| **Story Points** | 1 |
| **Estimated Time** | 0.5 day(s) |
| **Labels** | `backend`, `epic-8`, `f8.2` |
| **Epic** | EPIC 8 — Security, Observability & DevOps |
| **Dependencies** | T1.2.4 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t8.2.4`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. |
| **Assignee** | Marco Reda |

### F8.3 — CI/CD & Deployment


#### Issue #119 — [T8.3.1] Dockerfiles for backend, worker, frontend

| Field | Details |
|---|---|
| **Title** | [T8.3.1] Dockerfiles for backend, worker, frontend |
| **Description** | Implement: Dockerfiles for backend, worker, frontend. Part of CI/CD & Deployment within EPIC 8 (Security, Observability & DevOps). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | High (Must Have) |
| **Story Points** | 3 |
| **Estimated Time** | 1.5 day(s) |
| **Labels** | `full-stack`, `epic-8`, `f8.3` |
| **Epic** | EPIC 8 — Security, Observability & DevOps |
| **Dependencies** | T1.2.1, T1.3.1 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t8.3.1`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. |
| **Assignee** | Marco Reda |

#### Issue #120 — [T8.3.2] Finalize docker-compose.yml (Mongo, Redis, BE, worker, FE, vector store)

| Field | Details |
|---|---|
| **Title** | [T8.3.2] Finalize docker-compose.yml (Mongo, Redis, BE, worker, FE, vector store) |
| **Description** | Implement: Finalize docker-compose.yml (Mongo, Redis, BE, worker, FE, vector store). Part of CI/CD & Deployment within EPIC 8 (Security, Observability & DevOps). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | High (Must Have) |
| **Story Points** | 3 |
| **Estimated Time** | 1.5 day(s) |
| **Labels** | `full-stack`, `epic-8`, `f8.3` |
| **Epic** | EPIC 8 — Security, Observability & DevOps |
| **Dependencies** | T8.3.1 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t8.3.2`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. |
| **Assignee** | Isac Nady |

#### Issue #121 — [T8.3.3] GitHub Actions: lint + test + build pipeline

| Field | Details |
|---|---|
| **Title** | [T8.3.3] GitHub Actions: lint + test + build pipeline |
| **Description** | Implement: GitHub Actions: lint + test + build pipeline. Part of CI/CD & Deployment within EPIC 8 (Security, Observability & DevOps). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | High (Must Have) |
| **Story Points** | 3 |
| **Estimated Time** | 1.5 day(s) |
| **Labels** | `backend`, `epic-8`, `f8.3` |
| **Epic** | EPIC 8 — Security, Observability & DevOps |
| **Dependencies** | T1.1.6 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t8.3.3`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. |
| **Assignee** | Mahmoud Ramadan |

#### Issue #122 — [T8.3.4] GitHub Actions: Docker image build & push

| Field | Details |
|---|---|
| **Title** | [T8.3.4] GitHub Actions: Docker image build & push |
| **Description** | Implement: GitHub Actions: Docker image build & push. Part of CI/CD & Deployment within EPIC 8 (Security, Observability & DevOps). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | High (Must Have) |
| **Story Points** | 2 |
| **Estimated Time** | 1 day(s) |
| **Labels** | `backend`, `epic-8`, `f8.3` |
| **Epic** | EPIC 8 — Security, Observability & DevOps |
| **Dependencies** | T8.3.1 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t8.3.4`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. |
| **Assignee** | Abdullah Adel |

#### Issue #123 — [T8.3.5] Seed script for demo data (tenants, users, sample docs)

| Field | Details |
|---|---|
| **Title** | [T8.3.5] Seed script for demo data (tenants, users, sample docs) |
| **Description** | Implement: Seed script for demo data (tenants, users, sample docs). Part of CI/CD & Deployment within EPIC 8 (Security, Observability & DevOps). |
| **Acceptance Criteria** | - Functionality described is fully implemented and merged to main branch.<br>- Endpoint/component behaves correctly for valid and invalid inputs (tested manually or via automated test).<br>- No regression introduced to dependent modules.<br>- Code passes linting and CI checks. |
| **Priority** | High (Must Have) |
| **Story Points** | 3 |
| **Estimated Time** | 1.5 day(s) |
| **Labels** | `backend`, `epic-8`, `f8.3`, `database` |
| **Epic** | EPIC 8 — Security, Observability & DevOps |
| **Dependencies** | T4.1.1, T5.1.1 |
| **Checklist** | - [ ] Branch created from `main` (`feature/t8.3.5`)<br>- [ ] Implementation complete<br>- [ ] Unit/integration tests written (where applicable)<br>- [ ] Manually verified against acceptance criteria<br>- [ ] Code reviewed by at least one other developer<br>- [ ] Documentation/comments updated<br>- [ ] Merged and deployed to dev environment |
| **Definition of Done** | Code merged to main, passes CI, meets acceptance criteria, reviewed and approved via PR, no known regressions. DB schema/index changes reviewed (Seed writes). |
| **Assignee** | Omar Abdelsattar |

---
## Summary: All Issues (Quick Reference)

| # | Task ID | Title | Assignee | Story Pts | Est. Days | Priority |
|---|---|---|---|---|---|---|
| 001 | T1.1.1 | Initialize monorepo structure (frontend/, backend/, workers/) | Mahmoud Ramadan | 1 | 0.5 | High |
| 002 | T1.1.2 | Write base docker-compose.yml (Mongo, Redis, backend, worker, frontend) | Marco Reda | 2 | 1 | High |
| 003 | T1.1.3 | Environment variable management (.env, config module, per-service validation) | Omar Abdelsattar | 1 | 0.5 | High |
| 004 | T1.1.4 | Shared TypeScript configs (base tsconfig, path aliases) for FE & BE | Isac Nady | 1 | 0.5 | High |
| 005 | T1.1.5 | Shared ESLint/Prettier config across packages | Abdullah Adel | 1 | 0.5 | High |
| 006 | T1.1.6 | GitHub Actions CI skeleton (lint -> build -> test stages) | Sohyla Gomaa | 2 | 1 | High |
| 007 | T1.2.1 | Bootstrap Express app with folder structure (config/modules/common/workers/providers/db) | Mahmoud Ramadan | 2 | 1 | High |
| 008 | T1.2.2 | MongoDB connection module (Mongoose) with retry/backoff | Omar Abdelsattar | 1 | 0.5 | High |
| 009 | T1.2.3 | Redis connection module (shared by rate-limit, BullMQ, cache) | Isac Nady | 1 | 0.5 | High |
| 010 | T1.2.4 | /healthz and /readyz endpoints | Abdullah Adel | 1 | 0.5 | High |
| 011 | T1.2.5 | Global error-handling middleware + standardized error envelope | Marco Reda | 2 | 1 | High |
| 012 | T1.2.6 | Structured logging (pino/Winston) with request correlation ID | Omar Abdelsattar | 2 | 1 | High |
| 013 | T1.3.1 | Bootstrap Next.js (App Router) + TS + Tailwind | Isac Nady | 1 | 0.5 | High |
| 014 | T1.3.2 | i18n scaffolding (ar/en) with automatic RTL/LTR layout switching | Abdullah Adel | 2 | 1 | High |
| 015 | T1.3.3 | Base design system (colors, type scale, shared components) | Sohyla Gomaa | 3 | 1.5 | High |
| 016 | T1.3.4 | API client wrapper with access-token attach + refresh interceptor | Mahmoud Ramadan | 2 | 1 | High |
| 017 | T2.1.1 | Design tenants and users Mongoose schemas + indexes (tenantId+email unique) | Isac Nady | 2 | 1 | High |
| 018 | T2.1.2 | POST /auth/register - creates tenant + first Company Admin | Marco Reda | 3 | 1.5 | High |
| 019 | T2.1.3 | Password hashing utility (argon2) | Omar Abdelsattar | 1 | 0.5 | High |
| 020 | T2.1.4 | Email verification token generation + verify endpoint | Abdullah Adel | 2 | 1 | High |
| 021 | T2.1.5 | Registration UI form + client-side validation | Mahmoud Ramadan | 2 | 1 | High |
| 022 | T2.2.1 | POST /auth/login - credential check, issue JWT access + refresh tokens | Omar Abdelsattar | 3 | 1.5 | High |
| 023 | T2.2.2 | Refresh-token storage & rotation strategy (hashed, Redis/Mongo) | Isac Nady | 5 | 2 | High |
| 024 | T2.2.3 | POST /auth/refresh with reuse-detection (revoke token family on reuse) | Sohyla Gomaa | 3 | 1.5 | High |
| 025 | T2.2.4 | POST /auth/logout - revoke active refresh token | Abdullah Adel | 1 | 0.5 | High |
| 026 | T2.2.5 | GET /auth/me | Mahmoud Ramadan | 1 | 0.5 | High |
| 027 | T2.2.6 | Login UI + secure token storage (httpOnly cookie or in-memory) | Marco Reda | 3 | 1.5 | High |
| 028 | T2.2.7 | Auth guard middleware (verify JWT, attach req.user) | Abdullah Adel | 2 | 1 | High |
| 029 | T2.3.1 | Tenant-scoping middleware - extracts tenantId from verified JWT only | Mahmoud Ramadan | 5 | 2 | High |
| 030 | T2.3.2 | Role-based authorization guard | Omar Abdelsattar | 3 | 1.5 | High |
| 031 | T2.3.3 | Repository-layer wrapper requiring tenantId param on every query | Sohyla Gomaa | 5 | 2 | High |
| 032 | T2.3.4 | Automated cross-tenant isolation test suite (mongodb-memory-server) | Isac Nady | 5 | 2 | High |
| 033 | T2.3.5 | Rate-limiting middleware (express-rate-limit + Redis store) | Abdullah Adel | 2 | 1 | High |
| 034 | T3.1.1 | POST /users - invite with email token | Marco Reda | 3 | 1.5 | Medium |
| 035 | T3.1.2 | GET /users - paginated list | Omar Abdelsattar | 2 | 1 | Medium |
| 036 | T3.1.3 | PATCH /users/:id - role/status update + audit log write | Abdullah Adel | 2 | 1 | Medium |
| 037 | T3.1.4 | Set-password-from-invite flow | Mahmoud Ramadan | 2 | 1 | Medium |
| 038 | T3.1.5 | Users management UI (list, invite modal, role editor) | Sohyla Gomaa | 5 | 2 | Medium |
| 039 | T3.2.1 | GET /platform/tenants - list all, filters, pagination | Marco Reda | 3 | 1.5 | Medium |
| 040 | T3.2.2 | PATCH /platform/tenants/:id - suspend/reinstate/change plan | Omar Abdelsattar | 3 | 1.5 | Medium |
| 041 | T3.2.3 | Super Admin dashboard UI (tenant list + actions) | Isac Nady | 5 | 2 | Medium |
| 042 | T4.1.1 | Design documents + document_versions schemas + indexes | Abdullah Adel | 2 | 1 | High |
| 043 | T4.1.2 | File-storage adapter interface (local disk now, S3/MinIO-pluggable later) | Mahmoud Ramadan | 3 | 1.5 | High |
| 044 | T4.1.3 | POST /documents/upload - multipart, MIME + size + magic-byte validation | Abdullah Adel | 5 | 2 | High |
| 045 | T4.1.4 | Idempotency-key handling for upload retries | Marco Reda | 2 | 1 | High |
| 046 | T4.1.5 | Upload UI (drag/drop, metadata form, progress bar) | Omar Abdelsattar | 5 | 2 | High |
| 047 | T4.2.1 | Set up BullMQ queues - separate CPU-bound vs I/O-bound queues | Sohyla Gomaa | 5 | 2 | High |
| 048 | T4.2.2 | Text-extraction adapters (pdf-parse, mammoth, plain TXT) | Mahmoud Ramadan | 3 | 1.5 | High |
| 049 | T4.2.3 | OCR path (Tesseract, Arabic+English packs) with quality scoring | Isac Nady | 8 | 2.5 | High |
| 050 | T4.2.4 | Text cleaning (headers/footers/boilerplate/noise removal) | Marco Reda | 3 | 1.5 | High |
| 051 | T4.2.5 | Semantic chunking (~600-900 tokens, configurable overlap) | Abdullah Adel | 5 | 2 | High |
| 052 | T4.2.6 | document_chunks schema + metadata attach | Mahmoud Ramadan | 3 | 1.5 | High |
| 053 | T4.2.7 | processing_jobs status tracking + retry/backoff logic | Omar Abdelsattar | 3 | 1.5 | High |
| 054 | T4.2.8 | Document status state machine (uploaded->...->ready/failed) | Sohyla Gomaa | 2 | 1 | High |
| 055 | T4.3.1 | Embedding-provider adapter interface (env-configurable) | Marco Reda | 3 | 1.5 | High |
| 056 | T4.3.2 | Batch embedding calls with retry | Isac Nady | 5 | 2 | High |
| 057 | T4.3.3 | Configure vector index with tenantId+accessRoles pre-filter | Sohyla Gomaa | 5 | 2 | High |
| 058 | T4.3.4 | POST /documents/:id/reprocess | Mahmoud Ramadan | 2 | 1 | High |
| 059 | T4.4.1 | GET /documents - list + status, paginated | Omar Abdelsattar | 2 | 1 | High |
| 060 | T4.4.2 | GET /documents/:id - detail | Abdullah Adel | 1 | 0.5 | High |
| 061 | T4.4.3 | PATCH /documents/:id - accessRoles/metadata update | Marco Reda | 2 | 1 | High |
| 062 | T4.4.4 | DELETE /documents/:id - cascades chunks + versions + storage + vector index | Abdullah Adel | 5 | 2 | High |
| 063 | T4.4.5 | Document versioning on replace-upload (preserve citation integrity) | Mahmoud Ramadan | 5 | 2 | High |
| 064 | T4.4.6 | Documents management UI (list, filters, detail panel) | Omar Abdelsattar | 8 | 2.5 | High |
| 065 | T5.1.1 | Design conversations + messages schemas + indexes | Marco Reda | 2 | 1 | High |
| 066 | T5.1.2 | POST /conversations | Isac Nady | 1 | 0.5 | High |
| 067 | T5.1.3 | GET /conversations - own, paginated | Sohyla Gomaa | 1 | 0.5 | High |
| 068 | T5.1.4 | POST /conversations/:id/messages - entrypoint | Isac Nady | 2 | 1 | High |
| 069 | T5.1.5 | Chat UI shell (message list, input box, language toggle) | Sohyla Gomaa | 5 | 2 | High |
| 070 | T5.2.1 | Query-embedding step | Marco Reda | 2 | 1 | High |
| 071 | T5.2.2 | Vector similarity search with tenant+role filter | Abdullah Adel | 5 | 2 | High |
| 072 | T5.2.3 | Keyword/text-index search | Mahmoud Ramadan | 3 | 1.5 | High |
| 073 | T5.2.4 | Result merge + de-duplication | Isac Nady | 2 | 1 | High |
| 074 | T5.2.5 | Reranking step (define + implement chosen method) | Marco Reda | 8 | 2.5 | High |
| 075 | T5.2.6 | Query rewrite step (rule-based or LLM-based) | Omar Abdelsattar | 3 | 1.5 | High |
| 076 | T5.3.1 | LLM-provider adapter (env-configurable) | Isac Nady | 8 | 2.5 | High |
| 077 | T5.3.2 | Evidence-only prompt construction + injection-hardening rules | Sohyla Gomaa | 5 | 2 | High |
| 078 | T5.3.3 | Draft-answer generation call | Mahmoud Ramadan | 2 | 1 | High |
| 079 | T5.3.4 | Confidence/refusal threshold logic (quantified) | Abdullah Adel | 5 | 2 | High |
| 080 | T5.3.5 | Citation verification (claim <-> chunk matching) | Omar Abdelsattar | 8 | 2.5 | High |
| 081 | T5.3.6 | citations as first-class collection + persistence | Mahmoud Ramadan | 3 | 1.5 | High |
| 082 | T5.3.7 | Refusal-mode response formatting (bilingual) | Marco Reda | 2 | 1 | High |
| 083 | T5.3.8 | Multi-agent orchestration (Supervisor -> Retrieval -> Draft -> Compliance -> Final) | Sohyla Gomaa | 8 | 2.5 | High |
| 084 | T5.3.9 | Persist final message + usage_logs (tokens, latency, cost) | Isac Nady | 3 | 1.5 | High |
| 085 | T5.3.10 | Answer-rendering UI with inline citations + source-viewer panel | Abdullah Adel | 8 | 2.5 | High |
| 086 | T5.3.11 | SSE/polling for progressive chat-response status | Mahmoud Ramadan | 5 | 2 | High |
| 087 | T6.1.1 | GET /messages/:id/citations | Marco Reda | 2 | 1 | Medium |
| 088 | T6.1.2 | Source Viewer UI component (doc name, page, snippet) | Omar Abdelsattar | 3 | 1.5 | Medium |
| 089 | T6.2.1 | Design feedback schema + index | Marco Reda | 1 | 0.5 | Medium |
| 090 | T6.2.2 | POST /messages/:id/feedback | Isac Nady | 2 | 1 | Medium |
| 091 | T6.2.3 | Thumbs up/down UI + comment modal | Marco Reda | 2 | 1 | Medium |
| 092 | T6.3.1 | Design knowledge_gaps schema + index | Sohyla Gomaa | 2 | 1 | Medium |
| 093 | T6.3.2 | Topic normalization/clustering on refusal events | Mahmoud Ramadan | 8 | 2.5 | Medium |
| 094 | T6.3.3 | GET /admin/analytics/knowledge-gaps | Omar Abdelsattar | 2 | 1 | Medium |
| 095 | T6.3.4 | Mark-as-resolved action | Isac Nady | 1 | 0.5 | Medium |
| 096 | T6.3.5 | Knowledge Gaps dashboard UI | Abdullah Adel | 5 | 2 | Medium |
| 097 | T7.1.1 | Design usage_logs schema + index | Marco Reda | 1 | 0.5 | Medium |
| 098 | T7.1.2 | Analytics aggregation queries (overview KPIs) | Isac Nady | 5 | 2 | Medium |
| 099 | T7.1.3 | GET /admin/analytics/overview | Sohyla Gomaa | 2 | 1 | Medium |
| 100 | T7.1.4 | GET /admin/analytics/usage (tokens/cost/latency) | Marco Reda | 2 | 1 | Medium |
| 101 | T7.1.5 | Overview dashboard UI (KPI cards, charts) | Omar Abdelsattar | 8 | 2.5 | Medium |
| 102 | T7.2.1 | Design audit_logs schema + index (append-only) | Sohyla Gomaa | 2 | 1 | Medium |
| 103 | T7.2.2 | Async, non-blocking audit-log writer | Marco Reda | 3 | 1.5 | Medium |
| 104 | T7.2.3 | Wire audit writes into auth, document-delete, role-change flows | Abdullah Adel | 3 | 1.5 | Medium |
| 105 | T7.2.4 | Audit Trail UI (searchable log viewer) | Mahmoud Ramadan | 5 | 2 | Medium |
| 106 | T7.3.1 | Design notifications schema + index | Isac Nady | 1 | 0.5 | Medium |
| 107 | T7.3.2 | Notification-creation triggers (processing failure, quota, new gap) | Sohyla Gomaa | 3 | 1.5 | Medium |
| 108 | T7.3.3 | GET /notifications + mark-read | Isac Nady | 2 | 1 | Medium |
| 109 | T7.3.4 | Notification bell/dropdown UI | Marco Reda | 3 | 1.5 | Medium |
| 110 | T8.1.1 | Add helmet security headers | Omar Abdelsattar | 1 | 0.25 | High |
| 111 | T8.1.2 | Request-validation layer (Zod schemas per endpoint) | Abdullah Adel | 8 | 2.5 | High |
| 112 | T8.1.3 | File-type magic-byte validation on upload | Omar Abdelsattar | 2 | 1 | High |
| 113 | T8.1.4 | Secrets management via Docker secrets/.env conventions | Isac Nady | 1 | 0.5 | High |
| 114 | T8.1.5 | Cross-tenant + RBAC security test suite | Sohyla Gomaa | 8 | 2.5 | High |
| 115 | T8.2.1 | Request correlation-ID propagation (API -> worker -> LLM call) | Mahmoud Ramadan | 3 | 1.5 | High |
| 116 | T8.2.2 | Structured JSON logging across all services | Isac Nady | 2 | 1 | High |
| 117 | T8.2.3 | Optional Langfuse/tracing integration for the RAG pipeline | Omar Abdelsattar | 3 | 1.5 | High |
| 118 | T8.2.4 | Health/readiness checks for all containers | Marco Reda | 1 | 0.5 | High |
| 119 | T8.3.1 | Dockerfiles for backend, worker, frontend | Marco Reda | 3 | 1.5 | High |
| 120 | T8.3.2 | Finalize docker-compose.yml (Mongo, Redis, BE, worker, FE, vector store) | Isac Nady | 3 | 1.5 | High |
| 121 | T8.3.3 | GitHub Actions: lint + test + build pipeline | Mahmoud Ramadan | 3 | 1.5 | High |
| 122 | T8.3.4 | GitHub Actions: Docker image build & push | Abdullah Adel | 2 | 1 | High |
| 123 | T8.3.5 | Seed script for demo data (tenants, users, sample docs) | Omar Abdelsattar | 3 | 1.5 | High |

---
## Workload Balance Summary

| Developer | Total Story Points | Total Estimated Days |
|---|---|---|
| Mahmoud Ramadan | 63 | 28.0 |
| Marco Reda | 58 | 27.5 |
| Omar Abdelsattar | 67 | 28.2 |
| Isac Nady | 66 | 27.5 |
| Abdullah Adel | 67 | 27.5 |
| Sohyla Gomaa | 66 | 27.0 |