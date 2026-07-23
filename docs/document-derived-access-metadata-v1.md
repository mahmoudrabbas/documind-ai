# Document Derived Access Metadata V1

## Contract

Derived records may carry this provider-neutral identity only:

```json
{
  "schemaVersion": 1,
  "tenantId": "<tenant-id>",
  "documentId": "<document-id>",
  "documentVersion": 1,
  "policyId": "<policy-id>",
  "policyVersion": 2,
  "classificationId": "<classification-id-or-null>",
  "categoryId": "<category-id-or-null>",
  "departmentId": "<department-id-or-null>",
  "generationId": "<generation-id>",
  "updatedAt": "<iso-instant>",
  "requiresCurrentPolicyRevalidation": true
}
```

It contains no policy rules, grants, content, extracted text, names, or provider-specific fields. Extraction artifacts, OCR page records, and an existing chunk collection can be updated only through tenant, document, and document-version predicates.

## Desired and applied versions

Generation state stores desired and applied policy identities independently. Tightening or mixed changes become `stale`; broadening becomes `pending`. Neither makes old metadata newly current. Metadata completion advances the applied version only if the desired identity still matches.

When reindexing is required, durable request creation leaves the generation `reindexing`. `markGenerationCurrent` is the downstream completion boundary; enqueueing alone never reports current.

## Future Issue 20 use

`validateDerivedAccessMetadata`, `isDerivedAccessMetadataCurrent`, and `requireCurrentPolicyGeneration` fail closed for missing, malformed, wrong-tenant, wrong-document, old-document-version, old-policy-version, or wrong-generation metadata. Future retrieval must also reload the current policy and evaluate `use_in_ai`; this metadata is never an unrestricted-access representation.

No vector, keyword, hybrid, reranking, or answer-generation implementation is included.
