export interface AdapterFilter {
  tenantId: string;
  classification?: { $in: string[] };
  department?: { $in: string[] };
  category?: { $in: string[] };
  allowAiUse?: boolean;
  documentIds?: string[];
  documentVersionId?: string;
}
