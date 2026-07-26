export const DOCUMENT_ACCESS_CONTRACT_VERSION = 1 as const;

export const DOCUMENT_ACCESS_ACTIONS = [
  "discover",
  "read",
  "download",
  "update",
  "delete",
  "archive",
  "restore",
  "replace",
  "reprocess",
  "manage_access",
  "use_in_ai",
] as const;

export type DocumentAccessAction = (typeof DOCUMENT_ACCESS_ACTIONS)[number];

const DOCUMENT_ACCESS_ACTION_SET = new Set<string>(DOCUMENT_ACCESS_ACTIONS);

export function isDocumentAccessAction(value: unknown): value is DocumentAccessAction {
  return typeof value === "string" && DOCUMENT_ACCESS_ACTION_SET.has(value);
}
