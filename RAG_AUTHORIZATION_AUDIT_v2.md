You are performing a READ-ONLY production-grade audit of the DocuMind AI
authorization, RBAC, document-access, scope, and RAG retrieval system.

DO NOT MODIFY ANY FILE.
DO NOT FIX ANY ISSUE.
DO NOT COMMIT.
DO NOT CREATE A BRANCH.
DO NOT RUN MIGRATIONS.
DO NOT MUTATE DATABASE DATA.
DO NOT CHANGE ENVIRONMENT VARIABLES.
DO NOT CHANGE ROLES, USERS, DOCUMENT ACCESS, OR PERMISSIONS.
DO NOT "CLEAN UP" CODE.

Your job is ONLY:

  inspect
  trace
  test safely
  identify defects
  explain root causes
  produce a detailed audit report

==================================================
PROJECT / PROBLEM CONTEXT
==================================================

This is DocuMind AI, a multi-tenant enterprise document/RAG platform.

There are real intermittent authorization/RAG problems.

Observed symptoms include:

1. A user is allowed to access a document, but RAG sometimes behaves as if the
   document is invisible.

2. A user asks something that exists clearly in an authorized company document,
   but the assistant responds with something equivalent to:

     "I don't know"
     "Insufficient information"
     "Outside the scope of company documents"

3. The same question can sometimes work and sometimes fail depending on:
   - user
   - role
   - conversation state
   - document
   - follow-up wording
   - retrieval path

4. Permissions, roles, scope, Manage Access, tenant boundaries, document
   visibility and RAG retrieval may not be using exactly the same source of truth.

5. We need to know whether this is caused by:
   - RBAC
   - role resolution
   - permission evaluation
   - delegated scope
   - document Manage Access
   - department logic
   - document ACL/filtering
   - RAG retrieval filters
   - conversation/follow-up routing
   - stale cache
   - incorrect ownership/scoping
   - intent routing
   - vector retrieval
   - post-retrieval filtering
   - or a combination.

==================================================
CONFIRMED REPORTED SYMPTOM — TREAT AS HIGHEST PRIORITY
==================================================

This is a real, reproduced symptom reported directly by the product owner,
not a hypothetical:

  "I have a problem in RAG: I ask about a document that is ALREADY in the
   RAG index, and it does not answer."

Key facts as reported:

  - The document in question is CONFIRMED to already be ingested/indexed
    (i.e., this is not a case of the document still being uploaded,
    processing, or awaiting embedding — from the reporter's point of view
    it is already "in the RAG").
  - The user asking is presumed to have legitimate access to the document
    (this has not been separately verified against Manage Access/ACL
    records, so the audit must still confirm authorization independently
    rather than assume it).
  - The failure mode is a non-answer: the assistant responds as if the
    document does not exist or the content is not found, even though the
    reporter believes the answer is clearly present in that document.

Because the document is reported as already indexed, this symptom should
shift investigative priority toward retrieval-time and answer-time failure
classes BEFORE assuming an RBAC/Manage Access root cause. Specifically
prioritize, in this order:

  1. PART 8  — Document lifecycle / RAG eligibility
     Confirm the document's actual status field(s). "Already in the RAG"
     per the UI or per the reporter is not proof of embedding readiness.
     Check for a mismatch between "visible/uploaded" state and the actual
     state required for retrieval eligibility (e.g. embedding job failed
     silently, partial re-index, stuck "processing" status that the UI
     mislabels as ready).

  2. PART 11 — Vector / embedding metadata
     Check whether the document was re-indexed after any later change
     (Manage Access change, department change, content edit) and whether
     stale or missing vector metadata could cause it to be filtered out
     at query time even though the canonical document record looks fine.

  3. PART 9 & PART 10 — RAG retrieval path and allowed-document-ID
     resolution
     Confirm whether this specific document ID is present in the
     allowedDocumentIds set actually passed into the vector/metadata
     filter for this user, and whether that set could be empty, truncated,
     or mis-scoped in a way that silently drops this one document.

  4. PART 12 — Retrieval thresholds vs authorization
     Determine whether the document IS being retrieved as a candidate but
     is then being rejected by similarity/reranking/evidence-confidence
     logic before it reaches the answer writer. This is a distinct failure
     class from authorization and from "not retrieved at all" — the audit
     must explicitly state which of the two is happening here, with
     evidence (candidate count before vs. after filtering).

  5. PART 13 — Intent / routing failures
     Rule out that the question is being classified away from
     knowledge_question → RAG entirely (e.g. routed to general/social/
     unsupported) before retrieval is even attempted.

  6. PART 6 & PART 7 — Manage Access and effective access formula
     Only after 1–5 above are ruled out or confirmed, verify independently
     (do not assume) that the asking user actually has both DOCUMENT_READ
     and any AI-use-specific grant for this exact document, since an
     access gap would produce an identical user-visible symptom.

