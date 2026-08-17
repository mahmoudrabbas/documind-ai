# Guide + Action Agent — Review 1

## 1. Executive Summary

**Overall quality: NOT production-ready. The feature is non-functional, does not compile, and is not wired into the application.** It is a backend-only skeleton (~4,000 LOC under `api/src/modules/copilot/`) that was never integrated, never executed, and has zero tests. The frontend specified throughout `guider.md` (Guide overlay, Action panel, `data-guide-id` instrumentation, providers, socket lifecycle) **does not exist at all**.

**Safe to merge? No.** Multiple CRITICAL blockers:
- The module **does not compile** (wrong argument counts, a missing module `api/src/lib/i18n`, a duplicate import, and inconsistent relative-import depths).
- The `/copilot` routes are **never mounted** in `api/src/app.ts` and the runtime is **never initialized**, so every endpoint is dead code.
- The core runtime path is architecturally broken: the classifier's output is fed to `parseSupervisorDecision`, which **rejects it every time**, so no guide/action ever runs.
- Action Mode **cannot execute any tool**; the confirmation endpoint is misrouted to the **legacy** `resumeAgentRun` (different tool registry, no approval record ever created).
- Two competing `SupervisorRuntime` composition roots exist, both of which **bypass the runtime's handoff/guardrail/tool-execution machinery** by invoking executors manually inside the `model.decide` callback.

**Most important risks:** (1) the deterministic authorization boundary the plan promises is **not in the execution path** (`permissions: []` is hardcoded and `evaluatorReauthorize` is never wired) — currently latent only because tools are never executed; (2) destructive actions have **no working confirmation gate**; (3) there is **no test evidence** for any security property.

**Mitigating fact (accuracy):** because the action tools wrap the existing services (`documents.service`, `users.service`, `settings.service`) which independently enforce `authorizeDocumentAction` / `authorizeTenantOperation` + tenant scoping + audit, there is **no live cross-tenant exploit today** — both because execution never happens and because the wrapped services remain authoritative. The finding is that the copilot layer's *own* deterministic guard is absent, not that tenant isolation is breached.

## 2. Review Scope

