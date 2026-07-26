# Document authorization matrix v1

| Endpoint or operation | Policy action |
|---|---|
| List/count documents | `discover` |
| Detail, versions, extraction status | `read` |
| OCR pages, quality, metadata candidates, relationships, conflicts | `read` |
| Download | `download` |
| Metadata update and review-state mutations | `update` |
| Replace file | `replace` |
| Archive / restore | `archive` / `restore` |
| Soft / permanent delete | `delete` |
| Extraction, OCR, metadata, conflict-analysis trigger or retry | `reprocess` |
| Explicit intent-query document | `use_in_ai` |
| Future policy management | `manage_access` |
| Upload | coarse `documents:create`, then private default creation |

`manage_access` maps only to `documents:manage-access`. `use_in_ai` maps only to `documents:use-in-ai`; neither document read nor chat creation implies it. Route middleware remains a coarse early gate, while services perform the current resource-policy decision immediately before synchronous access or mutation.