For this specific symptom, the final report MUST include a dedicated
sub-finding that states plainly, with evidence:

  - Is the document actually embedding-ready right now? (yes/no + status)
  - Is the document present in the allowlist passed to retrieval for this
    user? (yes/no + evidence)
  - Was the document retrieved as a candidate at all? (yes/no + candidate
    count)
  - If retrieved, was it rejected by score/threshold/evidence logic, or
    accepted but excluded by the answer writer?
  - Is this reproducible on demand, or intermittent? If intermittent, what
    varies between the working and failing attempt (exact question
    wording, follow-up vs. fresh conversation, user, time since last
    index/access change)?

==================================================
MOST IMPORTANT RULE
==================================================

DO NOT ASSUME THE INTENDED ACCESS MODEL.

Derive the ACTUAL access model from source code, schemas, tests, middleware,
services, database models and runtime flow.

If documentation disagrees with implementation:

  report both
  and identify the implementation as the current runtime source of truth.

Do not hide inconsistencies.

==================================================
PRIMARY AUDIT QUESTION
==================================================

For any chat question, answer this:

  "Exactly what decides which company documents this user is allowed to use
   as RAG evidence?"

Trace this from authentication all the way to the final answer.

I want an exact chain such as:

  authenticated user
      ↓
  tenant
      ↓
  base role
      ↓
  custom role(s)
      ↓
  permission evaluator
      ↓
  grants / delegated scope
      ↓
  document Manage Access
      ↓
  effective document ACL
      ↓
  query scope
      ↓
  vector/document retrieval
      ↓
  post-retrieval authorization filtering
      ↓
  answer writer
      ↓
  citations

But DO NOT assume this is the real chain.

Find the actual one.

==================================================
PART 1 — AUTHENTICATION / TENANT BOUNDARY
==================================================

Trace:

- authentication middleware
- current-user resolution
- tenant resolution
- tenant isolation
- SUPER_ADMIN behavior
- COMPANY_ADMIN behavior
- employee behavior
- disabled/inactive users
- suspended tenants if applicable

Determine:

1. Which tenantId is authoritative.

2. Whether tenantId can ever come from request input instead of authenticated
   context.

3. Whether chat/RAG/document APIs re-check tenant isolation independently.

4. Whether vector search or retrieval queries always include tenant isolation.

5. Whether any retrieval path can leak documents across tenants.

6. Whether tenant scope can be lost during:
   - background jobs
   - worker calls
   - RAG orchestration
   - agent/supervisor calls
   - conversation continuation
   - follow-up rewriting.

==================================================
PART 2 — ROLE MODEL
==================================================

Find every role-related model and runtime source.

Determine the actual meaning of:

- SUPER_ADMIN
- COMPANY_ADMIN
- EMPLOYEE
- any other base roles
- custom roles
- role IDs
- role versions
- role state
- permission baseline
- grants
- multiple role support, if any
- role migration state, if any

Answer clearly:

1. Can one user have more than one role?

2. Is there a base role + custom role?

3. Which wins if base role and custom role disagree?

4. Are permissions additive, subtractive, or replacement-based?

5. Can a custom role remove a permission inherited from a base role?

6. Are roles tenant-scoped?

7. Can roles be reused across tenants?

8. What happens when a role is edited after a user is assigned to it?

9. Is roleVersion used to invalidate old permission state?

10. Is there permission caching?

11. How/when is that cache invalidated?

12. Can stale role/permission cache explain intermittent access behavior?

==================================================
PART 3 — PERMISSION EVALUATOR
==================================================

Locate the canonical permission evaluator.

