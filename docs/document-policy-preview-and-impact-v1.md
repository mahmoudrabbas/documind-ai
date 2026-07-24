# Document policy preview and impact v1

Preview is a zero-write workflow. It requires the expected active policy family/version, normalizes and validates the draft and references, evaluates current and proposed policy decisions for every active tenant user in bounded pages, and aggregates exact gained/lost decisions for every document action. Coarse capability is included, so a policy allow without the corresponding permission is not an effective gain. Rule order and action order do not create changes.

Direction is `broadening` for gains only, `tightening` for losses only, `mixed` for both, and `no_change` for neither. Results contain safe counts and summaries, never document content, titles, filenames, emails, or matched rule payloads. Effective-access requests accept at most 100 user IDs; batches accept at most 50 unique document IDs and run in deterministic ID order.

The preview artifact is HMAC-authenticated, purpose-bound, and short-lived. It binds tenant, actor, document, expected pointer, normalized draft fingerprint, materialized effective time, sensitive-confirmation requirement, expiry, and all batch entries. Apply reauthorizes, reloads the pointer, revalidates references, recomputes fingerprints and impact, and rejects expired, modified, cross-actor, cross-tenant, or stale previews without writes.

Confidential and Highly Confidential classification levels come only from the stored active tenant classification. Any effective gain requires explicit `confirmSensitiveBroadening: true`; tightening alone does not. Client classification claims cannot disable this requirement.

Batch preview performs no writes and preflights every document. Batch apply repeats whole-batch preflight before writing, then uses one transaction per document. Races are reported per document as applied, no-change, replay, version conflict, or failure; partial results are never described as full success. Batch operations do not start background work or propagation.
