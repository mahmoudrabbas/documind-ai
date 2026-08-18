# Document Authorization and RAG Retrieval Audit Report

## 1. Executive Summary

Tenant isolation and the core permission evaluator are, in my assessment, the strongest parts of this system. I found no confirmed cross-tenant document leak, and — importantly — there is no permission cache at all (permissions.evaluator.ts:142: "Resolution is intentionally uncached"), so "stale permission cache" is not a viable explanation for the reported intermittency. That eliminates one of your hypotheses outright.

The real problem is that document access authorization and RAG document filtering are not the same source of truth. They agree on the policy layer and disagree on four independent additional gates that only RAG appltly valid, explicit Manage Access grant and still be invisible to RAG.

The single most load-bearing finding: documents:read/discover anarate, independently-scoped grants and separate policy actions.Everything the UI shows you is computed from the first. Everything RAG can see is computed from the second. Nothing in the product surfaces the gap.

Ranked, evidence-backed causes of "the answer is clearly in an asistant says it doesn't know":


```text
┌─────┬───────────────────────────────────────────────────────────────────────────────────────────────────────────┬───────────────────┬───────────────────┐
│  #  │                                                   Cause                      │       Class       │      Status       │
├─────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────┼───────────────────┼───────────────────┤
│ 1   │ Evidence gate: reranker returns CONFLICTING on any two chunks with different numbers for the same metric, │ QUALITY           │ CONFIRMED         │
│     │  or asymmetric negation → whole bundle discarded                                                          │                   │ (reproduced)      │
├─────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────┼───────────────────┼───────────────────┤
│ 2   │ Policy rule grants read without use_in_ai (legacy polici)                    │ AVAILABILITY      │ CONFIRMED         │
├─────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────┼───────────────────┼───────────────────┤
│ 3   │ DEFAULT_ROLE_CLASSIFICATIONS hard-blocks EMPLOYEE from c_confidential in RAG │ AVAILABILITY      │ CONFIRMED         │
│     │  only — overrides explicit grants                                                                         │                   │                   │
├─────┼──────────────────────────────────────────────────────────────────────────────┼───────────────────┼───────────────────┤
│ 4   │ Department-scoped custom grant deletes the inherited base permission; scoped only on use-in-ai → UI       │ AVAILABILITY      │ CONFIRMED         │
│     │ works, RAG blind                                                                                          │                   │                   │
├─────┼──────────────────────────────────────────────────────────────────────────────┼───────────────────┼───────────────────┤
│ 5   │ Citation semantic verification bounds (>20 claims / >500-char claim) → summaries systematically refused   │ QUALITY           │ CONFIRMED         │
├─────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────┼───────────────────┼───────────────────┤
│ 6   │ Department/category rename or archive silently produces {$in: []} or a new-name-vs-stale-chunk-text       │ AVAILABILITY      │ CONFIRMED         │
│     │ mismatch                                                                     │                   │                   │
├─────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────┼───────────────────┼───────────────────┤
│ 1   │ Evidence gate: reranker returns CONFLICTING on any two cfor the same metric, │ QUALITY           │ CONFIRMED         │
│     │  or asymmetric negation → whole bundle discarded                                                          │                   │ (reproduced)      │
├─────┼──────────────────────────────────────────────────────────────────────────────┼───────────────────┼───────────────────┤
│ 2   │ Policy rule grants read without use_in_ai (legacy policies; owner-minimum excludes it)                    │ AVAILABILITY      │ CONFIRMED         │
├─────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────┼───────────────────┼───────────────────┤
│ 3   │ DEFAULT_ROLE_CLASSIFICATIONS hard-blocks EMPLOYEE from c_confidential in RAG │ AVAILABILITY      │ CONFIRMED         │
│     │  only — overrides explicit grants                                                                         │                   │                   │
├─────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────┼───────────────────┼───────────────────┤
│ 4   │ Department-scoped custom grant deletes the inherited base permission; scoped only on use-in-ai → UI       │ AVAILABILITY      │ CONFIRMED         │
│     │ works, RAG blind                                                                                          │                   │                   │
├─────┼──────────────────────────────────────────────────────────────────────────────┼───────────────────┼───────────────────┤
│ 5   │ Citation semantic verification bounds (>20 claims / >500-char claim) → summaries systematically refused   │ QUALITY           │ CONFIRMED         │
├─────┼──────────────────────────────────────────────────────────────────────────────┼───────────────────┼───────────────────┤
│ 6   │ Department/category rename or archive silently produces {$in: []} or a new-name-vs-stale-chunk-text       │ AVAILABILITY      │ CONFIRMED         │
│     │ mismatch                                                                     │                   │                   │
├─────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────┼───────────────────┼───────────────────┤
│ 7   │ Single-shot retrieval, topK = 5, no broadening, no retry                                                  │ QUALITY           │ CONFIRMED         │
├─────┼──────────────────────────────────────────────────────────────────────────────┼───────────────────┼───────────────────┤
│ 8   │ Intent routing: substring hack/unsafe hard-block; latest+news/prices → unsupported                        │ INTENT_ROUTING    │ CONFIRMED         │
├─────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────┼───────────────────┼───────────────────┤
│ 9   │ Follow-ups: only one hardcoded remote-work bridge exists; others → clarification with no retrieval, or    │ FOLLOW_UP_CONTEXT │ CONFIRMED         │
│     │ get pinned to the previous document                                          │                   │                   │
├─────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────┼───────────────────┼───────────────────┤
│ 10  │ Trusted-candidate-catalog miss → sufficiency mathematicaermanent WEAK        │ QUALITY           │ CONFIRMED         │
│     │                                                                                                           │                   │ (reproduced)      │
└─────┴──────────────────────────────────────────────────────────────────────────────┴───────────────────┴───────────────────┘
```


Confidence: High on architecture, the effective-access formulas, and findings 1–10 (all traced to specific lines; 1 and 10 reproduced by executing the real
modules). Medium on runtime frequency — I could not observe your tell you which of these is firing most often for your users. §20 gives you the exact steps to determine that.

There is one thing I want to flag plainly: your observability cannot distinguish these ten causes from one another. Every one of them produces the same user-visible string. evaluate_evidence — the gate that makes the final call — logs nothing, and the retrieval stage stamps its logs with a freshly generated
random traceId (retrieval.service.ts:676) instead of the request joined to the chat turn. Until that is fixed, any fix youattempt is unverifiable in production. I would treat that as P0 alongside the access bugs.

## 2. Actual Authorization Architecture

Derived from source, not documentation. This is the real runtime chain.

```text
HTTP request
  │  Authorization: Bearer <JWT>
  ▼
authenticate                       api/src/common/middlewares/authenticate.middleware.ts
  │  • verifyJwt(JWT_SECRET); requires type==="access", sub, ten
  │  • requireActiveTenantAccess(claims.tenantId) → Tenant.status MUST === "active"
  │  • if claims.sessionVersion is a number → compare to User.se
  │  Authorization: Bearer <JWT>
  ▼
authenticate                       api/src/common/middlewares/authenticate.middleware.ts
  │  • verifyJwt(JWT_SECRET); requires type==="access", sub, tenantId, isBaseRole(role)
  │  • requireActiveTenantAccess(claims.tenantId) → Tenant.statu
  │  • if claims.sessionVersion is a number → compare to User.sessionVersion
  │  • ✗ does NOT check User.status here
  │  • req.auth = { userId, tenantId, role, email }   ← role is FROM THE TOKEN
  ▼
tenantScoping                      api/src/common/middlewares/tenantScoping.middleware.ts
  │  req.tenantId = req.auth.tenantId          ← the ONLY tenant
  ▼
requirePermission(P, opts)         api/src/modules/permissions/p
  │  → getPermissionEvaluator().evaluate({ actorId, tenantId, baseRole(claim), P, resource? })
  ▼
PermissionEvaluatorImpl.resolve    api/src/modules/permissions/p
  │  • User.findOne({_id, tenantId}) → requires isBaseRole(user.role) && user.status==="active"
  │  • baseRole = user.role            ← DB WINS; the JWT claim is ignored here
  │  • roleMigrationState==="pending-session-revocation" | permissionBaseline==="legacy-none" → EMPTY
  │  • SUPER_ADMIN → must be in the platform tenant (slug "documind.ai", isSystemTenant, active) else EMPTY
  │  • base grants = SUPER_ADMIN ? ALL_PERMISSIONS : BASE_ROLE_D
  │  • customRoleId (never for SUPER_ADMIN) → Role.findOne({_id, tenantId})
  │      – 7 validity checks (baseRole match, contractVersion, m
  │      – any failure ⇒ customRoleState="invalid" ⇒ **effectiveGrants = EMPTY MAP** (base too)
  │      – per grant: if user has an assigned department AND gra
  │        does not contain it ⇒ grants.DELETE(permission)   ← SUBTRACTIVE
  │      – else additive; a scoped custom grant NARROWS an inherited base grant
  ▼
decidePermission                   api/src/modules/permissions/permissions.decision.ts
  │  • resource.tenantId !== actor.tenantId → TENANT_MISMATCH
  │  • grant missing → INVALID_ROLE | ROLE_ARCHIVED | ROLE_NOT_FOUND | PERMISSION_REQUIRED
  │  • grant scoped && no resource → RESOURCE_CONTEXT_REQUIRED
  │  • matchesScopes(): selfOnly ∧ departmentIds ∧ documentCategories ∧ documentClassifications
  ▼
DocumentAccessAuthorizationService  api/src/modules/document-access/documentAccess.authorization.service.ts
  │  authorizeDocumentAction(ctx, documentId, action)
  │  • loadActor(): User active + resolve() + customRoleState ∈ {none,active}
  │      else → hidden() = 404 DOCUMENT_NOT_FOUND
  │      departmentIds ← employeeProfile.departmentId (or legacy
  │  • loadDocument tenant-scoped; deletedAt ⇒ deny (except restore/delete)
  │  • ★ action==="manage_access" && baseRole ∈ {SUPER_ADMIN, COMPANY_ADMIN} ⇒ RETURN (allow)
  │  • !activePolicyId || !activePolicyVersion ⇒ POLICY_MISSING (deny)
  │  • policy snapshot fetched EXACT (policyId + policyVersion)
  │  • policy.indexMetadata.{category,department,classification}Id must equal the document's ⇒ else STALE_POLICY_CONTEXT
  ▼
InMemoryDocumentAccessPolicyEvaluator  documentAccess.evaluator.inMemory.ts   ← this IS production
  │  • tenant mismatch / invalid ctx / unsupported action / miss
  │  • status!=="active", effectiveFrom/Until window
  │  • capability gate → DOCUMENT_ACTION_PERMISSION_MAP[action]
  │  • rules ∪ inheritedRules, filtered to the action, subject-matched
  │      subjects: user | custom_role | department | owner | tenant_member
  │  • ANY deny wins → EXPLICIT_DENY;  no allow → NO_MATCHING_GR
  ▼
──────────────── two divergent consumers ────────────────
  │
  ├── UI list   documents.service.ts:459 → buildDiscoverPipelinee
  │              action = "discover";  scope match uses departmentId (ObjectId)
  │
  └── RAG       chat.routes → chat.controller → ChatService → ChatWorkflowService
                 └─ SupervisorRuntime (deterministic hooks, mode
                     ├─ intent-query-agent      IntentQueryService.analyzeQuery
                     ├─ tool resolve_document_titles
                     ├─ tool authorized_hybrid_search
                     │    └─ HybridRetrievalService.hybridSearch
                     │        ├─ resolveAccessContext (app.ts:272) ← use_in_ai grant scope ONLY
                     │        ├─ compileAccessFilters (filterCompiler.ts) ← ★ ROLE CLASSIFICATION GATE
                     │        ├─ Atlas $vectorSearch (chunkembeddings) + $search (documentchunks)
                     │        ├─ authorizeCandidateIds → use_in_
                     │        ├─ revalidateAndHydrate ← re-check classification/department/category
                     │        │                          + build
                     │        └─ reauthorizeFinalCandidates → use_in_ai again
                     ├─ tool evaluate_evidence   ← ★ THE DECIDIN
                     ├─ answer-writer-agent
                     ├─ citation-verification-agent ← ★ semantic claim verification
                     └─ compliance-agent (deterministic) → relea
```