Map:

  permission name
  resource
  scope
  role
  grants
  denial reason
  cache
  resolution order

Find all permissions relevant to:

- CHAT
- DOCUMENT_READ / DOCUMENT_VIEW
- DOCUMENT_MANAGE
- BILLING if shared middleware matters
- USER / EMPLOYEE access
- ROLE management
- RAG / AI if there are dedicated permissions

Do not just list enum values.

For each permission explain:

  who checks it
  where
  against what resource
  before what operation.

Identify duplicate or inconsistent authorization implementations.

Example:

  service A uses authorizePermission()
  service B manually checks role === COMPANY_ADMIN
  service C only checks tenantId

If this exists, flag it.

==================================================
PART 4 — SCOPE MODEL
==================================================

This part is extremely important.

Find every concept called or behaving like:

- scope
- delegated scope
- resource scope
- self
- self-only
- department
- team
- assigned documents
- owned documents
- all
- tenant
- resource grant
- document grant

Determine exactly what each means.

For every scope type, answer:

1. Which resources does it include?

2. Which resources does it exclude?

3. Is scope evaluated at:
   - API request time
   - document listing time
   - RAG retrieval time
   - both?

4. Is scope applied before vector search or only afterward?

5. Can an authorized document be excluded because of another scope filter?

6. Can scope accidentally become empty?

7. Can a null/undefined scope mean:
   - all resources
   - no resources
   depending on code path?

Search specifically for this class of bug.

==================================================
PART 5 — DEPARTMENT MODEL
==================================================

Determine what departments actually do.

Do NOT assume department == permission.

Answer:

1. Is a user assigned to a department?

2. Is a document assigned to a department?

3. Does department automatically grant document visibility?

4. Does a role contain department scope?

5. Does Manage Access depend on department?

6. Is department only metadata?

7. Is department used in RAG retrieval filters?

8. Can a user belong to multiple departments?

9. Can a role grant cross-department document access?

10. If HR user is explicitly allowed to an IT document, which wins:
    department restriction or explicit access grant?

Provide exact source-code evidence.

==================================================
PART 6 — "MANAGE ACCESS" — CRITICAL
==================================================

Trace the complete Manage Access feature.

Find:

- frontend page/modal
- API endpoint
- validation
- service
- DB persistence
- schemas/models
- permission required to modify access
- effective access calculation
- retrieval integration

Explain precisely what happens when an admin opens:

  Manage Access

for a document and grants access.

What exactly is persisted?

Examples to investigate:

- user IDs
- role IDs
- department IDs
- ACL records
- access-grant documents
- embedded arrays
- resource grants

DO NOT GUESS.

Answer:

1. Who is allowed to use Manage Access?

2. Is COMPANY_ADMIN automatically allowed?

3. What permission controls Manage Access?

4. Can an employee with DOCUMENT_MANAGE use it?

5. Can access be granted:
   - to individual users?
   - roles?
   - departments?
   - everyone?

6. Is access deny-by-default or allow-by-default?

7. What happens when no Manage Access records exist?

8. Is the document owner automatically allowed?

9. Is the uploader automatically allowed?

10. Are company admins automatically allowed to all documents?

11. Is SUPER_ADMIN allowed to document contents or only platform operations?

12. Does a Role's chat permission automatically grant access to company
    documents?

13. Does document-read permission automatically grant access to ALL documents,
    or only documents already inside the user's scope?

14. If Manage Access explicitly grants a document, can another filter still
    remove it?

15. If Manage Access removes a grant, how quickly does RAG stop seeing the
    document?

16. Are caches invalidated when Manage Access changes?

==================================================
PART 7 — BUILD THE EFFECTIVE ACCESS FORMULA
==================================================

After inspecting everything, write the ACTUAL formula for whether user U may
read document D.

I want something equivalent to:

  canUseDocument(U, D) =
      sameTenant(U, D)
      AND hasPermission(U, DOCUMENT_READ)
      AND scopeAllows(U, D)
      AND documentGrantAllows(U, D)
      AND documentIsActive(D)
      ...

But derive the real formula.

Do this separately for:

A. Document shown in UI/document list.

B. Direct document API access.

C. Document download/view.

D. Chat/RAG retrieval.

These MUST be compared.

If they are not identical where they should be identical:

  FLAG AS HIGH SEVERITY.

