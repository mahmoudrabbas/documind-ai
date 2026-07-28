export type FeedbackRating = "thumbs_up" | "thumbs_down";
export type FeedbackCategory = "inaccurate" | "incomplete" | "irrelevant" | "harmful" | "other";

export interface FeedbackResponse {
  id: string;
  tenantId: string;
  messageId: string;
  conversationId: string;
  userId: string;
  rating: FeedbackRating;
  category?: FeedbackCategory | null;
  comment?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FeedbackStatsResponse {
  totalCount: number;
  thumbsUpCount: number;
  thumbsDownCount: number;
  satisfactionRate: number;
  byCategory: Record<FeedbackCategory, number>;
}
