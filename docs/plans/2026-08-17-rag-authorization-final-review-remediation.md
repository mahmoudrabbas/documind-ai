# RAG Authorization Final Review Remediation Plan

> **For the executing model:** REQUIRED WORKFLOW: use `superpowers:using-git-worktrees`, `superpowers:executing-plans`, `superpowers:test-driven-development`, and `superpowers:verification-before-completion`. Execute the tasks in order and stop at each review gate.

**Goal:** Close the two remaining review blockers in conflict handling and contextual follow-up routing, then produce truthful release verification.

**Architecture:** Keep the completed canonical authorization, provenance, retry, and conflict-evidence work unchanged. Add a trusted, code-enforced postcondition for conflict answers so prompt compliance is never the only protection. Narrow generic follow-up promotion so it requires evidence that the previous user turn was a document/RAG turn, not merely substantive text.

**Tech Stack:** TypeScript, Node test runner, Zod, Mongoose/MongoDB, the existing supervisor workflow, intent-query service, answer writer, and citation verifier.

---

## Current State

The following commits are already implemented and must be preserved:

- `5f026e6` - provenance tests establish same-run search provenance before evidence evaluation.
- `d249047` - conflicting authorized evidence reaches `conflict_explanation` instead of a generic refusal.
- `306aab2` - one bounded retry for `CANDIDATE_PROVENANCE_MISSING`, then `verification_failed`.
- `d78c8f5` - contextual follow-ups generalized beyond the remote-work special case.

Focused suites currently reported green:

- `authorizedRetrievalTools.test.ts`: 48/48
- `intentQuery.routing.test.ts`: 35/35
- `chat.productionWorkflow.e2e.test.ts`: 40/40
- `chatWorkflowService.test.ts`: 105/105
- workers: 154/154
- app: 1,146/1,146
- API typecheck, lint, and build pass

`npm run ci:validate` is still locally red on Windows at `POST /settings/logo`. The same failure was reproduced on baseline `379a5ea`, so it is pre-existing, but the branch must not be described as fully CI-validated until the complete gate passes in the target CI environment.

## Non-Negotiable Safety Rules

- Do not weaken the canonical document allowlist, final reauthorization, tenant isolation, same-run provenance, or fail-closed behavior.
- Never treat missing provenance, invalid conflict evidence, missing prior-turn classification, empty allowlists, or model uncertainty as permission to broaden retrieval.
- Never rely only on an LLM prompt to enforce a security or release invariant.
- Do not remove, skip, loosen, or replace existing security assertions merely to make tests pass.
- Do not change dependency manifests or lockfiles for local environment repairs.
- Preserve the untracked audit and implementation-plan Markdown files unless the user explicitly requests otherwise.
- Make new commits for these fixes. Do not amend or rewrite the four completed commits.
- Revert dependent commits only in reverse chronological order and re-run verification after each revert.
- Keep `RAG_CANONICAL_ALLOWLIST_MODE=deny_all` as the emergency runtime rollback. Never restore stale-metadata authorization.
- Do not run a migration apply command against shared or production data without explicit user approval after the tenant dry-run is reviewed.

## Task 1: Enforce No-Winner Conflict Answers in Trusted Code

**Files to inspect first:**

- `api/src/modules/agents/answerWriter.service.ts`
- `api/src/modules/agents/chatAgentIO.ts`
- `api/src/modules/agents/citationVerifier.service.ts`
- `api/src/modules/chat/chatWorkflowService.ts`
- `api/src/modules/chat/__tests__/chat.productionWorkflow.e2e.test.ts`
- Relevant conflict detector and evidence-gate types/tests

### Step 1: Add an adversarial failing E2E test

Add a conflict workflow test where the fake answer writer:

- mentions both conflicting values;
- cites both authorized conflicting chunk IDs;
- nevertheless declares one source/value authoritative, correct, newer, preferred, or the final answer without evidence that resolves the conflict.

