# Extraction Contract v1

Frozen schema and fixture set for downstream parallel issues.

## ExtractionArtifact Schema

| Field | Type | Description |
|-------|------|-------------|
| `documentId` | ObjectId | Reference to parent Document |
| `tenantId` | ObjectId | Tenant scope |
| `documentVersion` | number | Which version was extracted |
| `sourceChecksum` | string | SHA-256 of source file |
| `parserName` | string | e.g. `pdf-parse`, `mammoth`, `txt-parser` |
| `parserVersion` | string | e.g. `2.4.5` |
| `status` | enum | `pending \| extracting \| completed \| failed` |
| `pages[]` | array | `{ pageNumber, blocks[] }` |
| `pages[].blocks[]` | array | `{ type, text, level?, sourceOffset? }` |
| `metadata` | object | `{ totalPages, totalCharacters, detectedLanguages[], warnings[], hasImageOnlyPages }` |
| `failureReason` | string? | Human-readable failure description |
| `failureCode` | enum? | `malformed \| unsupported \| timeout \| resource_limit \| encrypted \| image_only_partial` |
| `artifactChecksum` | string? | SHA-256 of extracted pages JSON |
| `durationMs` | number? | Extraction duration |

## Block Types

- `paragraph` — Plain text paragraph
- `heading` — Heading with `level` (1-6)
- `table` — Table text with `\|` column separators
- `list` — List item text

## Consumers

- **Issue 14 (OCR)** — reads `pages` and `hasImageOnlyPages` flag
- **Issue 15 (Metadata agents)** — reads extraction artifacts for metadata inference
- **Issue 16 (Chunking)** — consumes structured text blocks for semantic chunking
- **Issue 17 (Progress UI)** — reads extraction `status` for admin dashboard

## API Endpoints

- `GET /api/documents/:id/extraction?version=N` — returns extraction status
- `POST /api/documents/:id/extraction/retrigger` — re-triggers extraction

## Job Type

- `document.extract` — BullMQ job type, payload: `{ documentId, tenantId, documentVersion }`