==================================================
PART 8 — DOCUMENT LIFECYCLE / RAG ELIGIBILITY
==================================================

Trace document states.

Determine whether a document can be:

- uploaded
- processing
- OCR processing
- indexed
- embedding
- ready
- failed
- archived
- deleted
- inactive
- superseded

Find the exact state(s) that make it eligible for RAG.

Check whether:

  "User can see document in UI"

can be true while:

  "Document is eligible for RAG"

is false.

This could explain observed behavior.

Report this clearly.

==================================================
PART 9 — RAG RETRIEVAL PATH
==================================================

Trace a real knowledge question end-to-end.

Start from:

  POST chat/message

or the actual chat endpoint.

Trace:

  controller/router
  authentication
  conversation ownership
  intent detection
  intent query
  supervisor / multi-agent routing
  semantic query generation
  retrieval
  vector store
  metadata filters
  authorization filters
  reranking
  evidence selection
  answer generation
  citations

Identify EVERY place where documents may be filtered out.

Produce the exact retrieval filter object/query.

Example only:

  tenantId
  documentId IN allowedDocumentIds
  department
  visibility
  status
  embeddings ready
  similarity threshold

But find the actual values from code.

==================================================
PART 10 — ALLOWED DOCUMENT ID RESOLUTION
==================================================

This may be one of the critical areas.

Find how the system determines the list/set of documents available to the user
for RAG.

Answer:

1. Is a list of allowedDocumentIds generated?

2. Which service generates it?

3. Does it consider:
   - tenant
   - role
   - permission
   - grants
   - Manage Access
   - departments
   - ownership
   - document status?

4. What happens if the list is empty?

5. What happens if it is undefined?

6. Does undefined mean all or none?

7. Can an empty list accidentally be omitted from the vector filter, resulting
   in broader access?

8. Can an empty list accidentally cause "no evidence" even for authorized
   users?

9. Is there a maximum number of IDs causing truncation?

10. Is pagination incorrectly involved?

11. Is the result cached?

12. Can cache keys omit:
    - tenantId
    - userId
    - roleVersion
    - access revision?

Look for stale-access bugs very carefully.

==================================================
PART 11 — VECTOR / EMBEDDING METADATA
==================================================

Inspect what metadata is stored with chunks/embeddings.

Examples:

- tenantId
- documentId
- departmentId
- access fields
- owner
- document status
- source type

Determine:

1. Is authorization metadata copied into embeddings?

2. If Manage Access changes after indexing, does the vector metadata become
   stale?

3. Does access control use live Mongo state or embedding metadata?

4. If the document changes department/access, is re-indexing required?

5. Could stale vector metadata explain:
     user allowed in Mongo
     but retrieval still excludes document?

6. Could it cause the opposite security issue:
     user revoked in Mongo
     but vector metadata still allows retrieval?

==================================================
PART 12 — RETRIEVAL THRESHOLDS VS AUTHORIZATION
==================================================

Separate these two failure classes:

A) authorized document was not retrievable

B) document was retrieved but score/evidence logic rejected it

Audit:

- similarity thresholds
- reranking thresholds
- topK
- minimum evidence rules
- query rewriting
- semantic query generation
- lexical/hybrid search if present
- chunk filtering
- source confidence logic

A user saying:

  "the AI knows this but says I don't know"

may be caused by RAG quality, not RBAC.

The final report MUST distinguish:

  ACCESS FAILURE

from:

  RETRIEVAL FAILURE

from:

  ANSWER/ROUTING FAILURE.

==================================================
PART 13 — INTENT / ROUTING FAILURES
==================================================

Audit intent handling relevant to knowledge questions.

We already have a multi-agent / intent-query / supervisor architecture.

Find when a question can incorrectly become:

- general
- social
- unsupported
- assistant_identity
- outside company scope
- non-RAG route

instead of:

  knowledge_question → RAG

Especially inspect:

- Arabic
- English
- mixed Arabic/English
- typos
- short follow-ups
- pronouns such as "that", "there", "it"
- follow-up questions crossing documents
- identity + knowledge combined questions

Determine whether some apparent "permission failures" are actually routing
failures before retrieval even starts.

==================================================
PART 14 — CONVERSATION / FOLLOW-UP AUTHORIZATION
==================================================