### Arrow → Source File Index


```text
┌───────────────────────────────────┬──────────────────────────────────────────────────────────────────────────────────────────────────┐
│               Arrow               │                                               File                                               │
├───────────────────────────────────┼─────────────────────────────────────────────────────────────────────┤
│ request → authenticated user      │ api/src/common/middlewares/authenticate.middleware.ts                                            │
├───────────────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────┤
│ user → tenant                     │ api/src/common/middlewares common/auth/tenantAccess.ts              │
├───────────────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────┤
│ tenant → base role                │ api/src/db/models/user.model.ts, common/auth/baseRoles.ts                                        │
├───────────────────────────────────┼─────────────────────────────────────────────────────────────────────┤
│ base role → custom role           │ api/src/db/models/role.model.ts                                                                  │
├───────────────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────┤
│ roles → permissions               │ api/src/modules/permissionermissions.catalog.ts                     │
├───────────────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────┤
│ permissions → decision            │ api/src/modules/permissions/permissions.decision.ts, permissions.scope.ts                        │
├───────────────────────────────────┼─────────────────────────────────────────────────────────────────────┤
│ permission → document capability  │ api/src/modules/document-access/documentAccess.capability.ts                                     │
├───────────────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────┤
│ capability → document ACL         │ api/src/modules/document-ar.inMemory.ts                             │
├───────────────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────┤
│ ACL persistence                   │ api/src/db/models/documentAccessPolicy.model.ts, documentAccess.policy.repository.mongo.ts       │
├───────────────────────────────────┼─────────────────────────────────────────────────────────────────────┤
│ Manage Access writes              │ documentPolicyManagement.service.ts, documentPolicyManagement.persistence.ts                     │
├───────────────────────────────────┼─────────────────────────────────────────────────────────────────────┤
│ effective allowed documents (UI)  │ documentAccess.authorization.service.ts:152 buildDiscoverPolicyPipeline                          │
├───────────────────────────────────┼─────────────────────────────────────────────────────────────────────┤
│ effective allowed documents (RAG) │ none — there is no allowedDocumentIds list; see §10                                              │
├───────────────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────┤
│ chat intent/router                │ api/src/modules/intent-queents/chatWorkflow*.ts                     │
├───────────────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────┤
│ RAG retrieval                     │ api/src/modules/retrieval/retrieval.service.ts, filterCompiler.ts, providers/embedding/atlas*.ts │
├───────────────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────┤
│ post-retrieval authz filtering    │ retrieval.service.ts (authorizeCandidateIds, revalidateAndHydrate, reauthorizeFinalCandidates)   │
├───────────────────────────────────┼─────────────────────────────────────────────────────────────────────┤
│ evidence gate                     │ agents/tools/authorizedRetrievalTools.ts + modules/reranker/*                                    │
├───────────────────────────────────┼─────────────────────────────────────────────────────────────────────┤
│ answer / citations                │ agents/answerWriterAgent.ts, agents/citationVerificationAgent.ts, agents/compliance.service.ts   │
└───────────────────────────────────┴─────────────────────────────────────────────────────────────────────┘
```


## 3. Roles and Permissions — Exact Behavior

Base roles (common/auth/baseRoles.ts): SUPER_ADMIN, COMPANY_ADMIN, EMPLOYEE. Assignable tenant bases: COMPANY_ADMIN, EMPLOYEE.


```text
┌─────────────────────────────┬──────────────────────────────────────────────────────────────────────────────────────────┬───────────────────────────────┐
│              Q              │                                          Answer                                          │           Evidence            │
├─────────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────┼───────────────────────────────┤
│ 1. Can one user have >1     │ No. Exactly one role + at most one customRoleId.                                         │ user.model.ts:105-114         │
│ role?                       │                                                             │                               │
├─────────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────┼───────────────────────────────┤
│ 2. Base + custom role?      │ Yes. Base supplies defaults; cusing baseRole or it is       │ permissions.evaluator.ts:66   │
│                             │ rejected.                                                                                │                               │
├─────────────────────────────┼─────────────────────────────────────────────────────────────┼───────────────────────────────┤
│ 3. Which wins on            │ The custom role wins, and it can subtract.                                               │ evaluator.ts:93, :99-101      │
│ disagreement?               │                                                                                          │                               │
├─────────────────────────────┼─────────────────────────────────────────────────────────────┼───────────────────────────────┤
│ 4. Additive / subtractive / │ Additive by default, subtractive on department mismatch, and replacement-with-empty on   │ evaluator.ts:80-126           │
│  replacement?               │ any validation failure. All three modes exist.                                           │                               │
├─────────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────┼───────────────────────────────┤
│ 5. Can a custom role remove │ Yes, two ways. (a) A department-Ids excludes the user's     │                               │
│  an inherited permission?   │ assigned department ⇒ grants.delete(permission). (b) Any of 7 role-validity failures ⇒   │ evaluator.ts:86-95, :119-126  │
│                             │ effectiveGrants = new Map() — th, including base-role ones. │                               │
├─────────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────┼───────────────────────────────┤
│ 6. Tenant-scoped roles?     │ Yes, always queried {_id, tenantmalizedName).               │ evaluator.ts:60,              │
│                             │                                                                                          │ role.model.ts:141             │
├─────────────────────────────┼─────────────────────────────────────────────────────────────┼───────────────────────────────┤
│ 7. Reusable across tenants? │ No. Cross-tenant provenance is rejected; tenantId is immutable.                          │ evaluator.ts:72-78,           │
│                             │                                                                                          │ role.model.ts:105             │
├─────────────────────────────┼─────────────────────────────────────────────────────────────┼───────────────────────────────┤
│ 8. Role edited after        │ Takes effect on the next request — no cache, no session invalidation needed. version     │                               │
│ assignment?                 │ must increase by exactly 1; query-level updates (updateOne, bulkWrite, insertMany) are   │ role.model.ts:108, :127-139   │
│                             │ hard-blocked by pre-hooks.                                                               │                               │
├─────────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────┼───────────────────────────────┤
│ 9. Is roleVersion used for  │ No. It is reported in decisions/lity only. Nothing          │ permissions.decision.ts:62    │
│ invalidation?               │ invalidates on it.                                                                       │                               │
├─────────────────────────────┼─────────────────────────────────────────────────────────────┼───────────────────────────────┤
│ 10. Permission caching?     │ None.                                                                                    │ evaluator.ts:142-144          │
├─────────────────────────────┼─────────────────────────────────────────────────────────────┼───────────────────────────────┤
│ 11. Cache invalidation?     │ N/A. evict/evictAllForTenant are deliberate no-ops.                                      │ same                          │
├─────────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────┼───────────────────────────────┤
│ 12. Can stale               │                                                             │                               │
│ role/permission cache       │ No. Ruled out.                                                                           │ same                          │
│ explain the intermittency?  │                                                                                          │                               │
└─────────────────────────────┴──────────────────────────────────────────────────────────────────────────────────────────┴───────────────────────────────┘
```


### BASE_ROLE_DEFAULTS — EMPLOYEE (permissions.catalog.ts:158): docuai, chat:read, chat:create, knowledge-gaps:read, feedback:create, feedback:read, notifications:read, notifications:update.
Note EMPLOYEE has no documents:download and no documents:manage-elegable to a custom role).

### Where the DB Role Wins vs. Where the JWT Claim Wins

- DB wins (correct): permissions.evaluator.ts:31, permissions.operation.ts:84-102, permissions.authorization.ts:41.
- JWT claim wins (staleness window until token expiry):
  - authorize.middleware.ts:30 — 7 call sites, all also behind requirePermission, so mitigated.
  - retrieval.controller.ts:43,65-69 — /retrieval/debug.
  - analytics.controller.ts:25 — resolveTenantId decides cross-tenant scope from req.auth.role.

### Duplicate / Inconsistent Authorization Implementations — Flagged

1. requirePermission(...) middleware — DB-backed, scope-aware. C
2. authorizePermission(actor, P, resource) — same evaluator, service-layer. Canonical.
3. authorizePermissionCapability(...) — deliberately allows RESO; the caller must then re-authorize. Correct but easy to misuse.
4. authorize("SUPER_ADMIN") — JWT-claim-only role check.
5. authorizeDocumentAction(..., "manage_access") — hardcoded baseRole === "COMPANY_ADMIN" || "SUPER_ADMIN" bypass that skips both the policy rules and the
capability check (documentAccess.authorization.service.ts:39-45)
6. resolveTenantId in analytics — tenant boundary chosen from request input, gated on a claim.
7. ChatWorkflowService.resolveEffectivePermissions — a second, stricter check that additionally requires resolved.customRoleState === (customRoleId ? "active" : "none") and re-verifies CHAT_CREATE from the permission set rather than via evaluate(), i.e. it ignores scopes (chatWorkflowService.ts:1207-1210, :1526-1542).

That is seven distinct styles. #5, #6 and #7 are the ones I would treat as defects rather than layering.

## 4. Scope / Delegated Scope — Exact Behavior

PermissionScopes (permissions.types.ts:4) has exactly four dimensions, evaluated conjunctively (permissions.scope.ts:61-74):


```text
┌────────────────────────────────┬──────────────────────────────────┬───────────────────────────────────────────────────┬────────────────────────────────┐
│             Scope              │             Includes             │                     Excludes                      │        Compared against        │
├────────────────────────────────┼──────────────────────────────────┼───────────────────────────────────────────────────┼────────────────────────────────┤
│ selfOnly                       │ resources where ownerId ===                             │ resource.ownerId               │
│                                │ actorId                          │                                                   │                                │
├────────────────────────────────┼─────────────────────────────────────────────────────────┼────────────────────────────────┤
│ departmentIds: ObjectId[]      │ resources whose departmentId ∈   │ resources with no department                      │ resource.departmentId          │
│                                │ list                          ⇒ false)                  │                                │
├────────────────────────────────┼──────────────────────────────────┼───────────────────────────────────────────────────┼────────────────────────────────┤
│ documentCategories: string[]   │ canonical normalized category    │ resources with no category                        │ documentCategory (lowercased)  │
│                                │ names                                                   │                                │
├────────────────────────────────┼──────────────────────────────────┼───────────────────────────────────────────────────┼────────────────────────────────┤
│ documentClassifications:       │ canonical normalized             │ resources with no classification                  │ documentClassification         │
│ string[]                       │ classification names             │                                                   │ (lowercased)                   │
└────────────────────────────────┴─────────────────────────────────────────────────────────┴────────────────────────────────┘
```


### Answers to the Required Questions

