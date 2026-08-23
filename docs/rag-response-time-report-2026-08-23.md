# RAG Response-Time Report

**Run date:** 2026-08-23  
**Environment:** Post-merge Docker API container  
**Model observed:** `nvidia/nemotron-3-super-120b-a12b` for answer-writing and citation verification  
**Measurement:** `elapsedMs` is the end-to-end HTTP wall-clock time from the live probe; `run.latencyMs` is the persisted AgentRun duration.

## Four-question probe

| Question | HTTP | Wall time | AgentRun time | Sources | Outcome |
|---|---:|---:|---:|---:|---|
| summarize the mysql file | 200 | 125.720 s | 116.430 s | 4 | grounded answer; citation verification passed |
| how to install mysql in linux | 200 | 50.775 s | 42.439 s | 0 | insufficient evidence; correct because the document describes MariaDB, not MySQL installation |
| what is mysql | 200 | 74.749 s | 65.561 s | 0 | unsupported claims rejected by citation verification |
| what language does abdallah speak | 200 | 50.864 s | 39.831 s | 1 | grounded answer; citation verification passed |

### Summary statistics

- End-to-end wall time: minimum **50.775 s**, median **62.807 s**, average **75.527 s**, maximum **125.720 s**.
- Persisted AgentRun time: average **66.065 s** across the four requests.
- All four requests returned HTTP 200 and completed runs. The evidence refusals are grounding outcomes, not transport or provider failures.

## Repeated definition query

The exact query `what is mysql` was repeated once to distinguish a transient retrieval/model outcome from a broken pipeline:

- HTTP 200, **75.611 s** wall time, **66.472 s** AgentRun time.
- One source returned.
- The answer cited a document-backed detail about the `mysql` client, `mysqldump`, and `mysqladmin`.
- Citation verification passed (`CITATIONS_VERIFIED`).

The two outcomes are consistent with grounded RAG behavior: a broad definition absent from the file is rejected, while a narrower claim supported by the file is answered with a source.
