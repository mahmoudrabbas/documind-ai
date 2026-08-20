# Authorization-Aware Knowledge Gap Design

## Goal

Prevent access-constrained RAG refusals from being presented or persisted as
missing company knowledge, while preserving genuine Knowledge Gap reporting for
questions that have no relevant content in the employee's authorized corpus.

This design complements
`docs/plans/2026-08-20-permission-loading-lock-design.md`, which covers the
infinite permission-checking state on the Knowledge Gaps dashboard.

## Proven Failure

The chat workflow carries two trusted authorization signals:

- `authorizationRestricted` means the authorized corpus resolved to a terminal
  denial.
- `authorizationFiltered` means document authorization narrowed a partially
  searchable corpus, including cases where relevant inaccessible evidence was
  removed before evidence evaluation.

Knowledge Gap persistence already rejects authorization-filtered runs. However,
the deterministic fallback response checked only `authorizationRestricted`.
Consequently, a partial-authorization refusal could still say that no company
information was found, even though the real condition was insufficient access.

## Response Contract

For an insufficient-evidence refusal, combine the two trusted authorization
signals. If either signal is true, return the generic localized access-safe
message:

> I don't have sufficient authorized access to the documents needed to answer
> this question.

The response must contain no sources and must not expose or confirm any denied
document title, identifier, chunk, value, marker, or denied-result count.

If neither authorization signal is true and the authorized corpus genuinely has
no relevant content, retain the normal no-information response. That case
remains eligible for Knowledge Gap creation.

## Persistence Contract

Knowledge Gap creation is determined from trusted workflow artifacts, never by
matching generated response text. Only `no_relevant_content` without
`authorizationFiltered` is reportable. The following are not reportable:

- full authorization restriction;
- partial authorization filtering;
- citation/provenance verification failure;
- evidence conflict;
- unsupported requests;
- successful answers.

No historical Knowledge Gap records are modified by this change.

## Data Flow

1. Authorized retrieval searches only the actor's permitted corpus.
2. Search and evidence tools propagate boolean authorization provenance without
   denied resource details.
3. The workflow accumulates `authorizationRestricted` and
   `authorizationFiltered` as monotonic run artifacts.
4. Chat outcome and Knowledge Gap reportability consume those artifacts.
5. The fallback renderer uses their combined value to choose the access-safe or
   genuine-gap response.

## Testing

- A unit workflow test models partial authorization filtering at search and
  evidence boundaries and expects the access-safe message, empty sources, and
  no Knowledge Gap tool call.
- A production-composed employee workflow test seeds same-tenant evidence that
  is discoverable/readable but not permitted for `use_in_ai`. It expects
  `AUTHORIZATION_FILTERED`, no evidence evaluation, no protected values in the
  response or supervisor graph, and zero Knowledge Gap/outbox records.
- Existing genuine authorized-corpus no-match coverage must continue to create
  a Knowledge Gap.
- Type checking and diff validation protect the public response contract and
  ensure the fix remains a narrow behavior change.

## Data Safety

The change adds no unrestricted retrieval, alternate authorization path,
database migration, deletion, or tenant-wide rewrite. Denied-document details
remain inside authorization boundaries, and tests use disposable fixtures.
