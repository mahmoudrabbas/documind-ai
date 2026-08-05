export interface ChatSource {
  chunkId: string;
  documentId: string;
  text: string;
  pageNumber?: number;
  sectionTitle?: string;
  score: number;
  documentTitle?: string;
}

/**
 * Public attachment metadata returned to clients. `id` is used to fetch the
 * image via GET /chat/attachments/:id. `storageKey` is never exposed.
 */
export interface ChatAttachment {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

export interface ChatResponse {
  messageId: string;
  answer: string;
  /**
   * Present only when the tenant's AI runtime preferences enable citations.
   * Omitted (not empty) when citations are disabled so clients never render
   * a sources block or citation footnotes.
   */
  sources?: ChatSource[];
  conversationId: string;
}

export interface ChatVisionResponse extends ChatResponse {
  /** Metadata for the analyzed image so the client can render it from history. */
  attachment: ChatAttachment;
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
  sources?: Array<{
    chunkId: string;
    documentId: string;
    documentTitle: string;
    sectionTitle?: string;
    pageNumber?: number;
    score: number;
  }>;
  /** Present only on user messages that carry an image attachment. */
  attachments?: ChatAttachment[];
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