- **Spec:** `guider.md` (read in full).
- **Backend inspected (all read line-by-line):** `api/src/modules/copilot/**` — `copilot.routes.ts`, `copilot.controller.ts`, `copilot.service.ts`, `copilot.validator.ts`, `copilotComposition.ts`, `index.ts`, `agents/copilotSupervisor.ts`, `agents/platformGuideAgent.ts`, `agents/platformActionAgent.ts`, `guide/guide.contracts.ts`, `guide/guideTargets.ts`, `guide/guideFlows.ts`, `guide/guide.service.ts`, `action/action.contracts.ts`, `action/reauthorize.ts`, `action/registerActionTools.ts`, `action/tools/{documentTools,userTools,settingsTools}.ts`.
- **Modified existing files inspected (via `git diff`):** `api/src/modules/agents/{agents.service.ts,chatAgents.ts,chatWorkflow.ts,tools/authorizedRetrievalTools.ts}`, `package.json`, `package-lock.json`.
- **Existing infra cross-checked:** `agents/supervisorRuntime.ts`, `agents/supervisorDecision.ts`, `agents/agentExecutionContext.ts`, `agents/toolRegistry.ts`, `agents/agents.types.ts`, `agents/agents.service.ts`, `permissions/permissions.operation.ts`, `permissions/permissions.evaluator.ts`, `documents/documents.service.ts`, `app.ts`.
- **Integration checks:** route registration in `app.ts` (absent), initializer callers (absent), frontend `app/src/**` (no copilot/guide code; `data-guide-id` count = 0).
- **Tests inspected:** `api/src/modules/copilot/__tests__/` — **empty directory**.
- **Commands:** `git status --short` (ran; see below). `npm run typecheck` / `tsc --noEmit` / `npm run lint` — **could not execute** (this session's sandbox command-safety classifier was intermittently unavailable and refused to run build commands). Read-only inspection of all source, `git status`, and `grep` succeeded. Package manager = **npm workspaces**; scripts: `typecheck`, `typecheck:api`, `lint`, `test`, `build`, `ci:validate`. Compile failures below are established by static analysis with exact citations; **OpenCode MUST run the build to enumerate the full list**.

`git status --short` (pre-existing changes — DO NOT revert):
```
 M api/src/modules/agents/agents.service.ts
 M api/src/modules/agents/chatAgents.ts
 M api/src/modules/agents/chatWorkflow.ts
 M api/src/modules/agents/tools/authorizedRetrievalTools.ts
 M package-lock.json
 M package.json
?? api/src/modules/copilot/
```

## 3. Critical Findings

### [CRITICAL] FINDING-001 — The copilot module does not compile
**Location:** `api/src/modules/copilot/` (multiple files; representative lines below)
**Problem:** Several categories of guaranteed TypeScript / module-resolution errors:
1. **Wrong argument count** — `assertNoTrustedContextFields` is exported as `(input: unknown, toolName: string)` (`api/src/modules/agents/tools/authorizedRetrievalTools.ts:177`), but every call passes one argument: `documentTools.ts:92,150,204,254,297,335,376`, `userTools.ts:77,118,157,194,249`, `settingsTools.ts:102`.
2. **Missing module** — `guide/guide.service.ts:3` imports `getDirection` from `../../../lib/i18n/index.js`, which resolves to `api/src/lib/i18n` — **this directory does not exist** (the i18n lib lives in `app/src/lib/i18n`). Confirmed: `ls api/src/lib/i18n` → "No such file or directory".
3. **Duplicate import** — `guide/guideTargets.ts:174` re-imports `GuideTargetRegistry, GuideTargetRegistryEntry` already imported at line 2 (and the statement is placed after executable code) → redeclaration error.
4. **Inconsistent relative-import depths** — within a single file: `copilot.controller.ts:6` uses `../agents/agents.service.js` (correct → `modules/agents`) but `copilot.controller.ts:13` uses `../../agents/chatWorkflow.js` (resolves to `api/src/agents`, wrong) and `copilot.controller.ts:1` uses `../common/errors/AppError.js` (resolves to `api/src/modules/common`, wrong — should be `../../common`). `copilot.service.ts` and `copilotComposition.ts` import agents via `../../agents/...` (→ `api/src/agents`, wrong) and providers via `../../../../providers/...` (→ repo-root `providers`, wrong).
5. **Likely zod signature error** — `copilot.validator.ts:17` uses `z.record(z.unknown())` (single arg); the repo's zod version is used elsewhere as `z.record(z.string(), z.unknown())` (`agents/agents.types.ts:273`).
**Evidence:** Static resolution of the paths above against the real tree (`api/src/modules/agents`, `api/src/common`, `api/src/providers`). `assertNoTrustedContextFields` signature confirmed at `authorizedRetrievalTools.ts:177-180`.
**Impact:** The feature cannot build; `npm run build` / `npm run typecheck` fail; nothing ships.
**Required Fix:** Run `npm run typecheck:api` and fix every error. Specifically: pass a `toolName` string to every `assertNoTrustedContextFields` call; create/point `getDirection` to a real API-side helper (do NOT import from `app/`; add a small `api/src/common/i18n/direction.ts` or inline `locale === "ar" ? "rtl" : "ltr"`); delete the duplicate import in `guideTargets.ts`; correct all relative import depths (`../../common`, `../agents`, `../../providers` as appropriate per file location); use the two-arg `z.record` form.
**How to Verify:** `npm run typecheck` and `npm run build` complete with zero errors; add a CI assertion that the copilot module is part of the compiled output.

### [CRITICAL] FINDING-002 — Feature is never wired in: routes unmounted, runtime never initialized, context fails normalization
**Location:** `api/src/app.ts` (no copilot import/mount); `api/src/modules/copilot/copilot.service.ts:68` (`initializeCopilotService`) & `copilotComposition.ts:23` (`initializeCopilotRuntime`) — never called; `copilot.controller.ts:48`.
**Problem:** (a) `grep copilot api/src/app.ts` → nothing; the router in `copilot.routes.ts` is never `app.use`-d, so all `/copilot/*` endpoints are unreachable. (b) Neither initializer is called anywhere outside the module (`grep initializeCopilot* … | grep -v modules/copilot` → none), so `copilotRuntime` is `null` and `getCopilotRuntime()` / `processCopilotMessage` throw `"Copilot runtime not initialized"`. (c) `buildExecutionContext` sets `conversationId: uuidv4()` (`copilot.controller.ts:48`), but `AgentExecutionContext.conversationId` is validated by `objectIdSchema` in `normalizeAgentExecutionContext` (`agents/agentExecutionContext.ts`); a UUID is not a 24-hex ObjectId, so `SupervisorRuntime.execute` throws during context normalization.
**Evidence:** `app.ts` route-mount list (lines ~175-208, plus retrieval/chat) contains no `/copilot`. Initializer call-site grep empty. `agentExecutionContextSchema` requires `conversationId: objectIdSchema`.
**Impact:** In production the entire feature is dead code; if it were mounted it would throw immediately (uninitialized runtime, then invalid-context error). 100% non-functional.
**Required Fix:** Mount the router in `app.ts` (`app.use("/copilot", copilotRoutes)`), gated by a `COPILOT_ENABLED` flag (FINDING-016); call the single canonical initializer during startup wiring (after `getModelAdapter()` and storage/deps are constructed, alongside `registerAuthorizedRetrievalTools` at `app.ts:272`). Use a real ObjectId for `conversationId` (persist/lookup a copilot conversation, or relax the schema deliberately for copilot runs — but do not send a UUID into an ObjectId field).
**How to Verify:** Integration test that boots the app, calls `POST /copilot/message` with a valid token, and asserts a 200 with a `mode` in the body (not a 500). Assert `app.ts` mounts the route.

### [CRITICAL] FINDING-003 — SupervisorRuntime is bypassed; two competing composition roots duplicate it
**Location:** `api/src/modules/copilot/copilot.service.ts:97-194` and `api/src/modules/copilot/copilotComposition.ts:55-163` (both build a `SupervisorRuntime` whose `model.decide` manually calls executors).
**Problem:** `guider.md` §3/§30 mandate driving agents through `SupervisorRuntime`'s handoff → executor → guardrail → output-schema pipeline. Instead, the `decide` callback (in BOTH files) directly invokes `platformGuideAgent.execute(...)` / `actionAgent.execute(...)` and returns `{action:"complete", result: <executor output>}`. Consequences: (a) the runtime's `executeHandoff` path, `validateAgentHandoff`, `OutputSchemaGuardrail`, per-handoff budgets, and — crucially — `executeToolCall`/`ToolRegistry.execute` are **never reached**; (b) `executorRegistry.register(...)` and the `allowedHandoffs` DAG in `createCopilotWorkflowRegistry` are effectively dead; (c) there are **two** initializers building near-identical runtimes (`initializeCopilotService` vs `initializeCopilotRuntime`), the exact "duplicated competing agent runtime" the brief warns against. `copilotComposition.ts:73` even re-creates a second `ToolRegistry` and action agent per `decide` call.
**Evidence:** `copilot.service.ts:114-146` and `copilotComposition.ts:82-147` invoke `.execute(...)` inside `decide` and emit `action:"complete"`; no `tool_call` decision is produced anywhere in the module (`grep toolRegistry.execute api/src/modules/copilot` → none).
**Impact:** Severe architectural bypass. All runtime-level safety (tool permission guardrail, sensitive-action approval, budgets, output validation) is skipped. Action tools' `requiredPermission`/`approvalRequired` metadata is never enforced by the runtime.
**Required Fix:** Use one composition root. Make `copilot-supervisor` emit a valid `handoff` decision to `platform-guide-agent` / `platform-action-agent` (see FINDING-004). Let the runtime perform the handoff and run executors. For actual execution, the action agent must emit a `tool_call` decision so the runtime's `executeToolCall` runs the tool through `ToolRegistry.execute(..., reauthorize)` (see FINDING-006). Delete the duplicate initializer; keep exactly one (recommend `copilotComposition.ts`) and have `copilot.service.ts` consume it.
**How to Verify:** Unit test with `InMemorySupervisorPersistence` + `FakeModelAdapter` asserting a run produces persisted `agentStep` handoff + `agentToolCall` records, and that a tool with `requiredPermission` is denied when the evaluator denies.

### [CRITICAL] FINDING-004 — Classifier output is not a valid SupervisorDecision → every run fails
**Location:** `api/src/modules/copilot/copilot.service.ts:104-112` & `copilotComposition.ts:62-69`; contract `agents/supervisorDecision.ts` (`parseSupervisorDecision`); classifier `agents/copilotSupervisor.ts:107-132`; `action/action.contracts.ts:71-77`.
**Problem:** For `currentAgent === "copilot-supervisor"`, `decide` returns `JSON.stringify(classifierDecision)` where the shape is `{mode, confidence, flowIdHint, toolNameHint, reasonCode}` (`classifierDecisionSchema`). But `SupervisorRuntime.runStep` passes `content` to `parseSupervisorDecision`, which requires a **strict discriminated union on `action`** (`handoff|tool_call|complete|fail|await_approval`). The classifier object has **no `action` field**, so parsing throws `SUPERVISOR_DECISION_INVALID` on the very first step.
**Evidence:** `supervisorRuntime.ts` calls `parseSupervisorDecision(content.content)` then checks `supervisorDecisionCurrentAgent`. `classifierDecisionSchema` (`action.contracts.ts:71`) contains no `action`. `copilotSupervisor.ts:108` returns the raw decision.
**Impact:** Core workflow is 100% broken even after FINDING-001/002 are fixed: `processCopilotMessage` always lands in the `else` branch and returns `mode: "clarify"`; guide and action never run.
**Required Fix:** Map the classifier decision to a real `SupervisorDecision` before returning from `decide`: `guide` → `{action:"handoff", currentAgent:"copilot-supervisor", nextAgent:"platform-guide-agent", payload:{utterance, locale, flowIdHint}, reasonCode}`; `action` → handoff to `platform-action-agent`; `clarify` → `{action:"complete", result:{mode:"clarify", ...}}`. Ensure the downstream agents emit their own valid decisions (or let the runtime run them as executors via handoff).
**How to Verify:** Unit test asserting `POST /copilot/message` with "how do I upload a document?" yields `mode:"guide"` with a non-empty `guideSession`, and "archive this document" yields `mode:"action"` with an `actionPlan` — using a `FakeModelAdapter` that returns each classifier branch.

### [CRITICAL] FINDING-005 — Action execution & confirmation are broken and misrouted to the legacy runtime
**Location:** `api/src/modules/copilot/agents/platformActionAgent.ts:138-165` (plan only, no execution); `copilot.controller.ts:203-210` (`resumeAgentRun` from legacy `agents.service`); `agents/agents.service.ts` (`resumeAgentRun`/`resumeApprovedAction` use the legacy module-level tool registry).
**Problem:** (a) `platformActionAgent.execute` only **builds an `ActionPlan`** and returns it; it never emits a `tool_call` and no code path calls `ToolRegistry.execute` for copilot tools, so **no action is ever executed**. (b) The plan sets `requiresConfirmation` but nothing ever calls `createApproval`/`awaitApproval`, so **no `agentApproval` record is created**. (c) The confirm endpoint (`copilot.controller.ts:203`) calls the **legacy** `resumeAgentRun` (imported from `../agents/agents.service.js`), which resumes via the **legacy module-level `toolRegistry`** (fake/retrieval/summarize/analytics tools) — the copilot action tools are registered on a *separate* `ToolRegistry` instance and are invisible there. It also reads `req.body.approvalId` (not from the validated schema) and there is no approval to resume, so it 404s.
**Evidence:** `platformActionAgent.ts:138-154` returns `output.actionPlan`; `grep createApproval api/src/modules/copilot` → none; `copilot.controller.ts:6` imports `resumeAgentRun` from legacy service; `agents.service.ts` `resumeApprovedAction` executes against the module-level `toolRegistry`.
**Impact:** Action Mode is entirely non-functional end-to-end. If a future fix wires execution but keeps this confirm path, destructive tools could run through the legacy `combinedReauthorize` path (which, per the modified `agents.service.ts`, does route `document.*/user.*/settings.*` through the real evaluator — but only if those tools are registered in the legacy registry, which they are not).
**Required Fix:** Drive execution through the copilot `SupervisorRuntime`: action agent emits `tool_call`; runtime `executeToolCall` runs the tool and, for `approvalRequired` tools, the `SensitiveActionGuardrail`/`await_approval` path creates the `agentApproval`. Route confirmation through the **copilot** runtime's approval/resume (reuse `SupervisorRuntime`'s awaiting_approval + a copilot-owned resume that uses the copilot `ToolRegistry`), or explicitly register the copilot tools on whatever registry the resume path uses. Read `approvalId` from the validated body (`copilotActionConfirmSchema` already has it — controller must use `parseResult.data.approvalId`, not `req.body.approvalId`).
**How to Verify:** E2E: "permanently delete this document" → plan with `requiresConfirmation:true` + a real `approvalId`; confirm(approve) → the document is actually soft/permanently deleted (assert DB state) AND an `audit_logs` `DOCUMENT_*` row exists; confirm(reject)/timeout → no deletion.

