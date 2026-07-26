export interface SearchQuery {
  tenantId: string;
  documentId: string;
  query: string;
  topK?: number;
  filters?: SearchFilters;
}

export interface SearchFilters {
  department?: string;
  classification?: string;
  language?: string;
  contentType?: string;
}

export interface SearchResult {
  chunkId: string;
  documentId: string;
  generationId: string;
  text: string;
  sectionPath: string[];
  pageStart: number;
  pageEnd: number;
  offsetStart: number;
  offsetEnd: number;
  contentType: string;
  language: string;
  similarityScore: number;
}

export interface SearchIndexPort {
  search(query: SearchQuery): Promise<SearchResult[]>;
  getDocumentSearchStatus(
    tenantId: string,
    documentId: string,
  ): Promise<{ status: string; generationId: string | null }>;
}