1. Which resources does each include? See table. Note the asymmehe resource lacks is a deny, not a pass.
2. Which does it exclude? Anything failing any configured dimension, plus anything lacking the dimension entirely.
3. Where is scope evaluated? All of: API request time (requirePe (buildDiscoverPolicyPipeline re-implementsselfOnly/departmentIds/documentCategories/documentClassifications in aggregation), and RAG retrieval time (compileAccessFilters + revalidateAndHydrate). Three separate implementations of the same four scopes.
4. Before or after vector search? Both. Before: compileAccessFil: revalidateAndHydrate re-checks the same three fields againsthydrated chunk documents; selfOnly is enforced only post-hoc via a document-owner query (retrieval.service.ts:213-232).
5. Can an authorized document be excluded by another scope filter? Yes — this is the central defect. resolveAccessContext (app.ts:280-281) reads only the documents:use-in-ai grant scope. A document allowed by the policy is still dropped if that scope's department/category/classification does not match the chunk's stored text metadata.
6. Can scope accidentally become empty? Yes, and it fails closedentNames returns [] if any id fails to resolve — including whenthe department was archived or is missing (roles.taxonomy.ts:296). resolveCategoryScopeValues/resolveClassificationScopeValues behave identically.
compileAccessFilters then emits {$in: []} — matches nothing.
7. Can null/undefined mean "all" in one path and "none" in another? Yes, and the semantics are inconsistent across layers. This is the bug class you asked me
to hunt for:


```text
┌──────────────────────────┬────────────────────────────────────────────┬────────────────────────────────────────────────────┬────────────────────────────┐
│          Value           │            compileAccessFilters    coverPolicyPipeline             │      decidePermission      │
├──────────────────────────┼────────────────────────────────────────────┼────────────────────────────────────────────────────┼────────────────────────────┤
│ scope === null (unscoped │ no restriction                             │ no $match added                                    │ allowed, no resource       │
│  grant)                  │                                            │                                                    │ needed                     │
├──────────────────────────┼────────────────────────────────────────────┼────────────────────────────────────────────────────┼────────────────────────────┤
│ departmentIds: []        │ resolvedDepartmentFilter === undefiriction                         │ hasScopeConstraints false  │
│                          │ no restriction                             │                                                    │ → allowed                  │
├──────────────────────────┼────────────────────────────────────────────────────────────────────┼────────────────────────────┤
│ departmentIds: [id],     │ [] → matches nothing                       │ {departmentId: {$in: [ObjectId(id)]}} → still      │ SCOPE_MISMATCH per         │
│ resolution fails         │                                    t                               │ document                   │
├──────────────────────────┼────────────────────────────────────────────┼────────────────────────────────────────────────────┼────────────────────────────┤
│ grant absent             │ resolveAccessContext → scope = undene returns                      │ PERMISSION_REQUIRED        │
│                          │  NO RESTRICTION AT ALL                     │ [{$match:{_id:{$exists:false}}}] → deny all        │                            │
└──────────────────────────┴────────────────────────────────────────────┴────────────────────────────────────────────────────┴────────────────────────────┘
```


Read that last row carefully. In app.ts:280-281, if the user has no documents:use-in-ai grant, useInAiGrant is undefined, so scope is undefined, so every prefilter dimension is unrestricted. The correct deny still happens — but one layer later, in the per-document authorizeDocumentAction. The prefilter layer's
undefined means "all"; the list layer's equivalent means "none".onsistent because a second gate saves it. That is fragile byconstruction: any future code path that trusts the prefilter alone becomes an over-permissive bug.

## 5. Departments — Exact Behavior

Do not read department as a permission. It is four different things in four places.

Q: 1. User assigned to a department?
Answer: Yes — employeeProfile.departmentId (canonical) with a deprecated employeeProfile.department name fallback.
Evidence: user.model.ts:64-76
────────────────────────────────────────
Q: 2. Document assigned to a department?
Answer: Yes — both departmentId (ObjectId) and department (displ
Evidence: document.model.ts:30,137
────────────────────────────────────────
Q: 3. Does department automatically grant visibility?
Answer: No. Only a policy rule with subject.type === "department
Evidence: evaluator.inMemory.ts:254
────────────────────────────────────────
Q: 4. Can a role carry department scope?
Answer: Yes — grants[].scopes.departmentIds.
Evidence: role.model.ts:32-39
────────────────────────────────────────
Q: 5. Does Manage Access depend on department?
Answer: Only if the admin adds a department rule; a department-s grant additionally constrains which documents an admin may
re-policy.
Evidence: documentPolicyManagement.service.ts:229-232
────────────────────────────────────────
Q: 6. Metadata only?
Answer: No — it is load-bearing in 4 distinct ways (see below).
Evidence: —
────────────────────────────────────────
Q: 7. Used in RAG filters?
Answer: Yes — as a display-name string compared against chunk.department.
Evidence: filterCompiler.ts:93-95
────────────────────────────────────────
Q: 8. Multiple departments per user?
Answer: No. loadActor builds departmentIds but pushes at most on
Evidence: documentAccess.authorization.service.ts:91-100
────────────────────────────────────────
Q: 9. Can a role grant cross-department access?
Answer: Yes if the grant is unscoped. But if the grant is departuser's own department, the permission is deleted entirely.
Evidence: evaluator.ts:86-95
────────────────────────────────────────
Q: 10. HR user explicitly granted an IT document — which wins?
Answer: The explicit grant wins at the policy layer, and then may still lose at the retrieval layer. subjectMatches for user compares only subject.id ===
actor.actorId — department is irrelevant, and read/discover will work. But if the HR user's documents:use-in-ai grant is department-scoped to HR,
resolveAccessContext emits department: {$in:["HR"]} and the IT document's chunks (department: "IT") are excluded before authorization is ever consulted. The
document is readable and downloadable but invisible to the assis
Evidence: evaluator.inMemory.ts:249-250 vs app.ts:288-293 + filterCompiler.ts:93

### The Four Roles Department Plays
1. Policy subject — subject.type: "department" rules (ObjectId,
2. Permission scope — grants[].scopes.departmentIds (ObjectId, exact) — and a mismatch subtracts the permission.
3. List scope — {departmentId: {$in: [ObjectId…]}} (ObjectId, exact).
4. RAG prefilter — {department: {$in: ["Display Name"…]}} (text,ata).

#3 and #4 are the same logical scope compared through two different key spaces. That is the structural reason list and RAG disagree.

## 6. Manage Access — Exact Behavior and Persistence Model

### Feature Trace


```text
┌───────────────┬────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│     Layer     │                                                                Location                                                                 │
├───────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Frontend      │ app/src/components/documents/PolicyEditor.tsx,editor.ts                                                    │
├───────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│               │ documents.routes.ts:318-327 — GET/POST                                                                                                  │
│ Endpoints     │ /documents/:id/access-policy{,/history,/previessignments,/propagation-status}, /policy-editor/options, +   │
│               │ /access-policy/batch/{preview,apply}                                                                                                    │
├───────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Guard         │ requirePolicyManagement = requirePermission(DOwScoped: true, resourceType: "Document" }) —                 │
│               │ documents.routes.ts:41                                                                                                                  │
├───────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Validation    │ documentPolicyManagement.draft.ts — strict allowlist; rejects authoritative fields; ≤200 rules; dedupes rule ids and semantic           │
│               │ duplicates                                                                                                 │
├───────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Service       │ documentPolicyManagement.service.ts (managedState, validateDraft, impact, preview, apply, batchApply)                                   │
├───────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Persistence   │ documentPolicyManagement.persistence.ts — applyManagedPolicy                                                                            │
├───────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Models        │ documentAccessPolicy.model.ts, documentPolicyGeneration.model.ts, documentPolicyPropagationOutbox.model.ts,                             │
│               │ documentPolicyIdempotency.model.ts                                                                         │
├───────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Retrieval     │ live snapshot read per authorization call — doy.mongo.ts                                                   │
│ integration   │                                                                                                                                         │
└───────────────┴────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```


What is actually persisted when an admin grants access — one atoyManagedPolicy, lines 42-90):

1. documents — updateOne guarded on (activePolicyId, activePolicyVersion) (optimistic lock; mismatch ⇒ version_conflict), setting the new policy pointer and
overwriting the document taxonomy: classificationId, classificatgory (name), departmentId, department (name), policyChangedAt.
2. documentaccesspolicies — a new immutable snapshot (policyVersion + 1). Snapshots are append-only: pre("save") throws DOCUMENT_POLICY_SNAPSHOT_IMMUTABLE on any re-save, and every query-level mutation operator is blocked.
3. documentpolicyidempotencies — 24 h TTL record keyed (tenantIdy_apply", key) + requestFingerprint.
4. documentpolicygenerations — desired pointer, status: broadening ? "pending" : "stale", metadataUpdateRequired: true.
5. documentpolicypropagationoutboxes — one pending event (drives chunk/embedding metadata refresh).
6. auditlogs — DOCUMENT_POLICY_PROPAGATION_REQUESTED.

### Rule Shape (`documentAccessPolicy.model.ts:30-50`)
```typescript
{ ruleId: string, effect: "allow"|"deny",
  subject: { type: "user"|"custom_role"|"department"|"owner"|"tenant_member", id?: string },
  actions: DOCUMENT_ACCESS_ACTIONS[] }
```
subject.id is a hex string, not an ObjectId — matching buildDiscoverPolicyPipeline, which compares it to actor.actorId / actor.departmentIds as strings.
Consistent. Referential integrity is validated at write time aga(excluding SUPER_ADMIN), Role (migrationState: "complete"), andDepartment (validateDraft, lines 283-288).

Answers


```text
┌─────┬───────────────────────────────────┬───────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│  #  │             Question              │                                                    Answer                                                     │
├─────┼───────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 1   │ Who may use Manage Access?        │ Anyone holding documing the per-document manage_access check unless exempt       │
│     │                                   │ (below).                                                                                                      │
├─────┼───────────────────────────────────┼──────────────────────────────────────────────────────────────────────────────────┤
│     │ Is COMPANY_ADMIN automatically    │ Yes, unconditionally for manage_access. documentAccess.authorization.service.ts:39-45 returns early for       │
│ 2   │ allowed?                          │ SUPER_ADMIN/COMPANY_s and the capability gate.                                   │
│     │                                   │ delegatedPolicyApprovalRequired(user.role) skips the check for them entirely.                                 │
├─────┼───────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 3   │ Which permission controls it?     │ Permission.DOCUMENTSanage-access". Delegable; compatibleScopes: ALL_SCOPES.      │
├─────┼───────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 4   │ Can an employee with it use       │ Yes, but they need a policy rule granting them manage_access on the document (no bypass), plus their own      │
│     │ Manage Access?                    │ scope must match.                                                                                             │
├─────┼───────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 5   │ Grant to users / roles /          │ All four. user, custember (= everyone in the tenant), plus owner.                │
│     │ departments / everyone?           │                                                                                                               │
├─────┼───────────────────────────────────┼──────────────────────────────────────────────────────────────────────────────────┤
│ 6   │ Deny-by-default or                │ Deny by default. No matching allow ⇒ NO_MATCHING_GRANT. Any matching deny wins over any allow, including over │
│     │ allow-by-default?                 │  an inherited allow.ge the outcome.                                              │
├─────┼───────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 7   │ What if no Manage Access records  │ !activePolicyId ⇒ POLICY_MISSING ⇒ denied for everyone (except the admin manage_access bypass). Upload always │
│     │ exist?                            │  creates a default pr pre-policy legacy rows — hence document-policy-backfill.*. │
├─────┼───────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 8   │ Is the owner automatically        │ Only via the default owner rule created at upload — which is a real, editable rule, not a bypass. It can be   │
│     │ allowed?                          │ narrowed; the UI/APIad, download survive.                                        │
├─────┼───────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 9   │ Is the uploader automatically     │ Only if owner === uploader. The default policy's subject is owner; uploadedBy grants nothing.                 │
│     │ allowed?                          │                                                                                  │
├─────┼───────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 10  │ Are company admins allowed on all │ No. Only manage_access. A COMPANY_ADMIN who did not upload a document cannot read, download, or RAG it until  │
│     │  documents?                       │ a rule grants it.                                                                │
├─────┼───────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 11  │ SUPER_ADMIN: contents or platform │ Platform operations latform tenant, so loadDocument({_id, tenantId}) never finds │
│     │  ops only?                        │  a customer document. resolve() returns empty outside the platform tenant.                                    │
├─────┼───────────────────────────────────┼──────────────────────────────────────────────────────────────────────────────────┤
│ 12  │ Does a role's chat permission     │ No. chat:create and documents:use-in-ai are unrelated.                                                        │
│     │ grant document access?            │                                                                                  │
├─────┼───────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 13  │ Does document-read grant access   │ No. It is a capability; the per-document policy decides.                                                      │
│     │ to ALL documents?                 │                                                                                  │
├─────┼───────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│     │ If Manage Access explicitly       │ YES — four of them. (a) the role classification prefilter, (b) the use-in-ai grant scope translated to stale  │
│ 14  │ grants a document, can another    │ chunk text, (c) buildRetrievableDocumentFilter (searchStatus ∈ {FAILED,STALE}, archived, wrong status), (d)   │
│     │ filter still remove it?           │ the evidence/citation gates. This is the primary answer to your central question.                             │
├─────┼───────────────────────────────────┼──────────────────────────────────────────────────────────────────────────────────┤
│ 15  │ If a grant is removed, how fast   │ Immediately — next turn. Authorization reads the live snapshot; retrieval.authorization.test.ts:83-89 asserts │
│     │ does RAG stop seeing it?          │  this. Content is reper turn.                                                    │
├─────┼───────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 16  │ Are caches invalidated on change? │ No caches exist for only stale artifact is chunk/embedding taxonomy metadata,    │
│     │                                   │ refreshed asynchronously via the outbox — see F-14.                                                           │
└─────┴───────────────────────────────────┴───────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```


## 7. Effective Document Access Formula (UI vs API vs Download vs RAG)

Common predicate:

```text
POLICY_OK(U, D, action) =
      sameTenant(U, D)
  AND U.status == "active"
  AND resolve(U).customRoleState ∈ {none, active}
  AND D.deletedAt == null
  AND D.activePolicyId != null AND D.activePolicyVersion != null
  AND snapshot(D.activePolicyId, D.activePolicyVersion) exists
  AND snapshot.indexMetadata.{categoryId,departmentId,classificaOLICY_CONTEXT
  AND snapshot.status == "active"
  AND snapshot.effectiveFrom <= now < (snapshot.effectiveUntil ?? ∞)
  AND (snapshot.inherits == null OR parentSnapshot is valid AND active AND in-window)
  AND hasPermission(U, DOCUMENT_ACTION_PERMISSION_MAP[action], resourceCtx(D))   -- capability, scope-checked
  AND ∃ rule ∈ (snapshot.rules ∪ parent.rules) : action ∈ rule.a
                                              AND subjectMatches(rule, U, D)
                                              AND rule.effect ==
  AND ∄ rule (same filters) with effect == "deny"
```

A. Shown in the UI document list

```text
canList(U, D) =
      D.tenantId == U.tenantId  AND  D.isArchived == false  (unless explicitly requested)
  AND grant := resolve(U).grants["documents:read"]  exists          -- else deny-all pipeline
  AND scopeMatch(grant.scope):
        selfOnly                  → D.owner == U.id
        departmentIds             → D.departmentId ∈ ids
        documentCategories        → canonical category name ∈ names
        documentClassifications   → canonical classification ∈ n
  AND POLICY_OK(U, D, "discover")
```

B. Direct document API read — GET /documents/:id

```text
canReadApi(U, D) = hasPermission(U, "documents:read", resourceCtcument
                 AND POLICY_OK(U, D, "read")
```
(SCOPE_MISMATCH is deliberately rewritten to 404 — good, no existence oracle.)

C. Download — GET /documents/:id/download

```text
canDownload(U, D) = hasPermission(U, "documents:download", resourceCtx(D))
                  AND POLICY_OK(U, D, "download")
```
read does not imply download (asserted by the evaluator contract). EMPLOYEE lacks documents:download by default.

D. Chat / RAG retrieval — the divergent one

```text
canRagUse(U, D, chunk) =
      POLICY_OK(U, D, "use_in_ai")                                     -- ×5 per turn
  AND D.status ∈ {uploading,uploaded,processing,processed,reprocessing} -- ★ not in A/B/C
  AND D.searchStatus ∉ {FAILED, STALE}                                 -- ★ not in A/B/C
  AND D.isArchived == false AND D.deletedAt == null
  AND chunk.status ∈ {EMBEDDED, INDEXED, ACTIVE}                       -- ★ not in A/B/C
  AND chunk.classification ∈ DEFAULT_ROLE_CLASSIFICATIONS[U.baseNLY
        SUPER_ADMIN   → unrestricted
        COMPANY_ADMIN → {public, internal, confidential}
        EMPLOYEE      → {public, internal}
      (overridden by resolvedClassificationFilter iff the use-in-ai grant is classification-scoped)
  AND chunk.department ∈ resolvedDepartmentFilter               ctId
        (from the use-in-ai grant scope ONLY; [] on any resolution failure)
  AND chunk.category   ∈ resolvedCategoryFilter                        -- ★★ TEXT vs A's canonical name
  AND (selfOnly → D.owner == U.id)
  AND embedding row exists in `chunkembeddings` with matching metadata -- ★ indexing must have run
  AND vector/keyword similarity put the chunk in the top-K (K =
  AND evidenceBundle.sufficiency == "SUFFICIENT"                       -- ★★ NOT AUTHORIZATION
  AND item.scoreBreakdown.totalScore >= 0.25
  AND citationVerification.verified AND validatedCitationIds ⊇ {chunk}  -- ★★ LLM judgement
```

### Comparison — FLAGGED HIGH SEVERITY


```text
┌──────────────────────────────────────┬─────────────────────┬─────────────────────┬─────────────────────────┬──────────────────────────────────────────┐
│                 Gate                 │       A: List       │     B: API read     │       C: Download       │                  D: RAG                  │
├──────────────────────────────────────┼─────────────────────┼──────────────────┼──────────────────────────────────────────┤
│ Policy action required               │      discover       │        read         │        download         │                use_in_ai                 │
├──────────────────────────────────────┼─────────────────────┼─────────────────────┼─────────────────────────┼──────────────────────────────────────────┤
│ Capability permission                │   documents:read    │  nts:download    │           documents:use-in-ai            │
├──────────────────────────────────────┼─────────────────────┼─────────────────────┼─────────────────────────┼──────────────────────────────────────────┤
│ Scope source                         │   documents:read    │   documents:read    │   documents:download    │      documents:use-in-ai grant only      │
│                                      │        grant        │   grant          │                                          │
├──────────────────────────────────────┼─────────────────────┼─────────────────────┼─────────────────────────┼──────────────────────────────────────────┤
│ Department compared as               │      ObjectId       │      ObjectId       │        ObjectId         │    display-name text on frozen chunks    │
├──────────────────────────────────────┼─────────────────────┼──────────────────┼──────────────────────────────────────────┤
│ Category compared as                 │   canonical name    │   canonical name    │     canonical name      │   display + normalized text on frozen    │
│                                      │                     │                     │                         │                  chunks                  │
├──────────────────────────────────────┼─────────────────────┼──────────────────┼──────────────────────────────────────────┤
│ Role classification ceiling          │          ✗          │          ✗          │            ✗            │    ✓ (hard, ignores explicit grants)     │
├──────────────────────────────────────┼─────────────────────┼──────────────────┼──────────────────────────────────────────┤
│ searchStatus gate                    │          ✗          │          ✗          │            ✗            │                    ✓                     │
├──────────────────────────────────────┼─────────────────────┼─────────────────────┼─────────────────────────┼──────────────────────────────────────────┤
│ Chunk-status gate                    │          ✗          │     ✗            │                    ✓                     │
├──────────────────────────────────────┼─────────────────────┼─────────────────────┼─────────────────────────┼──────────────────────────────────────────┤
│ Similarity / evidence / citation     │          ✗          │          ✗          │            ✗            │                   ✓✓✓                    │
│ gates                                │                     │                     │                         │                                          │
└──────────────────────────────────────┴─────────────────────┴──────────────────┴──────────────────────────────────────────┘
```


Nine asymmetries. Four of them (action, scope source, key space,authorization differences that should be identical and are not.This table is, in my view, the answer to your primary audit question — and the reason your symptom is intermittent rather than deterministic.

## 8. RAG Authorization / Retrieval Flow — End-to-End Trace

POST /chat/send/stream (UI primary) / POST /chat/send (fallback):

```text
1  authenticate → tenantScoping
2  requireSelfPermission(CHAT_CREATE)     [stream]   resource {tenantId, ownerId: userId}
   requirePermission(CHAT_CREATE)         [non-stream]  ← NO resource  (F-16)
3  queryGuard — entitlement queriesPerMonth, fail-closed
4  chat.controller.sendMessageStream → operationContext(req) → ChatService → ChatWorkflowService.execute
5  authorizeTenantOperation(ctx, CHAT_CREATE)   -- re-reads Usernant
6  loadPersistedActor → status must be "active"
7  resolveEffectivePermissions → customRoleState must exactly ma chat:create
8  tokenQuota.reserve(50 000)  → release if < 1 000 available
9  resolveConversation — conversationId must exist AND conversat404
10 addMessage(user)              ← persisted BEFORE the workflow runs
11 loadSettings(tenantId) → { citationsEnabled, maxTokens }   (failure ⇒ safe defaults)
12 createRun → SupervisorRuntime.execute with deterministic hook
     resolveDecisionBeforeModel overrides the supervisor LLM — the state machine is code, not model
13 → intent-query-agent
14 → resolve_document_titles (only if referencedDocumentTitles ≠
15 → authorized_hybrid_search
16 → evaluate_evidence
17 → answer-writer-agent
18 → citation-verification-agent
19 → compliance-agent → release | refuse | clarify
20 validateTerminal → materializeSources → authorizeDocumentActiMessage(assistant)
```

Intent stage (intentQuery.service.ts) — ordered short-circuits before any model call:
hasUnsafeKeywords → unsafe; assistant-only → assistant; social →ent → unsupported; then conversation history (≤10 msgs, ≤8 000chars, ownership-checked); then loadTenantDocumentManifest (≤150 docs, each individually use_in_ai-authorized); then the LLM; then ~10 deterministic post-overrides.


```json
compileAccessFilters(context) → AdapterFilter:
{ tenantId: "<from JWT>",
  classification: { $in: ["public","internal"] },        // EMPLOYEE default
  department:     { $in: ["Human Resources"] },          // only if use-in-ai scope has departmentIds
  category:       { $in: ["Finance","finance"] } }       // only if use-in-ai scope has documentCategories
merged with query filters (intersect only — cannot broaden), then:

Atlas vector (atlasVectorStoreAdapter.ts, collection chunkembeddings, index vidx_chunk_embeddings_v1):
{ $vectorSearch: { index:"vidx_chunk_embeddings_v1", path:"vector", queryVector,
    numCandidates: topK*10, limit: topK,
    filter: { tenantId: ObjectId(...), classification:{$in:[...]},
              department:{$in:[...]}, category:{$in:[...]},
              documentId:{$in:[...]}  /* only if documentIds pre
Atlas keyword (atlasKeywordSearchAdapter.ts, collection documentchunks, index kidx_chunk_text_v1):
{ $search: { index:"kidx_chunk_text_v1", compound: {
    must:  [{ text: { query: queryText, path: "text" } }],
    filter:[{ in:   { path:"tenantId",   value:[ObjectId(...)] } },
            { in:   { path:"documentId", value:[...] } },      // conditional
            { text: { path:"classification", query:["public","innot exact
            { text: { path:"department",     query:[...] } },
            { text: { path:"category",       query:[...] } }] }
Note the keyword path uses text clauses on analyzed fields, so "confidential" can token-match highly_confidential. That over-match is caught downstream by the exact includes() re-check in revalidateAndHydrate — so it is not a leak, but the two adapters do not implement the same predicate.

### Every Place a Document Can Be Filtered Out — Complete Enumeration (18)


```text
┌─────┬──────────────────────────────────────────────────────────────────────┬───────────────────────────────────────────────────────────────────────┐
│  #  │                               Location                               │                                 Gate                                  │
├─────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 1   │ intentQuery.service.ts:89-111                                        │ manifest excludes unauthorized docs (affects routing only)            │
├─────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 2   │ intentQuery.documentHints.ts:406-420                                 │ title/id hints dropped unless use_in_ai-authorized                    │
├─────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 3   │ chatWorkflowService.ts:1012-1015                                     │ documentIds pins search to referenced docs                            │
├─────┼──────────────────────────────────────────────────────────────────────┼───────────────────────────────────────────────────────────────────────┤
│ 4   │ filterCompiler.ts:78                                    ation ceiling                                           │
├─────┼──────────────────────────────────────────────────────────────────────┼───────────────────────────────────────────────────────────────────────┤
│ 5   │ filterCompiler.ts:93                                                 │ department text prefilter                                             │
├─────┼──────────────────────────────────────────────────────────────────────┼───────────────────────────────────────────────────────────────────────┤
│ 6   │ filterCompiler.ts:107-114                               prefilter (defensive {$in: []})                         │
├─────┼──────────────────────────────────────────────────────────────────────┼───────────────────────────────────────────────────────────────────────┤
│ 7   │ Atlas prefilter                                                                                                 │
├─────┼──────────────────────────────────────────────────────────────────────┼───────────────────────────────────────────────────────────────────────┤
│ 8   │ Atlas                                                   ty cut (K = 5 / 12)                                     │
├─────┼──────────────────────────────────────────────────────────────────────┼───────────────────────────────────────────────────────────────────────┤
│ 9   │ retrieval.service.ts:782 authorizeCandidateIds          se_in_ai                                                │
├─────┼──────────────────────────────────────────────────────────────────────┼───────────────────────────────────────────────────────────────────────┤
│ 10  │ retrieval.service.ts:188                                             │ tenant-scoped chunk hydration (drops cross-tenant ids)                │
├─────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 11  │ retrieval.service.ts:242                                             │ buildRetrievableDocumentFilter (status/searchStatus/archived/deleted) │
├─────┼──────────────────────────────────────────────────────────────────────┼───────────────────────────────────────────────────────────────────────┤
│ 12  │ retrieval.service.ts:245-269                                         │ exact re-check of classification/department/category                  │
├─────┼──────────────────────────────────────────────────────────────────────┼───────────────────────────────────────────────────────────────────────┤
│ 13  │ retrieval.service.ts:272-277                            ship                                                    │
├─────┼──────────────────────────────────────────────────────────────────────┼───────────────────────────────────────────────────────────────────────┤
│ 14  │ retrieval.service.ts:815 reauthorizeFinalCandidates     n                                                       │
├─────┼──────────────────────────────────────────────────────────────────────┼───────────────────────────────────────────────────────────────────────┤
│ 15  │ authorizedRetrievalTools.ts:582-591                     cumentIds                                               │
├─────┼──────────────────────────────────────────────────────────────────────┼───────────────────────────────────────────────────────────────────────┤
│ 16  │ authorizedRetrievalTools.ts:689-726                                  │ chunk status + eligibility + use_in_ai again                          │
├─────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 17  │ authorizedRetrievalTools.ts:761-784                                  │ reranker sufficiency + per-item ≥ 0.25                                │
├─────┼──────────────────────────────────────────────────────────────────────┼───────────────────────────────────────────────────────────────────────┤
│ 18  │ citationVerificationAgent.ts:260-301 + compliance.service.ts:149-164 │ re-auth + semantic verification                                       │
└─────┴─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```


Gates 9, 14, 16, 18, and materializeSources mean use_in_ai is evRevocation is genuinely immediate. Availability, correspondingly, is fragile.

## 9. Why Authorized Users Receive "I Don't Know"

Ranked by likelihood, with the exact user-visible string each produces (chatWorkflowService.ts:99-140):

1. Evidence gate — CONFLICTING (CONFIRMED, reproduced).
Any two retrieved chunks stating different numbers for the same recognized metric ⇒ sufficiency = "CONFLICTING" ⇒ approvedEvidenceIds = [] ⇒ INSUFFICIENT_EVIDENCE. Reproduced by executing the real modules:
'numeric 2 vs 3 days, remote_work' -> ['… incompatible values for subject/metric: remote_work']
'numeric leave 21 vs 30'           -> ['… incompatible values foe']
'negation, generic topic'          -> ['… opposing assertions for subject/metric: aligned topic']
Tiered policies (leave by grade, hotel limits by city, SLA by prWorse: assessSufficiency(evidenceItems, conflictGroups) usesconflict groups computed over all pre-dedup candidates, so a conflict between two chunks that never reach the bundle still kills it. User sees "I couldn't
find any information regarding your query in the available compa

2. Policy grants read but not use_in_ai (CONFIRMED).
migrate-policy-use-in-ai.service.ts:96-99 states it outright: "Oss does not cover use_in_ai, so every allow rule that grants read without use_in_ai silently blocks RAG for its subjects." The migration is manual (npm run migrate:policy:use-in-ai:apply). OWNER_MINIMUM_ACTIONS = ["discover","read","download"] — use_in_ai is not protected, so it can be unchecked in the editor.

3. Role classification ceiling (CONFIRMED). EMPLOYEE + confidential document + explicit use_in_ai grant = zero candidates, always.

4. Department-scoped use-in-ai grant (CONFIRMED). Either the permission is deleted outright (evaluator.ts:93) or the text prefilter excludes evedocuments:read stays intact ⇒ list works, RAG blind.
                                                                                                                                                5. Citation semantic verification bounds (CONFIRMED). MAX_SEMANTCLAIM_LENGTH = 500. Segments split on newlines, so bullet listscount individually. A summary (SUMMARY_MAX_TOKENS = 2048, topK = 12) reliably exceeds 20 ⇒ VERIFICATION_BOUNDS_EXCEEDED ⇒ refusal and a false knowledge-gap record.                                                                                                                                         
6. Trusted-candidate-catalog miss (CONFIRMED, reproduced). If scoreBreakdown is lost, retrievalRelevance falls back to chunk.confidenceScore ?? 0 (null for worker-inserted chunks) and totalScore is capped at 0.084 + 0.18·exact ≤ 0.264 < 0.5. SUFFICIENT becomes unreachable. Reproduced:               A relevanceScore-present                  = SUFFICIENT
B catalog-miss (score=0, no breakdown)    = WEAK  [0.238, 0.11, 0.11]
C RRF-only (no relevanceScore)            = WEAK  [0.261, 0.121, 0.121]                                                                         Also: evaluate_evidence deletes the catalog entry on read, so anranteed WEAK.

7. Single-shot retrieval, topK = 5 (CONFIRMED). resolveDecision searches once (!artifacts.activeSearchBatch); zero candidates ⇒ straight to compbroadening, no reformulation, no second attempt.

8. Intent routing (CONFIRMED). /unsafe|hack|ignore\s+previous|system\s+prompt/i is a substring match — "hackathon policy" is refused as unsafe. isLikelyExternalCurrent blocks latest + news|prices|gold|dollar|nt keyword appears. (Also: دollar at line 431 is a typo for).رالود

9. Stale chunk taxonomy (CONFIRMED). Chunk department/category/classification are frozen at chunking time (documentChunkingJob.ts:137-139) and refreshed only
via the outbox. Department/category renames trigger no propagatiervice.ts:176 — classification level only).

10. searchStatus window (CONFIRMED). STALE/FAILED are excluded from RAG but not from the list. A reprocess sets READY → STALE → INDEXING, so a re-indexing
document is listed, readable, and invisible to the assistant.

11. Follow-ups (CONFIRMED). See §14.

## 10. Allowed-Document-ID Resolution


```text
┌─────────────────────────────────────────────────┬──────────────────────────────────────────────────────────────────────────┐
│                        Q                        │                                                Answer                                                 │
├─────────────────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                 │ No — not forntAccess.filters.ts: createDocumentRetrievalAccessFilter,    │
│ 1. Is an allowedDocumentIds list generated?     │ allowedDocumentIds, mode: "deny_all"|"constrained", failClosed: true) but nothing in the retrieval    │
│                                                 │ path calls them. They are referenced only by documentAccess.filters.test.ts. RAG uses                 │
│                                                 │ filter-then-authorize-per-document.                                                                   │
├─────────────────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 2. Which service generates it?                  │ For the UI lbuildDiscoverPolicyPipeline (an aggregation, not a list).    │
│                                                 │ For RAG: none.                                                                                        │
├─────────────────────────────────────────────────┼──────────────────────────────────────────────────────────────────────────┤
│ 3. Does it consider                             │ Per-document authorizeDocumentAction considers all of them. The prefilter considers only tenant +     │
│ tenant/role/permission/grants/Manage            │ classificatiexplicit documentIds.                                        │
│ Access/departments/ownership/status?            │                                                                                                       │
├─────────────────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 4. Empty list?                                  │ N/A (no listEARCH_RESULTS ⇒ refusal.                                     │
├─────────────────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 5. Undefined?                                   │ N/A.                                                                                                  │
├─────────────────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 6. Does undefined mean all or none?             │ Both, depending on layer — see §4 Q7. scope === undefined ⇒ prefilter unrestricted; missing           │
│                                                 │ documents:re                                                             │
├─────────────────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 7. Can an empty list be omitted, broadening     │ Not currentlent gate catches it. But the prefilter's undefined ⇒         │
│ access?                                         │ unrestricted semantics mean the only thing preventing over-permissive retrieval is the second gate.   │
│                                                 │ DESIGN-RISK.                                                             │
├─────────────────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 8. Can an empty list cause "no evidence" for    │ Yes — {$in: []} from resolveDepartmentNames/resolveCategoryScopeValues on any resolution failure.     │
│ authorized users?                               │                                                                          │
├─────────────────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 9. Max IDs / truncation?                        │ documentIds ≤ 20 (boundedIdArraySchema(20)); titles ≤ 20; manifest capped at 150 (silently — no log   │
│                                                 │ of what was dropped); MAX_CONFLICT_ITEMS = 50; fusion maxCandidates = 50; reranker maxItems = 10.     │
├─────────────────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 10. Pagination involved?                        │ Not in RAG. t:-1}).limit(150) — tenants with >150 documents get a        │
│                                                 │ partial manifest, degrading routing for older documents.                                              │
├─────────────────────────────────────────────────┼──────────────────────────────────────────────────────────────────────────┤
│ 11. Cached?                                     │ Only trustedCandidateCatalog — request-private, ≤1 000 entries, FIFO-evicted, deleted on read.        │
├─────────────────────────────────────────────────┼──────────────────────────────────────────────────────────────────────────┤
│ 12. Can cache keys omit                         │ catalogKey = context.runId ?? context.traceId. It omits tenantId and userId. Not exploitable today    │
│ tenantId/userId/roleVersion/access revision?    │ (values are hydrated tenant-scoped and re-authorized), but a traceId collision across concurrent      │
│                                                 │ requests woues. DESIGN-RISK.                                             │
└─────────────────────────────────────────────────┴───────────────────────────────────────────────────────────────────────────────────────────────────────┘
```


## 11. Vector / Embedding Metadata

chunkembeddings (chunkEmbedding.model.ts) stores: chunkId, generationId, tenantId, documentId, provider, modelName, modelVersion, dimensions, vector,
embeddingChecksum, department, category, classification, accessPntType, tokenUsage, costUsd.
documentchunks additionally stores allowAiUse, status, accessPolicyVersion, documentVersionId, confidenceScore, plus an accessMetadata sub-document written by
propagation.


```text
┌────────────────────────────────────────┬────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                   Q                    │                        Answer                                                     │
├────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 1. Is authorization metadata copied    │ Partially. The three scope dimensions are copied from the chunk (documentEmbeddingJob.ts:208-210), themselves  │
│ into embeddings?                       │ copied from the chunking payload. accessPolicyVersion is written as null and never used. Subject/action rules  │
│                                        │ are never copied — good.                                                                                       │
├────────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────┤
│ 2. Does vector metadata go stale after │ Yes for taxonomy. applyManagedPolicy overwrites document taxonomy synchronously; chunks/embeddings are updated │
│  a Manage Access change?               │  only when the propag                                                             │
├────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 3. Live Mongo or embedding metadata?   │ Both. Subject/action . Sensitivity/department/category filtering = embedding      │
│                                        │ metadata.                                                                                                      │
├────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 4. Re-index required on                │ Metadata refresh, yes{department, category, classification} on documentchunks and │
│ department/access change?              │  chunkembeddings for the active generation. Full re-index only when generation.reindexRequired.                │
├────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 5. Could stale metadata cause "allowed │ Yes — confirmed. Reclassify confidential → internal: the document is now internal and the policy allows the    │
│  in Mongo but excluded by retrieval"?  │ employee, but chunks e EMPLOYEE prefilter is {$in:["public","internal"]} ⇒ zero   │
│                                        │ candidates until propagation.                                                                                  │
├────────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────┤
│ 6. The opposite — revoked in Mongo but │ Yes for sensitivity, no for subject grants. Reclassify internal → confidential: chunks still say internal, so  │
│  still retrievable?                    │ an EMPLOYEE with an eretrieving it. Subject revocation is immediate. SECURITY —   │
│                                        │ see F-14.                                                                                                      │
└────────────────────────────────────────┴────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```


### Additional Integrity Problems Found

- Enum mismatch. document.classification allows 5 values (…, restricted, highly_confidential); documentChunk.classification allows 4 (no highly_confidential). A highly_confidential document cannot carry a faithful chunk classification.
- Production embedding block. CLASSIFICATIONS_BLOCKED_FROM_EXTERrestricted} (documentEmbeddingJob.ts:21-24). top_secret is not avalid value anywhere; restricted documents fail embedding permanently (searchStatus: "FAILED", PermanentJobError) — so restricted documents can never be
RAG-usable by anyone, including SUPER_ADMIN.
- Mongoose defaults bypassed. The worker inserts chunks with the raw driver (db.collection("documentchunks").insertMany), so allowAiUse and documentVersionId
are absent, not defaulted. Benign today (allowAiUse is documenteentVersionId degrades to ""), but it silently weakens citationanchors.

## 12. Retrieval Thresholds vs Authorization

(A) Authorized but not retrievable — classification ceiling; department/category text mismatch; {$in: []}; searchStatus; chunk status; missing embedding row; topK = 5; numCandidates = topK*10 = 50.

(B) Retrieved but rejected by evidence logic — this is where most refusals originate:


```text
┌────────────────────────────────┬───────────────────────────────┬───────────────────────────────────────────────┐
│              Knob              │             Value                                │
├────────────────────────────────┼───────────────────────────────┼───────────────────────────────────────────────┤
│ topK direct / summary          │ 5 / 12                        │ chatWorkflowService.ts:86-87                  │
├────────────────────────────────┼──────────────────────────────────────────────────┤
│ RRF k                          │ 60                            │ fusionEngine.ts:17                            │
├────────────────────────────────┼───────────────────────────────┼───────────────────────────────────────────────┤
│ maxCandidates                  │ 50                            │ fusionEngine.ts:19                            │
├────────────────────────────────┼───────────────────────────────┼───────────────────────────────────────────────┤
│ minScore                       │ undefined (no floor)                             │
├────────────────────────────────┼───────────────────────────────┼───────────────────────────────────────────────┤
│ reranker maxItems              │ 10                                               │
├────────────────────────────────┼───────────────────────────────┼───────────────────────────────────────────────┤
│ maxTokenBudget / reserved      │ 4000 / 500 ⇒ 3500 usable     dget.ts             │
├────────────────────────────────┼───────────────────────────────┼───────────────────────────────────────────────┤
│ dedup Jaccard                  │ 0.85 declared / 0.6 effectiveiversity.ts:22      │
├────────────────────────────────┼───────────────────────────────┼───────────────────────────────────────────────┤
│ MMR λ                          │ 0.7                           │ diversity.ts:21                               │
├────────────────────────────────┼──────────────────────────────────────────────────┤
│ SUFFICIENT requires            │ avg totalScore ≥ 0.5          │ fakeReranker.adapter.ts:290                   │
├────────────────────────────────┼───────────────────────────────┼───────────────────────────────────────────────┤
│ Per-item floor                 │ ≥ 0.25                                           │
├────────────────────────────────┼───────────────────────────────┼───────────────────────────────────────────────┤
│ conflict topic similarity      │ 0.3                                              │
├────────────────────────────────┼───────────────────────────────┼───────────────────────────────────────────────┤
│ MAX_SEMANTIC_CLAIMS / length   │ 20 / 500 chars               on.service.ts:11-13 │
├────────────────────────────────┼───────────────────────────────┼───────────────────────────────────────────────┤
│ verifier temperature / retries │ 0 / 1                         │ :480, :14                                     │
├────────────────────────────────┼──────────────────────────────────────────────────┤
│ fuzzy title match / gap / scan │ 0.62 / 0.08 / 500             │ intentQuery.documentHints.ts:246-248          │
└────────────────────────────────┴───────────────────────────────┴───────────────────────────────────────────────┘
```


totalScore = fusionScore·0.4 + rerankScore·0.6, where rerankScore = semantic·0.5 + exact·0.3 + authority·0.1 + version·0.1 and semantic = fusionScore = relevanceScore ?? fusionScore ?? score.

Two structural notes. (i) normalizeProviderScore = min(1, score) — correct for Atlas cosine vectorSearchScore ∈ [0,1], but Lucene BM25 searchScore is          unbounded, so every keyword-only hit is clamped to relevance 1.0eal vector matches. (ii) computeSourceAuthority scores public:0.8 > internal: 0.6 > confidential: 0.5 > restricted: 0.4 — the reranker prefers less sensitive documents, which is backwards for policy Q&A where the         authoritative text is usually the more restricted one.

(C) Retrieved and sufficient, but the answer is refused — compliance.service.ts requires citationVerification.verified === true && validatedCitationIds.length > 0; otherwise UNVERIFIED_GROUNDED_RESPONSE. finalSupported requss to mark every recomposed claim SUPPORTED.

The report's required distinction, stated plainly:
- ACCESS FAILURE → F-01…F-08, F-13, F-14. retrievalOutcome = "AUTHORIZATION_FILTERED" or authorizationRestricted = true. Correct message exists (FALLBACK_AUTHORIZATION_RESTRICTED) but only fires when the flag survives.
- RETRIEVAL FAILURE → zeroCandidateReason ∈ {NO_RAW_SEARCH_RESULYDRATED_CANDIDATES}.
- ANSWER/ROUTING FAILURE → F-09…F-12, F-17. EVIDENCE_WEAK, EVIDENCE_CONFLICTING, UNVERIFIED_GROUNDED_RESPONSE, UNSUPPORTED_REQUEST, CLARIFICATION_REQUIRED.

All three collapse to the same two user strings, and only the third is distinguishable in logs — and only via the reranker's line.

## 13. Intent / Routing Failures

route ∈ {assistant, social, rag, clarification, unsupported, unsafe}; only rag retrieves.

### Ways a Legitimate Knowledge Question Avoids RAG

1. unsafe — substring /unsafe|hack|ignore previous|system promptathon", "shack", "unsafe working conditions" all refused. Runsbefore everything, unconditional.
2. unsupported — isLikelyExternalCurrent: (today|now|yesterday|l(gold|dollar|weather|news|score|راعسأ|ةارابم|ةجيتن|رابخأ|سقط|بهذلا), unless a document keyword appears. رخآ ("latest/other") and راعسأ ("prices") are ordinary
Arabic words → "؟دقعلا يف تامدخلا راعسأ رخآ يه ام" is refused betors.
3. clarification — isLikelyGibberish (≤2 tokens, no ?, no known term); rawConfidence < 0.5; detectedIntent === "unsupported"; follow-up without history; follow-up whose normalizedQuestion equals the raw question; unresolved/ambiguous title hint.
4. social — detectSocialMessage on the whole message. Deferred ogement ∈ {يشام ,مامت ,ال ,معن ,هويا, yes, no, ok, okay, sure} and only if the last assistant message asks a question.
5. assistant — identity/capability questions; mixed turns keep a knowledgeRemainder.

Rescue paths that do exist (well-built): unsupportedQuestionOverorted verdict cannot block a well-formed question);semanticSummarizationOverride; matchesManifestQuestion (rescues to RAG when the question names a known document); assessPositiveKnowledgeSeeking with ~150 bilingual terms.

### Language-Specific Behavior


```text
┌──────────────────────┬──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│        Input         │                                                                                                     │
├──────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ English              │ Full path.                                                                                                                       │
├──────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Arabic               │ Arabic system prompt; normalizeArabic fs harakat/kashida. buildAuthorizedSearchQueryText prepends   │
│                      │ one validated English expansion — good for cross-lingual recall.                                                                 │
├──────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Mixed                │ Treated as Arabic (isArabicContext).                                                                                             │
├──────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Typos                │ isLikelyGibberish only flags ≤2-token inputs; tokensAreClose allows edit distance ≤1 for ≥5-char tokens. Reasonable.             │
├──────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Short follow-ups     │ High clarification risk — §14.                                                                      │
├──────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ that / it / there    │ hasSemanticRetrievalSubject returns false when the last token is an unresolved reference ⇒ clarification.                        │
├──────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Cross-document       │ Usually clarification — §14.                                                                                                     │
│ follow-up            │                                                                                                                                  │
├──────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Identity + knowledge │ Handled well: knowledgeRemainder keeps y reply is prepended (validateTerminal).                     │
└──────────────────────┴──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```
   
So: are some "permission failures" actually routing failures? Yes. Paths 1 and 2 never reach authorization or retrieval, and produce "This question appears to be outside the scope of company documents" — which reads exactlya user. FALLBACK_OUT_OF_DOMAIN is emitted forUNSUPPORTED_REQUEST regardless of whether any document was consulted.

## 14. Conversation / Follow-Up Authorization

Ownership and isolation — correct. MongoConversationContextAdapter.getContext requires ConversationModel.exists({_id, tenantId, userId: actorId}) before reading any message, and messages are queried {tenantId, convers and getConversationMessages both require conversation.userId === actorId. Missing / foreign-tenant / foreign-owner are indistinguishable. History is bounded to 10 messages / 8 000 chars. No finding.                  
Access re-evaluation per turn — correct. No allowedDocumentIds is carried across turns; every turn re-resolves the actor, re-resolves permissions, and re-authorizes each document five times. Access cannot be inherit

### Where Follow-Ups Break

(a) Only one hardcoded bridge exists. isLikelyAccessContextFollowUp requires (that|this|doing that|while doing that) AND (access|internal systems?|vpn|security|mfa), and the caller additionally requires match /\b(remote|work remotely|home)\b/. Your own example — "Can I work remotely two days per week?" → "What if I need to access internal systems while doing that?" — is precisely this case and works. Any other cross-document follow-up has no deterministic bridge and depends entirely on the intent LLM producing a normalizedQuestion that differs from the raw question. If it doesn't:
}
``` else if (isFollowUp && (!normalizedQuestion || normalizedQuestion === routingQuestion.trim())) {
  clarificationNeeded = true;   // → route "clarification" → NO
                                                                                                                                                           (b) A detected follow-up can pin retrieval to the previous docum rawOutput.referencedDocumentIds = hints.referencedDocumentIds,which includes LLM-proposed ids derived from history. resolveToolInput passes them as documentIds, and onToolResult fail-closes any candidate outside that set:
```typescript
failClosed("Search returned a candidate outside trusted document scope");
```
So a follow-up needing a different authorized document is restricted to the previous one, and the workflow aborts the run with 502 rather than degrading.

(c) Self-contained turns are protected — good. When isFollowUp is false and history exists, retainCurrentTurnDocumentHints is false and the plan is rebuilt from the current message only. Deliberate and correct.

(d) Policy-topic context is not carried. Only normalizedQuestion reaches retrieval. departments/categories from the intent plan are never used as retrieval filters (they are parsed, validated, and dropped).

What can be lost across a follow-up: ✗ allowed documents (re-dert (from JWT, safe) · ✓ policy topic (only via normalizedQuestion) · ✓ department/category intent (dropped) · ✗ access scope (re-resolved, safe).

## 15. UI vs API Authorization

Frontend authority: permission-provider.tsx → GET /permissions/me → {permissions[], grants{}, baseRole, customRoleId, customRoleState, roleVersion}.


```text
┌───────────────────┬─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│       Check       │                                                                                                        │
├───────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Chat button shown │ YES. Nav + page gate on chat:read only (roA chat:read-without-chat:create user sees the composer and   │
│  to users who     │ gets 403 on send.                                                                                                                   │
│ cannot chat?      │                                                                                                        │
├───────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Manage Access     │ YES, two ways. (i) can() ignores scopes ension, state.permissions) — so a department-scoped            │
│ shown when the    │ documents:manage-access grant renders the button, and the backend then returns RESOURCE_CONTEXT_REQUIRED/SCOPE_MISMATCH. The        │
│ backend denies    │ provider has grants[].scope and does not use it. (ii) if (state.baseRole === "SUPER_ADMIN") return true — the UI grants SUPER_ADMIN │
│ it?               │  everything, while the backend gives them o document access.                                           │
───┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Document list     │ YES — the core symptom. The list needs discover; RAG needs use_in_ai + classification ceiling + text scopes + searchStatus + chunk  │
│ shows docs RAG    │ status + embeddings. No badge, no warning, no indicator.                                                                            │
│ cannot use?       │                                                                                                                                     │
├───────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Documents hidden  │                                                                                                                                     │
│ in the UI         │ No. Both GET /documents/:id and download rE_MISMATCH → 404. Frontend hiding is never the control.      │
│ reachable by API? │                                                                                                                                     │
├───────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Role settings UI  │ Mostly — with one dangerous gap. All four scope dimensions are editable and rendered. But nothing communicates that a               │
│ matches backend   │ department-scoped grant whose ids exclude a user's own department removes the permission (evaluator.ts:93). An admin scoping "View  │
│ semantics?        │ Documents" to HR reasonably expects "HR doose document access entirely".                               │
├───────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Self-only toggle  │                                                                                                                                     │
│ matches backend   │ Yes — selfOnly ⇒ resource.ownerId === actot via document ownership.                                    │
│ scope?            │                                                                                                                                     │
├───────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Permission names  │ Yes. app/src/types/api/permissions.types.ts mirrors the backend catalog exactly, and /permissions/catalog serves                    │
│ 1:1?              │ labels/descriptions/compatibleScopes from the single source. Good.                                                                  │
└───────────────────┴────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```


PolicyEditor is the best-designed part of this surface: use_in_asibilityAndConsumption alongside discover/read/download, andcreateEditablePolicyRule defaults new rules to ["discover","read","download","use_in_ai"]. New grants made through the UI are correct. The exposure is legacy policies and deliberate unchecking — neither of which the UI war

## 16. Cache / Staleness Findings

Exhaustive inventory. There is no permission, role, grant, docume anywhere.

```text
Cache: Permission resolution
Key: —
Value: —
TTL: —
Invalidation: none needed (uncached)
Tenant-isolated: n/a
User-isolated: n/a
roleVersion-aware: n/a
Risk: None
────────────────────────────────────────
Cache: Document policy
Key: —
Value: —
TTL: —
Invalidation: uncached; exact-version read per call
Tenant-isolated: ✓
User-isolated: n/a
roleVersion-aware: n/a
Risk: None
────────────────────────────────────────
Cache: trustedCandidateCatalog
Key: runId ?? traceId
Value: scored candidates
TTL: request
Invalidation: deleted on read; FIFO ≥1000
Tenant-isolated: ✗ (implicit)
User-isolated: ✗ (implicit)
roleVersion-aware: n/a
Risk: F-11 (self-DoS), collision DESIGN-RISK
────────────────────────────────────────
Cache: JWT access token
Key: —
Value: {userId,tenantId,role,email,sessionVersion}
TTL: token lifetime
Invalidation: sessionVersion bump
Tenant-isolated: ✓
User-isolated: ✓
roleVersion-aware: ✗
Risk: F-19 (claim-role paths)
────────────────────────────────────────
Cache: Frontend permissions
Key: tenantId:userId
Value: permission set + grants
TTL: session
Invalidation: identity change; auto-refresh on any 403
Tenant-isolated: ✓
User-isolated: ✓
roleVersion-aware: ✗
Risk: F-18 (cosmetic)
────────────────────────────────────────
Cache: Chunk / embedding taxonomy
Key: (tenantId,documentId,generationId)
Value: department, category, classification
TTL: unbounded
Invalidation: outbox → worker, no sweeper
Tenant-isolated: ✓
User-isolated: n/a
roleVersion-aware: n/a
Risk: F-14 (both directions)
────────────────────────────────────────
Cache: accessMetadata sub-doc
Key: (tenantId,documentId,documentVersion)
Value: policy pointer + taxonomy ids
TTL: unbounded
Invalidation: same outbox
Tenant-isolated: ✓
User-isolated: n/a
roleVersion-aware: n/a
Risk: written, never read
────────────────────────────────────────
Cache: ocrConfig
Key: module
Value: config
TTL: process
Invalidation: resetOcrConfig()
Tenant-isolated: n/a
User-isolated: n/a
roleVersion-aware: n/a
Risk: none
```
────────────────────────────────────────
Cache: Rate limits
Key: hashed IP / userId
Value: counters
TTL: 60 s
Invalidation: TTL
Tenant-isolated: ✓
User-isolated: ✓
roleVersion-aware: n/a
Risk: none
────────────────────────────────────────
Cache: Idempotency gates
Key: various
Value: outcomes
TTL: 24 h
Invalidation: TTL index
Tenant-isolated: ✓
User-isolated: ✓
roleVersion-aware: n/a
Risk: none

Grant → RAG still denies until refresh: only for taxonomy changents take effect on the next turn.
Revoke → RAG still allows until refresh: YES for sensitivity reclassification (F-14b) — classified HIGH. Subject/action revocation is immediate.

The outbox is the single staleness vector, and it has no safety nDispatch is setImmediate(… .catch(() => undefined)), anddispatchPending is never called from production code (only defined, plus the migration script's dispatchEvent). One transient Redis failure ⇒ retry_pending with a nextAttemptAt nobody reads ⇒ permanent staleness.

## 17. Database Consistency

Entity map
```text
Tenant 1─n User ──0..1─> Role(customRoleId)          [tenant-scozedName)]
Tenant 1─n Department ─┬─ User.employeeProfile.departmentId  (+ legacy .department text)
                       └─ Document.departmentId            (+ .department text)
Tenant 1─n DocumentCategory ── Document.categoryId         (+ .c
Tenant 1─n DocumentClassification ── Document.classificationId (+ .classification LEVEL)
Tenant 1─n Document ─1─> DocumentAccessPolicy(activePolicyId, activePolicyVersion)  [immutable snapshots]
         ├─ n DocumentVersion,  n IndexGeneration
         └─ n DocumentChunk ─1─ ChunkEmbedding      [taxonomy denormalized: department/category/classification]
Tenant 1─n Conversation(userId) 1─n Message(sources[])
DocumentPolicyGeneration / …PropagationOutbox / …Idempotency / …lane]
```

### Findings


```text
┌─────────────────┬──────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│      Check      │                                                                Result                                                                 │
├─────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Stale foreign   │ Document.department/category text vs Departme on rename, and only the policy-apply path re-syncs them.   │
│ ids             │ Chunk copies diverge further. Confirmed structural risk.                                                                              │
├─────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Deleted role    │ customRoleId has no FK. Role deleted ⇒ customRoleState: "missing" ⇒ empty grant map ⇒ total lockout. Fails closed but                 │
│ still assigned  │ catastrophically (F-12).                                                                                 │
├─────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Deleted         │                                                                                                          │
│ documents in    │ Snapshots are per-document and immutable; activePolicyId becomes unreachable. Orphan snapshots accumulate; no TTL/cleanup.            │
│ grants          │                                                                                                          │
├─────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Duplicated      │ Prevented — normalizeRoleGrants(requireCanons; drafts reject duplicate ruleId and duplicate semantic     │
│ grants          │ rules.                                                                                                                                │
├─────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Missing         │ required: true on every audited model. tenan scoping.                                                    │
│ tenantId        │                                                                                                                                       │
├─────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ roleVersion     │ version must increase by exactly 1; optimist for invalidation (by design).                               │
│ mismatch        │                                                                                                                                       │
├─────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Orphan ACLs     │ Yes — see above. LOW.                                                                                    │
├─────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Invalid         │ Guarded at read: DepartmentModel.exists({_id, tenantId, status:"active"}). Archived ⇒ resolveDepartmentNames → [] ⇒ RAG blackout      │
│ department ids  │ (F-08).                                                                                                  │
├─────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│                 │ Reasonable coverage: 12 on Document (incl. partial idx_document_tenant_active_policy), 4 on DocumentAccessPolicy, 9 on DocumentChunk, │
│ Missing indexes │  3 on ChunkEmbedding, 6 on User. Gap: documeoined per row in the list pipeline on (tenantId, documentId, │
│                 │  policyId, policyVersion) — covered by uniq_document_policy_snapshot. OK.                                                             │
├─────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Unintended      │ userSchema.index({role:1},{unique:true, partialFilterExpression:{role:"SUPER_ADMIN"}}) — at most one SUPER_ADMIN globally, ever.      │
│ uniqueness      │ Named uniq_initial_super_admin, so intentional, but it makes platform-operator redundancy impossible. Flagged as DESIGN-RISK.         │
├─────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Legacy records  │ Three explicit legacy paths: permissionBaseline: "legacy-none" (⇒ zero permissions), employeeProfile.department text fallback,        │
│ pre-RBAC        │ Document.category/department "transitional display-only" fields. Plus five migration scripts, of which migrate:policy:use-in-ai is    │
│                 │ the one that gates RAG and must be run manua                                                             │
└─────────────────┴───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```


I did not query any database. All of the above is derived from schemas, indexes, and code paths.

## 18. Existing Test Coverage Matrix


```text
┌───────────────────────────────┬────────────────────────────────────────┬────────────────────────────────────────────────────────────────────────────────┐
│           Invariant           │                 Status                         Evidence                                    │
├───────────────────────────────┼────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────┤
│ Role assignment / provenance  │ COVERED                                │ roles.test.ts, roles.persistence.test.ts, roles.phase2.test.ts                 │
├───────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────┤
│ Permission resolution (both   │ COVERED — 57 tests,                    │ permissions.evaluator.contract.test.ts                                         │
│ impls)                        │ dual-implementation contract           │                                                                                │
├───────────────────────────────┼────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────┤
│ Scope conjunction / selfOnly  │ COVERED                                │ same, tests 5, 10–16                                                           │
│ / narrowing                   │                                                                                            │
├───────────────────────────────┼────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────┤
│ Document Manage Access        │ COVERED                       gement.persistence.test.ts, …impact.integration.test.ts      │
│ persistence                   │                                        │                                                                                │
├───────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────┤
│ Document policy evaluation    │ COVERED                                │ documentAccess.evaluator.contract.ts                                           │
│ (25 invariants)               │                                        │                                                                                │
├───────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────┤
│ Document visibility (discover │ PARTIALLY — pipeline shape asserted,   │ documentAccess.authorization.test.ts:3-4                                       │
│  pipeline)                    │ not end-to-end results                 │                                                                                │
├───────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────┤
│ Cross-tenant isolation        │ COVERED                                │ tenantScopedRepository.test.ts, intentQuery.security.test.ts,                  │
│                               │                                        │ retrieval.authorization.test.ts:105                                            │
├───────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────┤
│ RAG authorization (use_in_ai) │ COVERED                                │ retrieval.authorization.test.ts,                                               │
│                               │                                        │ authorizedRetrievalTools.{test,db.test,integration.test}.ts                    │
├───────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────┤
│ Chat authorization            │ COVERED                                │ chat.authorization.test.ts, chatWorkflowService.test.ts                        │
├───────────────────────────────┼────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────┤
│ Follow-up access              │ PARTIALLY — routing covered;  g.test.ts                                                    │
│ re-evaluation                 │ cross-document follow-up retrieval not │                                                                                │
├───────────────────────────────┼────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────┤
│ Revoked access mid-flight     │ COVERED — TOCTOU test asserts ation.test.ts:120-146                                        │
│                               │ 2 authorization calls                  │                                                                                │
├───────────────────────────────┼────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────┤
│ Role changes without stale    │ COVERED                                │ contract test 8 / 36                                                           │
│ cache                         │                                        │                                                                                │
├───────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────┤
│ Cache invalidation            │ N/A (no caches)                        │ —                                                                              │
├───────────────────────────────┼────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────┤
│ read granted without          │ NOT COVERED                                                                                │
│ use_in_ai                     │                                        │                                                                                │
├───────────────────────────────┼────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────┤
│ Role classification ceiling   │ NOT COVERED                   t.ts:47 asserts the ceiling in isolation; nothing tests it   │
│ vs explicit grant             │                                        │ against a Manage Access grant                                                  │
├───────────────────────────────┼────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────┤
│ List-visible ⇒ RAG-usable     │ NOT COVERED                                                                                │
│ parity                        │                                        │                                                                                │
├───────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────┤
│ Department/category rename or │ NOT COVERED                            │ —                                                                              │
│  archive → RAG                │                                        │                                                                                │
├───────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────┤
│ Chunk taxonomy staleness →    │ NOT COVERED                            │ —                                                                              │
│ authorization                 │                                        │                                                                                │
├───────────────────────────────┼────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────┤
│ Evidence gate CONFLICTING on  │ NOT COVERED                            │ chat.evidenceGate.test.ts:88 only injects the level                            │
│ real policy text              │                                                                                            │
├───────────────────────────────┼────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────┤
│ Catalog-miss → permanent WEAK │ NOT COVERED                                                                                │
├───────────────────────────────┼────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────┤
│ Semantic verification bounds  │ NOT COVERED                                                                                │
│ (summaries)                   │                                        │                                                                                │
├───────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────┤
│ /chat/send vs                 │                                        │                                                                                │
│ /chat/send/stream guard       │ NOT COVERED                            │ —                                                                              │
│ parity                        │                                                                                            │
├───────────────────────────────┼────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────┤
│ Tenant status: "trial"        │ NOT COVERED                            │ —                                                                              │
│ lockout                       │                                        │                                                                                │
└───────────────────────────────┴────────────────────────────────────────┴────────────────────────────────────────────────────────────────────────────────┘
```


### Misleading Tests — Flagged as Requested
 retrieval.authorization.test.ts is the suite that most plausibly should have caught the reported symptom, and it cannot, for three specific reasons:

1. Every fixture chunk is classification: "public" (line 24), so never bites.
2. No Mongo connection ⇒ DocumentModel.db?.readyState !== 1 ⇒ activeDocIds = new Set(allDocIds) (line 208) — buildRetrievableDocumentFilter never executes, so searchStatus/archived/status gating is untested.
3. authorizeDocumentForAi is a Map lookup, so the entire real chetadata equality → capability → subject matching) is bypassed.

The suite proves the authorization plumbing is wired. It cannot prove authorized documents are reachable. That gap is exactly the shape of the reported bug.

## 19. Missing Tests

### P0 — Parity Invariants (Would Have Caught the Reported Symptom)
1. visible-in-list ⇒ usable-in-RAG property test over the full matrix in §25, with a real Mongo fixture and real policy snapshots.
2. EMPLOYEE + classification: "confidential" + explicit use_in_acurrently fails).
3. Policy rule with ["discover","read"] and no use_in_ai ⇒ listed and RAG-refused, with authorizationRestricted === true and the authorization fallback message (not the knowledge-gap one).
4. Owner rule with use_in_ai removed ⇒ owner sees the document,
5. Department-scoped documents:use-in-ai excluding the user's department ⇒ assert documents:read survives and RAG returns zero, with a distinguishable reason code.

### P0 — Staleness
6. Reclassify internal → confidential; before propagation, assert an EMPLOYEE can no longer retrieve (currently they still can — F-14b).
7. Reclassify confidential → internal; assert retrieval works wi
8. Rename a Department; assert RAG results for a department-scoped role are unchanged.
9. Archive a Department referenced by a role grant; assert a deterministic, logged outcome.
10. Fail the propagation enqueue; assert a sweeper eventually drchPending wired first).

### P1 — Evidence & Routing
11. Reranker: two chunks, 21 vs 30 leave days, same metric ⇒ assefusal, then assert the intended behavior once decided.
12. Conflict groups over candidates that do not reach the bundle must not force CONFLICTING.
13. evaluate_evidence with an empty catalog ⇒ assert it does nott WEAK.
14. Calling evaluate_evidence twice in one run ⇒ assert the second call is not silently degraded.
15. 25-sentence summary ⇒ assert VERIFICATION_BOUNDS_EXCEEDED is not reported as a knowledge gap.
16. "What is our hackathon policy?" ⇒ must reach RAG, not unsafe
17. "What are the latest prices in the vendor contract?" ⇒ must reach RAG.
18. Cross-document follow-up outside the remote-work bridge ⇒ must retrieve or clarify, and must never 502.

### P1 — Guard Parity
19. Table-driven test asserting /chat/send and /chat/send/stream produce identical decisions for every actor in §25.
20. Every route in §25 × every actor ⇒ assert list/read/download/RAG agreement.
21. Tenant status ∈ {trial, pending, suspended} ⇒ assert the int

### P2 — Observability Assertions
 (every refusal carries a machine-rtecture test that fails if a new authorize("ROLE") orclaim-derived tenant selection is introduced; a build-freshness check for api/dist.

## 20. Manual Reproduction Plan

Prerequisites: a disposable tenant with ≥2 documents (one internal, one confidential), one COMPANY_ADMIN, one EMPLOYEE, one custom EMPLOYEE role. Do not run these against production data.

R-1 — read without use_in_ai (F-01).
Admin → Manage Access on Doc A → add rule subject: user = employly → Apply. As the employee: Doc A is listed ✓, GET /documents/A200 ✓, ask a question whose answer is in Doc A ⇒ refusal. Then check the reason: db.auditlogs.find({action:"DOCUMENT_ACCESS_DENIED", "metadata.action":"use_in_ai"}) ⇒ NO_MATCHING_GRANT.
Dry-run the fleet-wide blast radius safely: npm run migrate:policy:use-in-ai --workspace api (dry-run; the would_migrate count is the number of affected documents).

R-2 — classification ceiling (F-02).
Set Doc B classification: confidential. Grant the employee a rulin_ai. Ask about Doc B ⇒ refusal. Confirm: POST /retrieval/search {"queryText":"<phrase from B>"} as the employee returns totalCandidates: 0 with filterSummary.roleFilter: "EMPLOYEE". Repeat as COMPANY_ADMIN ⇒ works. Set B to internal, wait for propagation ⇒ the employee now works.

R-3 — scope divergence (F-03/F-04).
Custom EMPLOYEE role: documents:read unscoped; documents:use-in-HR]. Assign a user whose employeeProfile.departmentId = IT. Then: GET /permissions/me ⇒ documents:use-in-ai is absent from permissions (deleted by evaluator.ts:93); the document list still returns rows; chat refuses everything.

R-4 — department rename (F-08).
Note current RAG works for a department-scoped role. Rename the Department via PATCH /document-taxonomy/departments/:id. Re-ask immediately ⇒ zero candidates (new name vs stale chunk.department). Verify: db.documentchunks.findOne({documentId:…},{department:1}) still holds the old name.

R-5 — reclassification revocation window (F-14b, SECURITY).
Grant the employee use_in_ai on an internal Doc C; confirm retrieval works. Change C to confidential via Manage Access. Before propagation completes, re-ask ⇒ content is still returned. Confirm the stale metadata: db.chunkembeddings.findOne({documentId:C},{classification:1}) ⇒ "internal". Then confirm no sweeper
exists: db.documentpolicypropagationoutboxes.find({state:{$in:["and grep — dispatchPending has no caller.

R-6 — evidence CONFLICTING (F-09).
Upload a document containing both "Annual leave is 21 days per year." and "Annual leave is 30 days per year." Grant full access. Ask "How many annual leave days do I get?" ⇒ refusal. Confirm via the reranker log line: "Rt" with sufficiencyLevel: "CONFLICTING", conflictGroupCount: 1,matching the chat traceId.
Reproduce in isolation (no DB, no mutation):
node --import tsx --input-type=module -e "
const { detectConflicts } = await import('file:///<repo>/api/src/modules/reranker/conflictDetector.ts');
const mk = t => ({ text: t, documentId: 'd', documentVersionId: 'v', tenantId: 't' });
console.log(detectConflicts(
  ['Annual leave is 21 days per year.','Annual leave is 30 days
  undefined, 'How many annual leave days do I get?'));"

R-7 — summary bounds (F-10).
"Summarize the <exact document title>." ⇒ refusal. Confirm: {staverflowType:"claim_count"} in the logs, and a false knowledgeGaprow for the turn.

R-8 — routing (F-17).
Ask "What is our hackathon policy?" ⇒ hard safety refusal. Confirm auditlogs has INTENT_QUERY_UNSAFE_BLOCKED.

R-9 — endpoint guard divergence (F-16).
Custom role with chat:create scoped selfOnly: true. POST /chat/send/stream ⇒ works. POST /chat/send ⇒ 403 RESOURCE_CONTEXT_REQUIRED. Same user, same second.

R-10 — tenant trial lockout (F-15).
On a disposable tenant only, PUT /super-admin/tenants/:id { status: "trial" } ⇒ every authenticated request from that tenant returns 403 TENANT_NOT_ACTIVE.
Restore to active.

R-11 — catalog miss (F-11). Reproduced in §9 item 6; in-app, trience in one run.

R-12 — observability gap (F-20). For any refusal, try to determiher it was 0-authorized, 0-similar, or threshold-rejected. Youcannot: retrieval.service.ts:676 stamps a fresh crypto.randomUUID() and evaluate_evidence logs nothing.

## 21. Recommended Fix Order

Direction only — no code was changed.

### P0 — Stop Silent Denial and Make Failures Diagnosable
                                                                                                          1. F-20 Observability first. Thread the request traceId into hybng one; log evaluate_evidence'ssufficiency/reasonCode/approved/rejected counts; add retrievalOutcome, evidenceSufficiency, authorizationRestricted, zeroCandidateReason