## 4. High Findings

### [HIGH] FINDING-006 — Deterministic authorization is not in the copilot execution path
**Location:** `copilot.controller.ts:50` (`permissions: []`); `action/reauthorize.ts` (`evaluatorReauthorize` defined, never used by the runtime); `supervisorRuntime.ts` tool reauthorize closure (`(permission) => (context.permissions ?? []).includes(permission)`).
**Problem:** The runtime authorizes tools by checking `context.permissions`, but the controller hardcodes `permissions: []`. So if tool execution were wired through the runtime (FINDING-003/005), **every permissioned tool would be denied**. The real evaluator wrapper `evaluatorReauthorize`/`createRunContextReauthorize` (`action/reauthorize.ts`) is never passed to `ToolRegistry.execute`. The plan (§7.1, §12) requires re-authorization via the real evaluator inside deterministic code.
**Evidence:** `reauthorize.ts:40` exports `createRunContextReauthorize` but `grep createRunContextReauthorize … | grep -v reauthorize.ts` → no callers; `supervisorRuntime.executeToolCall` builds its own reauthorize from `context.permissions`.
**Impact:** The plan's central security guarantee ("deterministic guard authorizes, not the LLM") is absent from the execution path. Latent only because execution never happens today. Mitigation: wrapped services still enforce authz, so no live breach — but the copilot layer must not rely on that alone.
**Required Fix:** Either populate `context.permissions` with the actor's real effective permissions (from `getPermissionEvaluator`) before running, or (preferred) have the copilot runtime execute tools with a reauthorize callback backed by `evaluatorReauthorize`/`authorizeTenantOperation`. Keep the wrapped-service authz as defense-in-depth.
**How to Verify:** Test: an `EMPLOYEE` invoking `user.delete` is denied at the copilot layer (tool reauthorize returns false) AND at the service layer; a `COMPANY_ADMIN` is allowed.

