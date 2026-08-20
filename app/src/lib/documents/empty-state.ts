export type DocumentsEmptyState = "filtered" | "archived" | "access" | "tenant";

export interface DocumentsEmptyStateInput {
  hasActiveFilters: boolean;
  showArchived: boolean;
  canCreate: boolean;
  canManageAccess: boolean;
}

export function getDocumentsEmptyState({
  hasActiveFilters,
  showArchived,
  canCreate,
  canManageAccess,
}: DocumentsEmptyStateInput): DocumentsEmptyState {
  if (hasActiveFilters) return "filtered";
  if (showArchived) return "archived";
  if (!canCreate && !canManageAccess) return "access";
  return "tenant";
}