This is critical because some failures appear only in follow-ups.

Trace how conversation history is used.

Audit:

- conversationId ownership
- user/tenant isolation
- previous document context
- previous source IDs
- follow-up rewriting
- semantic query rewriting
- scope preservation

Determine whether a follow-up can lose:

  allowed documents
  tenant context
  policy topic
  department scope
  access scope

Example scenario:

  Q1:
    Can I work remotely two days per week?

  Q2:
    What if I need to access internal systems while doing that?

The second question may require retrieval from another authorized document.

Check whether the system:
- correctly re-evaluates document access on every turn
- incorrectly locks retrieval to previous source/documents
- incorrectly classifies the follow-up as unsupported
- loses enterprise-policy context.

==================================================
PART 15 — UI VS API AUTHORIZATION
==================================================

Compare frontend visibility with backend authorization.

Check whether:

- Chat button is shown to users who cannot actually chat.
- Manage Access is shown when backend denies it.
- Document list shows docs that RAG cannot use.
- Documents hidden in UI remain directly accessible by API.
- Role settings UI represents actual backend semantics.
- Self-only toggle matches actual backend scope.
- Permission names shown in UI map 1:1 to backend permissions.

Never treat frontend hiding as authorization.

==================================================
PART 16 — CACHE / STALE STATE AUDIT
==================================================

Find ALL caches related to:

- permissions
- custom roles
- grants
- document access
- tenant settings
- RAG scope
- conversation state
- embeddings
- document metadata

For each cache report:

  key
  value
  TTL
  invalidation events
  tenant isolation
  user isolation
  role-version awareness
  grant-version awareness

Look specifically for:

  access granted
  → DB updated
  → RAG still denies until cache expires

and:

  access revoked
  → RAG still allows until cache expires

The second is a security issue and should be classified HIGH/CRITICAL.

==================================================
PART 17 — DATABASE CONSISTENCY
==================================================

Inspect relevant schemas/collections.

Map relationships among:

  User
  Tenant
  Role
  CustomRole
  Department
  Document
  Document Access / ACL / Grant
  Conversation
  RAG chunks / vectors
  indexes

Check:

- stale foreign IDs
- deleted roles still assigned to users
- deleted documents in grants
- duplicated grants
- missing tenantId
- roleVersion mismatch
- orphan ACLs
- invalid department IDs
- missing indexes
- indexes that enforce unintended uniqueness
- legacy records created before newer RBAC logic

DO NOT mutate the DB.

If a configured development database is available, read it only if safe.

==================================================
PART 18 — SECURITY TEST MATRIX
==================================================

Build a manual + automated test matrix.

At minimum cover:

ACTORS

1. Super Admin
2. Company Admin
3. Employee with normal role
4. Employee with custom role
5. Employee without chat permission
6. Employee with chat but without document access
7. Employee with explicit document access
8. Cross-department employee
9. Disabled employee
10. User from another tenant

DOCUMENT ACCESS CASES

A. Same tenant, explicitly granted
B. Same tenant, not granted
C. Different tenant
D. Same department
E. Different department
F. Explicit cross-department grant
G. Access removed after previously granted
H. Role changed after login
I. Document processing
J. Document ready/indexed
K. Document archived/deleted if supported

For each case test:

- visible in document list?
- direct API read?
- downloadable?
- selectable in chat if applicable?
- retrievable by RAG?
- cited in answer?
- excluded when unauthorized?

==================================================
PART 19 — RAG FUNCTIONAL TEST MATRIX
==================================================

For each authorized document:

1. Exact phrase question.
2. Paraphrase.
3. Arabic.
4. English.
5. Mixed Arabic/English.
6. Typo.
7. Numeric fact.
8. False premise.
9. Summary.
10. Follow-up.
11. Cross-document follow-up.
12. Identity + knowledge combined query.

Compare:

  expected document
  actual retrieved document
  similarity/ranking
  authorization decision
  final answer
  citations

==================================================
PART 20 — OBSERVABILITY
==================================================

Determine whether production logs make this diagnosable.

For one chat turn, can we see:

- tenantId
- actorId
- role/customRoleId
- permission decision
- effective scope
- allowed document count
- allowed document IDs safely/redacted if needed
- semantic query
- retrieval candidate count
- candidates removed by auth
- candidates removed by score
- selected sources
- final route
- fallback reason