### [HIGH] FINDING-007 — Entire frontend is missing
**Location:** `app/src/**` (no copilot/guide code); `guider.md` §5, §6.5, §9, §10, §23 (frontend cluster).
**Problem:** None of the specified UI exists: no `CopilotPanel`/`CopilotLauncher`, no `GuideOverlay`/spotlight/arrow/tooltip, no `GuideProvider`/`CopilotProvider`, no `copilot.service.ts` client, no `useCopilotSocket`, and **zero `data-guide-id` attributes** in the app (`grep -r data-guide-id app/src` → nothing; only one `data-testid` exists repo-wide). The guide-target registry (`guide/guideTargets.ts`) references anchors like `documents-upload-button` that exist on **no DOM element**.
**Evidence:** `find app/src -iname '*copilot*' -o -iname '*guide*'` → empty; `grep -rn data-guide-id app/src` → empty.
**Impact:** Guide Mode cannot highlight anything; Action Mode has no UI; the feature is invisible to users. A backend "guide session" is meaningless without instrumented targets.
**Required Fix:** Implement the frontend per `guider.md` §23: providers, portal overlay (z-index > 80), `data-guide-id` instrumentation on nav (`app/src/constants/routes.ts`) + the buttons/inputs in the target registry, `copilot.service.ts`, RTL via `useI18n().dir`, socket lifecycle. Add the registry↔DOM parity test (§10/§20).
**How to Verify:** Playwright E2E: guide upload flow highlights the real upload button and advances on click; RTL mirroring verified in Arabic.

### [HIGH] FINDING-008 — Zero tests; empty `__tests__`, no eval dataset
**Location:** `api/src/modules/copilot/__tests__/` (empty); `guider.md` §20, §21.
**Problem:** No unit, contract, authorization, tenant-isolation, confirmation, injection, or integration tests; no `eval.dataset.ts`. Nothing proves any security or functional property.
**Evidence:** `ls api/src/modules/copilot/__tests__` → empty.
**Impact:** No regression protection; the CRITICAL bugs above would have been caught by even a single integration test.
**Required Fix:** Add the test suite from `guider.md` §20 (using `FakeModelAdapter`, `InMemorySupervisorPersistence`, fake service deps) and the §21 evaluation dataset. Prioritize: supervisor-decision routing, tool authz denial, tenant-isolation (cross-tenant id → not-found), confirmation enforcement, injection → no tool call.
**How to Verify:** `npm run test:api` runs copilot tests; coverage includes the deterministic guard and confirmation path.

