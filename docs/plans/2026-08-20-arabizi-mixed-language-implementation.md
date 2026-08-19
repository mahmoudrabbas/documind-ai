# Arabizi Mixed-Language Stability Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Stabilize Arabizi response-language detection and preserve Arabizi/Arabic numeric eligibility anchors through the existing intent and threshold pipelines.

**Architecture:** Extend the current conservative language detector with a bounded structural token signal, then extend the existing numeric normalization/unit/rate tables. Keep routing, retrieval, authorization, and Answer Writer ownership unchanged.

**Tech Stack:** TypeScript, Node test runner, repository API test runner.

---

### Task 1: Language Detection Regression

**Files:**
- Modify: `api/src/modules/intent-query/__tests__/intentQuery.languageDetector.test.ts`
- Modify: `api/src/modules/intent-query/intentQuery.languageDetector.ts`

**Step 1: Write the failing test**

Add assertions that the representative Arabizi questions are detected as
Arabic while ordinary English and technical identifiers remain English.

**Step 2: Run test to verify it fails**

Run: `cd api; ../scripts/run-api-tests.mjs src/modules/intent-query/__tests__/intentQuery.languageDetector.test.ts`

Expected: FAIL because the one-dictionary-hit Arabizi questions currently
detect as English.

**Step 3: Write minimal implementation**

Add a helper that recognizes a Latin token of at least four characters with
one Arabizi substitution digit between letters. Count it alongside existing
dictionary hits while preserving the two-hit threshold and explicit technical
identifier exclusions.

**Step 4: Run test to verify it passes**

Run the same focused command. Expected: all language detector tests pass.

### Task 2: Numeric Anchor Regression

**Files:**
- Modify: `api/src/modules/agents/thresholdSemantics.test.ts`
- Modify: `api/src/modules/agents/thresholdSemantics.ts`

**Step 1: Write the failing tests**

Add assertions for `30 yom`, `2 days fel week`, Arabizi hour/week/month/year
units, and Arabic dual day/hour/month/year forms. Assert both extracted values
and threshold comparison behavior.

**Step 2: Run tests to verify they fail**

Run: `cd api; ../scripts/run-api-tests.mjs src/modules/agents/thresholdSemantics.test.ts`

Expected: FAIL because `yom` is a count noun, `fel week` has no recurrence
period, and Arabic dual forms produce no mention.

**Step 3: Write minimal implementation**

Extend `NUMBER_PATTERN` and `normalizeUnit` with bounded Arabizi units, extend
the recurrence marker and period noun table, and normalize Arabic dual unit
forms to explicit `2` quantities before extraction.

**Step 4: Run tests to verify they pass**

Run the same focused command. Expected: all threshold tests pass.

### Task 3: Focused Regression Verification

**Files:**
- No production changes unless a focused regression proves a defect.

**Step 1: Run intent and writer suites**

Run the repository test runner for language preprocessing, routing, knowledge
signals, service behavior, threshold semantics, and Answer Writer.

**Step 2: Run TypeScript typecheck**

Run: `npx tsc -p api/tsconfig.json --noEmit`

**Step 3: Review diff and commit**

Run `git diff --check`, inspect the complete diff, and commit the Issue #2 fix
as `fix: stabilize arabizi and mixed-language routing`.