Do NOT recommend logging sensitive document contents.

If the system currently cannot distinguish:

  "0 documents authorized"

from:

  "10 authorized, 0 similar"

from:

  "3 retrieved but confidence threshold rejected"

FLAG THAT AS AN OBSERVABILITY DEFECT.

==================================================
PART 21 — DO NOT CONFUSE THESE FAILURE TYPES
==================================================

Every discovered issue MUST be categorized as one of:

AUTHN
TENANT_ISOLATION
RBAC
PERMISSION_EVALUATION
SCOPE
MANAGE_ACCESS
DEPARTMENT
DOCUMENT_LIFECYCLE
RAG_RETRIEVAL
VECTOR_METADATA
INTENT_ROUTING
FOLLOW_UP_CONTEXT
CACHE
UI_AUTHORIZATION
OBSERVABILITY
TEST_COVERAGE
DATA_MIGRATION
OTHER

And separately classify impact:

SECURITY:
  unauthorized user can access data

AVAILABILITY:
  authorized user cannot access data

QUALITY:
  user can access data but RAG fails to find/use it

UX:
  UI misrepresents actual authorization state

==================================================
PART 22 — SEVERITY
==================================================

Classify findings:

CRITICAL
  Cross-tenant leak or unauthorized company-document disclosure.

HIGH
  User can gain unauthorized document access,
  revocation does not take effect,
  or authorization rules are materially inconsistent.

MEDIUM
  Authorized users are incorrectly denied,
  intermittent RAG visibility,
  stale grants,
  routing prevents legitimate knowledge answers.

LOW
  UX inconsistency, missing observability, confusing labels,
  minor test/documentation gaps.

Do not inflate severity.

==================================================
PART 23 — REQUIRED EVIDENCE FOR EVERY BUG
==================================================

Do not report speculative bugs as confirmed.

For every finding provide:

Finding ID:
Severity:
Category:
Status:
  CONFIRMED
  HIGH-CONFIDENCE
  SUSPECTED
  DESIGN-RISK

Affected flow:

Expected behavior:

Actual behavior:

Root cause:

Exact files/functions:

Evidence:

Reproduction steps:

Security impact:

User impact:

Suggested fix direction:

Tests that should exist:

Do NOT implement the fix.

==================================================
PART 24 — REQUIRED ARCHITECTURE MAP
==================================================

Before listing bugs, produce a concise architecture map covering:

Authentication
   ↓
Tenant
   ↓
User
   ↓
Base/custom role
   ↓
Permission evaluator
   ↓
Scope/grants
   ↓
Document Manage Access
   ↓
Effective allowed documents
   ↓
Chat intent/router
   ↓
RAG retrieval
   ↓
Authorization filtering
   ↓
Answer/citations

For each arrow identify the actual source file/service.

==================================================
PART 25 — REQUIRED ACCESS MATRIX
==================================================

Produce a table like:

| Actor | Chat permission | Document permission | Manage Access grant | Scope | Can list doc | Can RAG doc |
|-------|-----------------|--------------------|---------------------|-------|--------------|-------------|

Fill it using ACTUAL implementation.

Include important role/scoping combinations.

==================================================
PART 26 — REQUIRED "WHO CAN SEE WHAT?" EXPLANATION
==================================================

Write a section for a human developer explaining, in plain language:

1. What a Role controls.
2. What a Permission controls.
3. What Scope controls.
4. What Department controls.
5. What Manage Access controls.
6. Which one ultimately decides document access.
7. Which one ultimately decides RAG access.
8. How explicit grants interact with roles/scopes.
9. Why a user can sometimes have CHAT permission but still not access a
   document.
10. Why a document can be visible to a user but still fail in RAG.

This section is extremely important.

==================================================
PART 27 — TRACE AT LEAST 3 REAL SCENARIOS
==================================================

Use source code to trace these scenarios.

SCENARIO 1

  Company Admin asks a question whose answer exists in a company document.

Show all authorization/retrieval decisions.

SCENARIO 2

  Employee has chat permission but has NOT been granted access to the target
  document.

Show where the document gets excluded.

