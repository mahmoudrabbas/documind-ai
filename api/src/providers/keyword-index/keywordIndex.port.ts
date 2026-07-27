export interface KeywordSearchInput {
  tenantId: string;
  generationId: string;
  query: string;
  topK: number;
  filters?: KeywordSearchFilters;
}

export interface KeywordSearchFilters {
  documentId?: string;
  department?: string;
  classification?: string;
  language?: string;
  contentType?: string;
}

export interface KeywordSearchResult {
  chunkId: string;
  documentId: string;
  generationId: string;
  score: number;
  text: string;
  sectionPath: string[];
  pageStart: number;
  pageEnd: number;
  contentType: string;
  language: string;
}

export interface KeywordIndex {
  search(input: KeywordSearchInput): Promise<KeywordSearchResult[]>;
  ensureIndex(): Promise<void>;
  getIndexStatus(): Promise<{ exists: boolean; status: string }>;
}