### [HIGH] FINDING-009 — No working confirmation gate for destructive actions
**Location:** `platformActionAgent.ts:135` (`requiresConfirmation = tool.schema.approvalRequired`); no `createApproval` anywhere; `copilot.controller.ts:183-216`.
**Problem:** Destructive tools (`document.softDelete`, `document.permanentDelete`, `user.delete`) are flagged `approvalRequired: true`, and the plan surfaces `requiresConfirmation:true`, but there is no mechanism that actually blocks execution pending approval — no `agentApproval` is created, and (per FINDING-005) execution never routes through the runtime's `await_approval` path.
**Evidence:** `grep -rn "createApproval\|awaitApproval\|approvalRequired" api/src/modules/copilot` → only schema flags, no creation.
**Impact:** Once execution is wired, without this gate destructive actions could execute immediately. This is the "confirmation for destructive/irreversible" guarantee (`guider.md` §7, §11, §27) being unmet.
**Required Fix:** Route destructive tools through the runtime `await_approval` → `agentApproval` (contextHash + expiresAt TTL) → copilot confirm/resume, exactly as `guider.md` §7.1/§11 specify. Enforce the ambiguous-destructive → clarify rule in code (already present in the classifier post-process — keep it).
**How to Verify:** Test: destructive tool call creates a pending approval and does NOT mutate until an approve resume; expired/rejected approval never mutates; contextHash mismatch is rejected.

## 5. Medium Findings

### [MEDIUM] FINDING-010 — Guide localization is a no-op (raw i18n keys returned)
**Location:** `guide/guide.service.ts:16-18` (`localize` returns the key unchanged); used at `guide.service.ts:79-80`.
**Problem:** `GuideStep.title`/`instruction` are set to the raw `titleKey`/`instructionKey` (e.g. `"guide.documents.upload.step1.title"`), never localized to EN/AR. `guider.md` §6.4 requires server-side localization by `context.locale`.
**Impact:** Users see translation keys, not text; AR/EN parity claim is false.
**Required Fix:** Implement real localization (API-side dictionary or shared strings) keyed by locale; return localized strings.
**How to Verify:** Test asserts localized text differs for `en` vs `ar` and contains no `.` key artifacts.

