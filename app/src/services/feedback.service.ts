import { apiClient } from "@/lib/api-client";
import type { Feedback, FeedbackStats, SubmitFeedbackPayload } from "../types/api/feedback.types";

export const submitFeedback = async (payload: SubmitFeedbackPayload) => {
  return apiClient<{ feedback: Feedback }>(`/feedback`, {
    method: "POST",
    body: payload as unknown as Record<string, unknown>,
  });
};

export const getMyMessageFeedback = async (messageId: string) => {
  return apiClient<{ feedback: Feedback | null }>(`/feedback/mine/messages/${messageId}`);
};

export const getFeedbackStats = async () => {
  return apiClient<{ stats: FeedbackStats }>(`/feedback/stats`);
};
