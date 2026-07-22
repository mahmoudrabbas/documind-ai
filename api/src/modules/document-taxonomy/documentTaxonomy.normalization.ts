export function normalizeTaxonomyDisplayName(value: string): string {
  return value.trim().replace(/\s+/gu, " ");
}

export function normalizeTaxonomyName(value: string): string {
  return normalizeTaxonomyDisplayName(value).toLowerCase();
}
