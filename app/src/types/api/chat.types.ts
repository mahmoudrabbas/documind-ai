export interface ChatSource {
  chunkId: string;
  documentId: string;
  text?: string;
  pageNumber?: number;
  sectionTitle?: string;
  score: number;
  documentTitle?: string;
}

export interface ChatSourceClip {
  referenceNumber: number;
  documentTitle: string;
  excerpt: string;
  pageNumber?: number;
  sectionTitle?: string;
  documentId: string;
}

export interface ChatResponse {
  answer: string;
  sources: ChatSource[];
  conversationId: string;
  sourceClips?: ChatSourceClip[];
}

export interface ChatHistoryMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ConversationListItem {
  id: string;
  title: string;
  lastMessage: string;
  updatedAt: string;
  messageCount: number;
}

export interface ConversationMessageDetail {
  id: string;
  role: "user" | "assistant";
  content: string;
  sourceClips?: ChatSourceClip[];
  sources?: Array<{
    chunkId: string;
    documentId: string;
    documentTitle: string;
    sectionTitle?: string;
    pageNumber?: number;
    score: number;
  }>;
  createdAt: string;
}

export interface ConversationListResponse {
  conversations: ConversationListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ConversationMessagesResponse {
  messages: ConversationMessageDetail[];
  conversationId: string;
}
