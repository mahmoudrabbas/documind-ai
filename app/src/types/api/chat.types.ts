export interface ChatSource {
  chunkId: string;
  text: string;
  pageNumber?: number;
  sectionTitle?: string;
  score: number;
  documentTitle?: string;
}

export interface ChatResponse {
  answer: string;
  sources: ChatSource[];
  conversationId: string;
}

export interface ChatHistoryMessage {
  role: "user" | "assistant";
  content: string;
}
