export interface EmailDispatchResult {
  providerMessageId: string | null;
  state: "SENT" | "TEMPORARY_FAILURE" | "PERMANENT_FAILURE";
  errorCategory?: string;
  errorMessage?: string;
}

export interface EmailDispatchInput {
  to: string;
  subject: string;
  text: string;
  html: string;
  messageId: string;
  idempotencyKey: string;
}

export interface EmailDispatchPort {
  send(input: EmailDispatchInput): Promise<EmailDispatchResult>;
}
