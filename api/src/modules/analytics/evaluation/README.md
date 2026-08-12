# RAG evaluation and experiment comparison

This module applies the evaluation concepts from DeepLearning.AI's *Building
and Evaluating Advanced RAG* to DocuMind's existing TypeScript production RAG
workflow. It does not introduce a second retrieval or generation pipeline.

## RAG Triad

| Triad dimension | DocuMind evaluator | Meaning |
| --- | --- | --- |
| Context relevance | `ContextRelevanceEvaluator` | Whether ranked, authorized retrieval contains labelled relevant documents/chunks. Reports hit@K, precision@K, recall@K, and reciprocal rank without an LLM judge. |
| Groundedness | `GroundednessEvaluator` | Adapts the workflow's existing claim-level citation semantic result into supported, unsupported, and unknown claim counts. Runtime verification remains the release gate. |
| Answer relevance | `AnswerRelevanceEvaluator` | Uses the existing judge on the final Compliance-approved answer and distinguishes answers, refusals, clarifications, and source-less responses. It is evaluation-only. |
| Answer correctness | `AnswerCorrectnessEvaluator` | Applies word-boundary, polarity, and contradiction checks, then a bounded temperature-zero bilingual semantic judgment for unresolved labels. Malformed or incomplete judgments are unavailable. |

Authorization violations are not relevance errors. They are hard security
failures and can never be offset by improvements in RAG Triad scores.

## Phases

Phase 1 defines the V2 dataset, per-case result, deterministic metrics,
aggregation, and versioned evaluation-report contract.

Phase 2 executes cases through `ChatWorkflowService.execute()` using the real
production agent/tool composition. Supervisor, conversation, message, trace,
and retrieval-audit persistence are replaced with evaluation-safe in-memory or
ephemeral adapters. Authorization, citation verification, Compliance, and final
source reauthorization are unchanged.

Phase 3 fingerprints quality-relevant configuration, assigns experiment
metadata, compares compatible baseline/candidate reports, and evaluates an
explicit regression policy. Comparison code is analytics-only and cannot alter
runtime authorization or release decisions.

## Run an evaluation

```bash
npm run evaluate:rag --workspace api -- \
  --mode live \
  --tenant-id <tenant-id> \
  --actor-id <actor-id> \
  --dataset <dataset.json> \
  --report <report.json>
```

Optional filters are `--case`, `--tag`, and `--top-k`. `--top-k` controls the
evaluation metric cutoff only; it does not tune production retrieval. The fixed
default is **10** for every case. Zero-case selections fail without a successful
report. Retrieval quality uses the authorized ranking before evidence approval;
evidence-selected IDs remain separate. Pre-authorization IDs are serialized
only as counts and deterministic run-salted opaque fingerprints.

## Compare reports

```bash
npm run evaluate:rag:compare --workspace api -- \
  --baseline <baseline-report.json> \
  --candidate <candidate-report.json> \
  --policy api/src/modules/analytics/evaluation/regression-policy.example.json \
  --output <comparison-report.json>
```

Exit codes are stable for CI: `0` means the gate passed, `1` means a valid
comparison failed its gate, `2` means malformed input or another controlled
usage error, and `3` means the reports are incompatible. Output JSON is written
with exclusive creation and never overwrites either source report.

Compatibility requires the same report version, dataset version, case set,
metric-semantics version, and retrieval metric cutoff. Cases and findings are
sorted for stable machine-readable output.

## Configuration and experiment identity

The configuration hash is SHA-256 over canonical JSON containing only
quality-relevant fields: dataset, metric cutoff, actual direct/summarization
retrieval topK, retrieval/fusion, reranker, embedding/answer/verifier/judge
identities (including ordered provider/model failover chains), citation and
max-token settings, prompts, thresholds, metric semantics, and workflow
versions. Live report generation fails when a required quality identity is
unresolved.
Object key order does not matter. Runtime metadata, timestamps, request IDs,
tenant IDs, and secrets are excluded; strict structured fields reject unknown
secret-bearing properties.

Experiment metadata records an experiment ID/name, configuration ID/hash,
dataset version, creation time, optional baseline link/description, and sorted
tags. JSON artifacts are sufficient; no database is required.

## Regression policy and metric interpretation

The policy separates:

- hard security gates: authorization and final-source invariants;
- hard correctness gates: passing/outcome/groundedness regressions and
  unsupported releases;
- quality floors and allowed absolute metric drops;
- correctness evaluated coverage, measurement preservation, and correct-rate
  floors/regression allowances;
- operational latency, token, and cost increases, configured as warnings or
  failures.

Positive deltas improve higher-is-better quality metrics. Negative deltas
improve lower-is-better operational and violation metrics. Missing labels or
measurements remain `unavailable`; the comparator never invents values.

The default policy is conservative. Review and version a project-specific copy
of `regression-policy.example.json` before wiring the command into CI.

## Security invariants

Evaluation and comparison do not weaken tenant isolation,
`DOCUMENTS_USE_IN_AI`, permission scopes, Document Access Policy, document
lifecycle checks, pre-LLM authorization, citation membership/semantic
verification, fail-closed Compliance, or final source reauthorization.

Evaluation uses the same document authorization decision path with an injected
non-durable denial-audit writer. Production retains durable denial audits.
Reports expose evaluated/unavailable sample counts, and the conservative policy
fails measurement disappearance. Comparisons recompute stored aggregates and
reject inconsistent or empty reports.

Permission scenario IDs come from a bounded evaluation registry and are checked
against the independently resolved effective grant, actor, role, scope, and
tenant before workflow execution. Dataset strings are never copied into runtime
metadata as proof of execution.

Live comparable reports use the instantiated adapter identity: provider, model,
ordered failover chain, mandatory componentVersion, and either a provider model
revision or modelRevisionStatus=`unavailable` when that provider exposes no
revision. Missing identity fails report creation; it is never replaced with an
empty, guessed, or wrapper-only value. Adapter versions, model names, provider
order, fusion/reranker versions, and prompt versions affect the configuration
fingerprint, while secrets and request/tenant diagnostics do not.

Scoped permission scenarios use effective DOCUMENTS_USE_IN_AI facts and
tenant-resolved taxonomy names. The HR scenario means exactly one resolved
department whose semantic key is `hr`; it is not satisfied by a non-empty or
dataset-declared scope. Unknown scenario IDs fail before workflow execution.

Document-absence claims cannot be safely grounded from partial retrieval alone.
They require proposition-linked structured negative evidence or trusted
exhaustive-document coverage, with contradictions failing closed. Semantic
observers receive a deeply cloned/frozen `CitationSemanticEvaluationArtifact`;
it contains no raw evidence bodies or authoritative mutable references.
