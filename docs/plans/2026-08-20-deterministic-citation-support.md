# Deterministic Citation Support Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prevent semantic-model false negatives from discarding answers whose complete factual content is directly present in an authorized cited chunk.

**Architecture:** Add an ordered verbatim-span matcher for isolated prompt-marked shell/code lines to the semantic citation service and run it after deterministic contradiction detection but before LLM verification. Directly supported command claims receive the single supporting chunk ID; prose and context-sensitive claims retain the existing semantic verification, retry, budget, and fail-closed behavior. Parse only complete plain or Markdown-fenced JSON provider envelopes.

**Tech Stack:** TypeScript, Node test runner, Zod, existing citation semantic verification service.

---

### Task 1: Reproduce the False Negative

**Files:**
- Modify: `api/src/modules/agents/citationSemanticVerification.service.test.ts`

**Step 1: Write the failing production regression**

Add a test using the exact failed answer and evidence chunk. Configure the scripted model to return `unsupported` for every claim. Assert that the result is `SEMANTIC_VERIFIED`, releases the original answer, cites `mysql-install`, and makes zero model calls because every claim is directly supported.

**Step 2: Add the fail-closed companion assertion**

Add a second test with `sudo systemctl restart mariadb` appended. Assert that it is not released, the unsupported claim is reported, and the model is called because the added command is not directly present in evidence.

Add regressions for negated, historical, quoted, and example-only command mentions, plus commands split across separate evidence chunks. Each must reach semantic verification and fail closed when the scripted verifier rejects it.

Add regressions for the exact natural-language command answer and a provider response wrapped in a complete Markdown JSON fence.

**Step 3: Run the focused tests and verify RED**

Run:

```powershell
npm.cmd run test --workspace api -- src/modules/agents/citationSemanticVerification.service.test.ts
```

Expected: the direct-support test fails because the semantic model's false negative still controls the result.

### Task 2: Implement Deterministic Direct Support

**Files:**
- Modify: `api/src/modules/agents/citationSemanticVerification.service.ts`

**Step 1: Add direct-support normalization**

Create a private helper that recognizes only isolated prompt-marked shell/code lines, strips their prompt decoration, lowercases text, normalizes punctuation and hyphen variants, and returns command tokens without changing factual words or numbers. Add a separate exact-template matcher for quoted/backticked command literals in natural-language distribution instructions.

**Step 2: Add ordered span coverage**

Create a helper that checks whether all command-starting claim tokens are covered by ordered contiguous evidence-line spans. Permit only `and` and `then` between spans. Require at least three tokens per partial span, while allowing an exact contiguous match for a complete short command. Do not flatten prose or cross line boundaries.

Add a bounded JSON-envelope parser that accepts plain JSON or one complete fenced JSON block, and returns unknown judgments for all other representations.

**Step 3: Return one sufficient evidence ID**

Check each evidence chunk independently and return the first chunk ID that completely supports the claim. Do not merge support across chunks.

**Step 4: Integrate before semantic verification**

In `verificationPass`, keep numeric contradiction detection first. Mark a directly supported claim as `SUPPORTED` with the deterministic evidence ID. Add only unmatched claims to the semantic provider batch.

**Step 5: Run focused tests and verify GREEN**

Run the command from Task 1. Expected: both tests pass, the supported case makes zero provider calls, and the unsupported extension reaches the provider and fails closed.

### Task 3: Verify Existing Contracts

**Files:**
- Test: `api/src/modules/agents/citationSemanticVerification.service.test.ts`
- Test: `api/src/modules/agents/citationVerificationAgent.supervisor.test.ts`

**Step 1: Run the semantic verifier suite**

```powershell
npm.cmd run test --workspace api -- src/modules/agents/citationSemanticVerification.service.test.ts
```

Expected: PASS.

**Step 2: Run citation-agent integration tests**

```powershell
npm.cmd run test --workspace api -- src/modules/agents/citationVerificationAgent.supervisor.test.ts
```

Expected: PASS.

**Step 3: Run API typecheck and targeted lint**

```powershell
npm.cmd run typecheck:api
npm.cmd run lint --workspace api -- --no-warn-ignored src/modules/agents/citationSemanticVerification.service.ts src/modules/agents/citationSemanticVerification.service.test.ts
```

Expected: PASS.

### Task 4: Clean Diagnostic Artifacts and Review the Diff

**Files:**
- Delete: `api/.tmp-diagnose-retrieval.mts`

**Step 1: Remove the temporary read-only diagnostic script**

Delete only `api/.tmp-diagnose-retrieval.mts`. Leave the pre-existing untracked `api/photo/` directory untouched.

**Step 2: Inspect scoped changes**

```powershell
git diff -- docs/plans/2026-08-20-deterministic-citation-support-design.md docs/plans/2026-08-20-deterministic-citation-support.md api/src/modules/agents/citationSemanticVerification.service.ts api/src/modules/agents/citationSemanticVerification.service.test.ts
git status --short
```

Expected: only the citation fix, its tests, its documentation, the prior intentional user changes, and `api/photo/` remain.