SCENARIO 3

  Employee has chat permission AND explicit Manage Access grant to the target
  document, but RAG returns insufficient information.

Determine every remaining failure point after authorization succeeds.

If the repository includes appropriate fixtures/tests, use them.

SCENARIO 4 (REQUIRED — MATCHES THE REPORTED SYMPTOM)

  A document that is confirmed already ingested/indexed is asked about by a
  user who is presumed authorized, and the assistant returns a non-answer.

Trace this scenario specifically end-to-end, in the priority order given in
the "CONFIRMED REPORTED SYMPTOM" section above, and state explicitly which
stage (lifecycle status, vector metadata, allowlist resolution, retrieval
candidate scoring, or intent routing) is the actual root cause, with file/line
evidence. If more than one stage is implicated, rank them by likelihood.

==================================================
PART 28 — EXISTING TEST REVIEW
==================================================

Find existing tests for:

- role assignment
- permission resolution
- document Manage Access
- document visibility
- cross-tenant isolation
- RAG authorization
- chat authorization
- follow-up access
- revoked access
- role changes
- cache invalidation

For each important invariant state:

  COVERED
  PARTIALLY COVERED
  NOT COVERED

Identify misleading tests that mock the authorization layer so heavily that they
do not prove the real integration.

==================================================
PART 29 — SAFE COMMANDS
==================================================

You may run:

- grep / rg
- read-only source inspection
- typecheck if necessary
- existing tests
- focused test suites
- git status
- git diff
- read-only database queries if safely configured

Do NOT run commands that alter application/database state.

Do NOT run migrations.

Do NOT modify files simply to make tests easier.

If a test itself mutates only a disposable test database, that is acceptable.

Never run destructive tests against a development/production/shared database.

==================================================
FINAL REPORT FORMAT
==================================================

Produce ONE detailed audit report with these sections:

# 1. Executive Summary

Top real problems and overall confidence.

# 2. Actual Authorization Architecture

Explain actual runtime architecture.

# 3. Roles and Permissions

Exact behavior.

# 4. Scope / Delegated Scope

Exact behavior.

# 5. Departments

Exact behavior.

# 6. Manage Access

Exact behavior and persistence model.

# 7. Effective Document Access Formula

UI/API/RAG comparison.

# 8. RAG Authorization / Retrieval Flow

End-to-end trace.

# 9. Why Authorized Users Can Receive "I Don't Know"

Rank actual possible causes based on repository evidence. This section MUST
directly address the confirmed reported symptom (document already indexed,
question unanswered) as its own ranked sub-list, not folded anonymously into
general causes.

# 10. Confirmed Bugs

Ordered by severity.

# 11. High-Confidence Risks

Not yet fully reproduced.

# 12. Security Findings

Especially cross-tenant/unauthorized access.

# 13. Availability / False-Denial Findings

Authorized users blocked incorrectly.

# 14. RAG Quality / Routing Findings

Authorization successful but retrieval/answer fails.

# 15. Cache / Staleness Findings

# 16. UI vs Backend Inconsistencies

# 17. Access Matrix

# 18. Existing Test Coverage Matrix

# 19. Missing Tests

# 20. Manual Reproduction Plan

Exact steps to reproduce each major issue, including a dedicated,
step-by-step reproduction of the confirmed reported symptom (Scenario 4)
using a specific real or fixture document ID.

# 21. Recommended Fix Order

P0 / P1 / P2 / P3.

Do NOT make code changes.

# 22. Files Reviewed

List the important files/modules inspected.

# 23. Commands / Tests Run

Include exact commands and pass/fail counts.

# 24. Uncertainties

Anything you could not prove.

==================================================
FINAL INSTRUCTION
==================================================

Be skeptical.

Do not say the system is correct because unit tests pass.

Trace actual runtime paths.

Look specifically for divergence between:

  document access authorization

and:

  RAG document filtering.

That divergence is one of the primary suspected causes.

Also distinguish very clearly between:

  User is unauthorized to the document

versus

  User is authorized but retrieval failed

versus

  Retrieval succeeded but intent/answer logic refused to use the evidence.

Given the confirmed reported symptom above, resolving "document already
indexed, question unanswered" to one of these three categories — with file
and line evidence — is the single most important outcome of this audit.

Do not fix anything.

Return the audit report only.