### [MEDIUM] FINDING-011 — Intent matching is brittle keyword logic with copy-paste noise (not the strict-JSON decision the plan requires)
**Location:** `agents/platformActionAgent.ts:169-199` (`inferToolFromUtterance`), `agents/platformGuideAgent.ts:142-164` (`matchFlowToUtterance`), `agents/copilotSupervisor.ts:134-196` (fallback).
**Problem:** Tool/flow selection relies on hardcoded substring keyword lists that include **stray Chinese tokens** ("搜索","归档","建筑基地","聊天","म用户新","可以你") — clear copy-paste errors — mixed into EN/AR handling. This diverges from `guider.md` §7/§8 (LLM proposes an enumerated `toolName`/`flowId`, deterministically validated). `document.softDelete` is chosen for any "delete" (so plain "delete this" is treated as destructive-soft-delete without the LLM's `toolNameHint`).
**Impact:** Unreliable classification; maintainability risk; unexpected behavior for multilingual input.
**Required Fix:** Prefer the classifier's `toolNameHint`/`flowIdHint` (validated against the registry) and remove the erroneous non-Arabic/non-English keyword tokens; keep a minimal deterministic fallback only.
**How to Verify:** Eval dataset (§21) covers EN/AR/mixed and asserts correct tool/flow selection.

### [MEDIUM] FINDING-012 — Action plan target is never resolved or validated
**Location:** `agents/platformActionAgent.ts:150` (`target: { type: "document", id: "", label: "" }`).
**Problem:** The plan hardcodes an empty target; it never extracts a `documentId`/`targetUserId` from the utterance/toolInput, never loads it tenant-scoped, and never validates existence/ownership. `guider.md` §7.1 requires deterministic target resolution.
**Impact:** The confirmation UI cannot show what will be acted on; there is no pre-execution target validation (relying entirely on the service at execution time).
**Required Fix:** Resolve the target from validated `toolInput` (or utterance), load it tenant-scoped, and populate `target` with the real id/label; fail with a clear error if not found in tenant.
**How to Verify:** Test: plan for "delete document X" resolves X's real id/label; cross-tenant id → not-found before any execution.

### [MEDIUM] FINDING-013 — `null as any` dependencies injected into tools
**Location:** `action/tools/documentTools.ts:26-27`, `userTools.ts:27-28`, `settingsTools.ts:20-21` (`retrieval: null as any, reranker: null as any`).
**Problem:** `getRetrievalDeps` fabricates an `AuthorizedRetrievalDependencies` with `null as any` for `retrieval`/`reranker` purely to satisfy `resolveTrustedActor`. Unsafe `any`; a latent NPE if any code path touches those fields; `resolveTrustedActor` is being used only for actor resolution.
**Impact:** Fragile; violates the DI discipline of the template tool; hides type errors.
**Required Fix:** Provide a minimal typed actor-resolution helper instead of faking the full retrieval deps, or make `resolveTrustedActor` accept only what it needs. Remove `as any`.
**How to Verify:** Typecheck passes without `any`; a test exercises actor resolution.

### [MEDIUM] FINDING-014 — `settings.update` output schema likely mismatches the service return
**Location:** `action/tools/settingsTools.ts:67-93` vs `settings/settings.service.ts` `updateTenantSettings` return shape.
**Problem:** The tool's `outputSchema` invents fields (`aiRuntimePreferences.modelProvider`, `emailBranding.primaryColor`, etc.) that may not match what `updateTenantSettings` returns; the real `TenantSettings` uses `aiRuntimePreferences {temperature,maxTokens,responseStyle,citationsEnabled}`. If the runtime validated executor output against this schema (once wired), it would fail.
**Impact:** Runtime output-validation failures; incorrect assumptions about settings shape.
**Required Fix:** Derive the output schema from the actual `updateTenantSettings` return type; add a type-level test.
**How to Verify:** Test calling the tool against a fake settings service asserts the output parses.

### [MEDIUM] FINDING-015 — No copilot audit actions / agent-origin metadata
**Location:** `api/src/common/observability/auditEvents.ts` (no `COPILOT_*`); tools do not add `metadata.source`.
**Problem:** `guider.md` §17/§19 require copilot-specific audit actions and `metadata.source:"copilot"`/`runId`/`mode`. None added (`grep COPILOT_ auditEvents.ts` → none).
**Impact:** Agent-initiated actions are indistinguishable from direct user actions in the audit log; observability requirement unmet.
**Required Fix:** Add `COPILOT_*` audit actions (or at minimum thread `metadata.source:"copilot"` + `runId` into the wrapped-service audit calls).
**How to Verify:** After a copilot action, the `audit_logs` row carries `metadata.source:"copilot"`.

### [MEDIUM] FINDING-016 — No feature flag; dead code with no gating
**Location:** `api/.env.example` / `app/.env.example` (no `COPILOT_ENABLED`).
**Problem:** `guider.md` §25 requires a `COPILOT_ENABLED` flag to ship dark. Absent (`grep COPILOT .env.example` → none).
**Impact:** No safe rollout control; once mounted, always on.
**Required Fix:** Add `COPILOT_ENABLED` (api) + `NEXT_PUBLIC_COPILOT_ENABLED` (app), gate route mount + launcher.
**How to Verify:** With the flag off, `/copilot/*` returns 404/disabled and the launcher is hidden.

### [MEDIUM] FINDING-017 — Guide flow steps can be silently dropped (no flow↔target parity guarantee)
**Location:** `guide/guide.service.ts:53-56` (`validateTargetIds` filters out steps whose `targetId` ∉ registry), `guide.service.ts:71` (returns `null` if 0 steps).
**Problem:** If any `guideFlows.ts` step references a `targetId` not in `guideTargets.ts` (or, later, not present as a real `data-guide-id`), the step is silently removed and the whole flow may collapse to `null` with no diagnostic. `guider.md` §10 requires an enforced parity test.
**Impact:** Guides can silently degrade/disappear after ordinary UI or registry changes.
**Required Fix:** Add a build/CI parity test: every flow step `targetId` ∈ target registry, and (once frontend exists) target registry ⊆ instrumented `data-guide-id`s. Log a warning when steps are dropped at runtime.
**How to Verify:** The parity test fails if a flow references an unknown target.

## 6. Low Findings

### [LOW] FINDING-018 — Confirm controller reads unvalidated `req.body.approvalId`
**Location:** `copilot.controller.ts:206` (`req.body.approvalId`) despite `copilotActionConfirmSchema` (`copilot.validator.ts:24-28`) already validating `approvalId`.
**Problem:** The validated value is discarded; raw body is used.
**Impact:** Bypasses the zod validation for that field (minor; resumeAgentRun still validates existence/tenant).
**Required Fix:** Use `parseResult.data.approvalId`.
**How to Verify:** Test rejects a missing/oversized `approvalId` with 400.

### [LOW] FINDING-019 — Dead/duplicate exports and unused imports
**Location:** `copilot/index.ts` re-exports both competing runtimes; `documentTools.ts`/`userTools.ts` import `LoadedChunkCandidate`, `DocumentHintContext` unused; `getRetrievalDeps(deps)` ignores `deps`.
**Problem:** Dead code and unused imports (will also trip lint).
**Impact:** Maintainability; lint failures.
**Required Fix:** Remove unused imports and the duplicate initializer after consolidation (FINDING-003).
**How to Verify:** `npm run lint` clean.

### [LOW] FINDING-020 — Ad-hoc session id uses `Date.now()`/`Math.random()`
**Location:** `guide/guide.service.ts:88`.
**Problem:** Fine for an ephemeral client id, but not collision-proof and not correlated to a run/trace.
**Impact:** Minor; harder to correlate guide analytics.
**Required Fix:** Use `uuidv4()` (already a dependency) and/or correlate with `traceId`.
**How to Verify:** N/A (cosmetic).

## 7. Missing Requirements (from `guider.md`)

| Requirement (guider.md §) | State | Required change | Verify |
| --- | --- | --- | --- |
| Composition root wiring `SupervisorRuntime` into prod (§3,§23,§30) | Implemented but **never called**; duplicated | Mount + initialize once (F-002, F-003) | App boots and serves `/copilot` |
| Route mounting `/copilot/*` (§16) | **Missing** | `app.use("/copilot", …)` behind flag | Route reachable |
| Tool execution through runtime `ToolRegistry.execute` (§5,§7) | **Bypassed** (plan-only) | Emit `tool_call`; run via runtime (F-003,F-005) | Tool call persisted + executed |
| `evaluatorReauthorize` in execution path (§4.2,§12) | **Defined, unused** | Wire reauthorize; fix `permissions:[]` (F-006) | Denial test passes |
| Confirmation via `agentApproval` + resume (§7,§11) | **Broken** (legacy path, no approval created) | Route through copilot await_approval/resume (F-005,F-009) | Approve/reject/expire tests |
| Guide localization (§6.4) | **Stub** (keys) | Real localization (F-010) | EN≠AR text |
| Frontend overlay/panel/providers/socket (§5,§6.5,§9,§15,§23) | **Missing entirely** | Implement (F-007) | Playwright guide/action E2E |
| `data-guide-id` instrumentation + parity (§10) | **Missing** (0 in app) | Instrument + CI parity (F-007,F-017) | Parity test |
| Socket.io lifecycle events (§15) | **Missing** | Add copilot room + client hook | Live events observed |
| Audit `COPILOT_*` + `metadata.source` (§17,§19) | **Missing** | Add actions/metadata (F-015) | Audit row carries source |
| Feature flag (§25) | **Missing** | Add `COPILOT_ENABLED` (F-016) | Flag gating works |
| Tests + eval dataset (§20,§21) | **Missing** (empty) | Implement suite (F-008) | `npm run test:api` covers copilot |
| Idempotency keys for actions (§14,§16) | **Missing** | Add idempotency on `/copilot/action` | Duplicate request no-ops |

## 8. Security Review

- **Authentication:** Routes correctly chain `authenticate` + `tenantScoping` + `requirePermission` (`copilot.routes.ts:11-48`) — but unreachable (unmounted, F-002). Design OK.
- **Authorization (deterministic):** **Not in the copilot execution path** — `permissions: []` (controller) + `evaluatorReauthorize` unused (F-006). Runtime tool path is bypassed (F-003). Mitigation: wrapped services (`documents/users/settings`) still enforce authz, so no live bypass today.
- **Tenant isolation:** `tenantId` is taken from server context (`authReq.tenantId`) and threaded to tools/services, **not** from LLM/body — correct. Tools pass `context.tenantId` to services that load by `{tenantId,id}`; `assertNoTrustedContextFields` intends to reject injected identity (but is mis-called, F-001). **No live cross-tenant vuln.**
- **IDOR:** Resource ids flow into services that re-validate tenant/ownership (`authorizeDocumentAction`). Safe once compiling. Target is not pre-resolved (F-012) — a robustness gap, not a breach.
- **Privilege escalation:** No path grants elevated perms; `actorRole` comes from the trusted token. OK by design (pending F-006 wiring).
- **Prompt injection:** The LLM classifier only selects `mode`/`flowId`/`toolName` hints from an enumerated set; tools are a static registry (no dynamic tool creation). Injection cannot name an unregistered tool. **But** confirmation is not enforced (F-009) and destructive-soft-delete is keyword-triggered (F-011), so an injected "delete this" could reach a (currently non-executing) destructive plan without a working gate — must be fixed alongside execution.
- **Tool allowlisting:** Static registry — OK. Risk map (`TOOL_RISK_MAP`) is a separate hardcoded map that can drift from `approvalRequired` (maintainability).
- **Tool argument validation:** Each tool has a strict zod `inputSchema` and re-parses input — good; but tools also parse a second ad-hoc schema inside the handler (e.g. `documentTools.ts:152`), duplicating/diverging from `schema.inputSchema` (the runtime never validates input against `schema.inputSchema` because execution is bypassed).
- **Confirmation bypass:** Confirmation is non-functional (F-005, F-009) — must be implemented before any execution ships.
- **LLM trust boundaries:** Correct in principle (LLM proposes; deterministic code should authorize) but the deterministic authorization is not actually invoked (F-006) and the runtime is bypassed (F-003).
- **Sensitive logging:** `throw new Error(result.error?.message …)` inside `decide` may surface internal messages; no secrets/prompts are logged. Low risk.
- **Secret handling:** No secrets committed. `package.json` added `uuid` (verify the lockfile change is only that). No `.env` secrets added.

## 9. Guide Mode Review

- **UI targeting:** Backend defines a target registry (`guideTargets.ts`) with stable ids, but **no frontend consumes it and no element carries `data-guide-id`** (F-007). The backend can (and will) produce sessions referencing targets that exist on no DOM node.
- **Highlighting / arrows / overlay / scrolling / responsive / a11y / RTL:** **Not implemented** (no frontend). `guider.md` §9/§19 unmet.
- **Missing/stale target handling:** Only backend `fallback` metadata exists; no client logic to honor it.
- **Navigation / cancellation / completion / recovery:** Not implemented (frontend absent).
- **Localization:** Server returns raw keys (F-010).
- **Silent flow collapse:** Steps dropped if target unknown (F-017).
- **Net:** Guide Mode is backend-contract-only; not usable.

## 10. Action Mode Review (lifecycle trace)

```
user request → /copilot/action (unmounted → unreachable, F-002)
  → createActionPlan → SupervisorRuntime.execute
     → normalizeAgentExecutionContext  ✗ throws (uuid conversationId, F-002)
     → copilot-supervisor decide → classifier decision (no `action`)  ✗ parseSupervisorDecision throws (F-004)
     → [never reached] handoff to platform-action-agent
     → platform-action-agent → builds ActionPlan ONLY; never emits tool_call (F-005)
     → [never reached] runtime executeToolCall → ToolRegistry.execute(reauthorize)
                        reauthorize uses context.permissions = [] → would deny all (F-006)
  → confirmation → /copilot/action/:runId/confirm
     → LEGACY resumeAgentRun (wrong registry; no approval record exists) → 404 (F-005)
  → execution → NEVER happens
  → verification/audit → underlying service would audit IF it ran (F-015 for agent-origin)
```
**Every link from plan→authorize→confirm→execute→verify→audit is broken or bypassed.** See F-003/004/005/006/009.

## 11. Test Quality Review

- **Genuinely tested:** Nothing in the copilot module (empty `__tests__`).
- **Only mocked / false-positive risk:** N/A (no tests).
- **Missing (all):** supervisor-decision routing; tool authz denial; tenant-isolation (two-tenant); confirmation approve/reject/expire; malformed LLM output → clarify; injection → no execution; guide expansion + permission filtering + target validation; frontend overlay/geometry/RTL; integration (route→runtime→tool→service→audit); eval dataset (§21).
- **Existing infra to reuse for tests:** `FakeModelAdapter`, `InMemorySupervisorPersistence`, fake service deps (patterns in `agents/*.test.ts`, `authorizedRetrievalTools.test.ts`).

## 12. Recommended Fix Order

1. **FINDING-001** — make it compile (arg counts, missing i18n module, duplicate import, import depths, `z.record`). Run `npm run typecheck` until green.
2. **FINDING-003** — consolidate to one composition root; stop executing agents inside `decide`; use real handoffs.
3. **FINDING-004** — map classifier output to a valid `SupervisorDecision` (handoff/complete).
4. **FINDING-002** — fix `conversationId` (ObjectId), mount `/copilot` in `app.ts`, call the single initializer at startup (behind the flag).
5. **FINDING-005 + FINDING-009** — emit `tool_call`; execute via runtime; create `agentApproval` for `approvalRequired`; route confirm/resume through the copilot registry; use validated `approvalId`.
6. **FINDING-006** — wire evaluator-backed reauthorize / populate `context.permissions`; keep wrapped-service authz.
7. **FINDING-012, FINDING-013, FINDING-014, FINDING-010, FINDING-011** — target resolution, remove `null as any`, correct settings output schema, real localization, fix intent keywords.
8. **FINDING-016 + FINDING-017 + FINDING-015** — feature flag, flow/target parity test, audit actions/metadata.
9. **FINDING-007** — implement the frontend (providers, portal overlay, `data-guide-id`, client service, socket, RTL).
10. **FINDING-008** — add the full backend + frontend + eval test suite (add security regression tests: two-tenant IDOR, authz denial, confirmation, injection).
11. Run `npm run typecheck`.
12. Run `npm run lint`.
13. Run `npm run test` (api + app).
14. Run `npm run build`.
15. Manual verification (guide upload flow; destructive action confirm/execute/undo; Arabic RTL); `docker compose up` smoke.

## 13. Definition of Done for Review 1

- `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build` all pass (api + app).
- `/copilot/*` is mounted and gated by `COPILOT_ENABLED`; a booted app serves `POST /copilot/message` returning a real `mode` (guide/action/clarify), not a 500.
- Guide and Action runs execute **through** `SupervisorRuntime` (persisted `agentStep`/`agentToolCall`/`agentApproval`), with exactly **one** composition root; no agent is executed inside `model.decide`.
- Deterministic authorization (evaluator) is invoked in the copilot execution path; `permissions:[]` removed; two-tenant IDOR test and authz-denial test pass.
- Destructive tools create a real `agentApproval` and cannot execute without an approve resume; expired/rejected/contextHash-mismatch never mutate.
- Frontend implemented: overlay highlights real `data-guide-id` targets; registry↔DOM parity test passes; RTL verified.
- Copilot audit actions/`metadata.source` present; feature flag documented.
- All CRITICAL and HIGH findings resolved; MEDIUM findings resolved or explicitly deferred with justification.

## 14. Verification Commands

```bash
git status --short                      # confirm only intended files changed; preserve pre-existing changes
npm run typecheck                       # api + app; MUST be zero errors
npm run lint
npm run test                            # api + app (Vitest)
npm run build                           # workspace production builds
npm run test:security                   # scripts/*.test.mjs (secret/guard checks), if present
# Frontend E2E (boots api+app):
npx playwright test e2e/copilot         # after adding specs
# Manual smoke:
docker compose up --build               # enable COPILOT_ENABLED; exercise guide + action + Arabic RTL
```

## 15. Final Assessment

**NOT READY — Critical issues remain.** The feature does not compile, is not integrated (unmounted, uninitialized), bypasses `SupervisorRuntime`, always fails its core decision step, cannot execute or confirm actions, and ships no frontend and no tests. Re-review required after the CRITICAL and HIGH findings are fixed and the verification suite passes.
