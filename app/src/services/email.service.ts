import { api } from "@/lib/api-client";

export interface EmailMessage {
  _id: string;
  recipientEmail: string;
  templateId: string;
  state: string;
  createdAt: string;
  subject: string;
  attemptCount: number;
}

export interface EmailAttempt {
  _id: string;
  attemptNumber: number;
  state: string;
  providerMessageId?: string;
  errorCategory?: string;
  errorMessage?: string;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
}

export const emailService = {
  async listEmails(filters: { page?: number; limit?: number; state?: string; recipientEmail?: string; templateId?: string } = {}) {
    const params = new URLSearchParams();
    if (filters.page) params.set("page", String(filters.page));
    if (filters.limit) params.set("limit", String(filters.limit));
    if (filters.state) params.set("state", filters.state);
    if (filters.recipientEmail) params.set("recipientEmail", filters.recipientEmail);
    if (filters.templateId) params.set("templateId", filters.templateId);

    const response = await api.get<{ data: EmailMessage[]; meta: { total: number; page: number; limit: number } }>(`/emails?${params.toString()}`);
    return response;
  },

  async getEmailStatus(messageId: string) {
    const response = await api.get<{ data: { message: EmailMessage; attempts: EmailAttempt[] } }>(`/emails/${messageId}`);
    return response.data;
  },

  async resendEmail(messageId: string) {
    const response = await api.post<{ data: { success: boolean; state: string } }>(`/emails/${messageId}/resend`);
    return response.data;
  },

  async cancelEmail(messageId: string) {
    const response = await api.post<{ data: { success: boolean } }>(`/emails/${messageId}/cancel`);
    return response.data;
  }
};