Example adversarial output:

```text
Policy A says 1 day and Policy B says 2 days. Policy B is authoritative, so employees are allowed 2 days.
```

The test must prove the current implementation cannot release that winner claim merely because both citations are valid.

Expected safe behavior:

- release a deterministic unresolved-conflict answer that presents both supported positions without selecting a winner; or
- reject the writer output and route to a trusted conflict fallback that does the same.

Also assert:

- both conflicting positions remain visible;
- every conflicting source is cited and citation-verified;
- `outcome === "evidence_conflict"`;
- no knowledge-gap record is created;
- no unauthorized chunk or source is included.

Run the single test and confirm it fails for the expected reason before editing production code.

### Step 2: Implement a trusted conflict postcondition

The final release decision for `conflictExplanationMode` must not depend solely on the answer-writer instruction.

Preferred design:

1. Validate that the conflict evidence IDs belong to the current run's evaluated search batch and authorized evidence set. Preserve the existing checks.
2. Require every conflict evidence ID to survive citation verification.
3. Validate the conflict-specific writer result before release.
4. If the result selects or implies an unsupported winner, replace it with a deterministic unresolved-conflict response built only from validated conflict evidence and safe source metadata.
5. Support English and Arabic output.

The fallback must state that the authorized sources conflict, present each supported position separately, cite all conflicting sources, and avoid deciding which position controls. It must not invent dates, precedence, authority, policy status, or resolution rules.

Do not solve this by adding stronger prompt wording alone. A second unconstrained model call is also not a deterministic enforcement mechanism.

If a fully deterministic renderer cannot be built from the existing structured conflict artifacts, add the smallest structured artifact needed at the evidence boundary. Do not parse arbitrary prose with a fragile regex as the sole enforcement layer.

### Step 3: Add focused negative tests

Cover at least:

- writer cites both sources but selects one winner;
- writer omits one conflicting source;
- writer cites a chunk outside the current conflict set;
- Arabic writer output selects one side;
- compliant both-sides output still releases normally.

Run the focused conflict workflow and answer-writer/citation tests until green.

### Step 4: Commit Task 1

Commit only the conflict enforcement and its tests:

```text
fix(rag): enforce unresolved conflict answers before release
```

Before committing, run `git diff --check` and inspect the full diff for unrelated changes.

## Task 2: Require a Prior RAG Signal for Contextual Follow-Ups

**Files to inspect first:**

- `api/src/modules/intent-query/intentQuery.service.ts`
- `api/src/modules/intent-query/intentQuery.knowledgeSignals.ts`
- `api/src/modules/intent-query/ports/conversationContext.port.ts`
- `api/src/modules/intent-query/__tests__/intentQuery.routing.test.ts`
- `api/src/modules/intent-query/__tests__/intentQuery.service.test.ts`
- Conversation/message persistence code if it already stores trusted prior route metadata

### Step 1: Add failing negative routing tests

For each case, seed a substantive prior user/assistant exchange, then ask a short continuation such as `What about contractors?` or `And that limit?`.

The short continuation must not be deterministically promoted to RAG when the prior turn was:

- `external_current` or another current-world request;
- assistant identity/capability;
- unsupported/general conversation;
- social conversation;
- gibberish or malformed content.

Assert the final route and intent, not only the normalized question. Where provider output is malformed or unavailable, prove the deterministic fallback also stays source-less.

Run the focused tests and confirm they fail because `hasSubstantivePriorTurn` is currently too broad.

### Step 2: Introduce a conservative prior-turn RAG predicate

Replace the current condition:

```text
isLikelyContextualFollowUp(current) && hasSubstantivePriorTurn(previous)
```

with a condition that also proves the prior turn was document/RAG-oriented.

Use the strongest trusted signal already available in the repository, in this order:

1. persisted prior query-plan route/intent associated with the same tenant, actor, and conversation;
2. trusted message metadata that records the prior RAG route;
3. a conservative deterministic prior-turn predicate built from existing document/enterprise knowledge signals and authorized document-title hints.

Do not infer prior RAG status from assistant answer prose. Do not use `hasDomainAgnosticQuestionShape` or `hasSubstantivePriorTurn` alone; both are too broad. If no reliable prior RAG/document signal can be established, do not activate the deterministic bridge and allow normal routing/clarification behavior.

Any new lookup must be tenant-scoped, actor-scoped where applicable, bounded, and fail closed on dependency errors. Do not add cross-tenant conversation or trace access.

### Step 3: Preserve positive generic follow-ups

Keep positive tests for document topics across multiple domains and provider outcomes:

- travel: hotel limit;
- procurement: purchase-order or approval threshold;
- onboarding: required step/document;
- remote work or leave;
- Arabic continuation markers.

For each positive case assert:

- route is RAG;
- intent is `follow_up`;
- normalized question retains the prior document subject and current qualifier;
- no title/document restriction is broadened;
- provider `unsupported`, malformed output, or timeout cannot turn the valid follow-up into a 502.

### Step 4: Commit Task 2

Commit only the follow-up gate and its tests:

```text
fix(rag): require prior document intent for contextual follow-ups
```

Before committing, run `git diff --check` and inspect the full diff.

## Task 3: Final Verification and Release Handoff

Run fresh verification from the implementation worktree. Do not reuse previous output.

At minimum run:

```powershell
npm run test --workspace api -- src/modules/agents/tools/authorizedRetrievalTools.test.ts
npm run test --workspace api -- src/modules/intent-query/__tests__/intentQuery.routing.test.ts
npm run test --workspace api -- src/modules/intent-query/__tests__/intentQuery.service.test.ts
npm run test --workspace api -- src/modules/chat/__tests__/chat.productionWorkflow.e2e.test.ts
npm run test --workspace api -- src/modules/chat/__tests__/chatWorkflowService.test.ts
npm run typecheck:api
npm run lint
npm run build
npm run ci:validate
```

Also run the worker and app suites if `ci:validate` does not reach them because an earlier check fails.

### Release gate

- Obtain a green complete gate in the target Linux CI environment before approval.
- If local Windows `ci:validate` still fails only at `POST /settings/logo`, report it exactly as a baseline-reproduced environment issue.
- Do not write `CI passes`, `fully validated`, or `ready for rollout` while the only complete gate run is red.
- Record command, environment, exit code, and test counts in the final handoff.

### Migration before rollout

Run per tenant, dry-run first:

```powershell
npm run migrate:policy:use-in-ai --workspace api -- --tenant-id <TENANT_OBJECT_ID>
```

Review and record `would_migrate`, then use the same tenant ID only after explicit approval:

```powershell
npm run migrate:policy:use-in-ai:apply --workspace api -- --tenant-id <TENANT_OBJECT_ID>
```

### Final report requirements

The final report must include:

- new commit hashes and dependencies;
- exact changed files;
- focused and full verification results;
- whether the adversarial conflict test proves prompt-independent enforcement;
- whether all negative prior-turn routing cases remain non-RAG;
- migration status per tenant;
- remaining known risks;
- rollback instructions, including reverse-order commit reverts and `RAG_CANONICAL_ALLOWLIST_MODE=deny_all`.

## Approval Criteria

Do not request approval until all are true:

- An adversarial conflict writer cannot cause a winner claim to be released.
- The trusted conflict path still presents both positions and all authorized conflicting citations.
- Generic contextual follow-ups require a prior document/RAG signal.
- Negative external, assistant, unsupported, social, and gibberish histories do not promote continuations to RAG.
- Existing authorization, provenance, bounded retry, tenant isolation, and fail-closed tests remain green.
- A complete target-environment CI gate is green, or the handoff explicitly states that approval is blocked pending that gate.
