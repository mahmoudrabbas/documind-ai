export type FeedbackRating = "thumbs_up" | "thumbs_down";
export type FeedbackCategory = "inaccurate" | "incomplete" | "irrelevant" | "harmful" | "other";

export interface Feedback {
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

export interface FeedbackStats {
  totalCount: number;
  thumbsUpCount: number;
  thumbsDownCount: number;
  satisfactionRate: number;
  byCategory: Record<FeedbackCategory, number>;
}

export interface SubmitFeedbackPayload {
  messageId: string;
  conversationId: string;
  rating: FeedbackRating;
  category?: FeedbackCategory;
  comment?: string;
}
