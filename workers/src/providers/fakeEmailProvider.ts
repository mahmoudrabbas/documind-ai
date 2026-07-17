import { randomUUID } from "node:crypto";
import type {
  EmailDispatchPort,
  EmailDispatchInput,
  EmailDispatchResult,
} from "./emailDispatchPort.js";

export interface CapturedEmail extends EmailDispatchInput {
  sentAt: Date;
}

export class FakeEmailProvider implements EmailDispatchPort {
  private emails: CapturedEmail[] = [];
  
  // Test controls
  private injectFailure: "TEMPORARY" | "PERMANENT" | null = null;
  private injectErrorCategory: string | null = null;
  private injectErrorMessage: string | null = null;

  async send(input: EmailDispatchInput): Promise<EmailDispatchResult> {
    if (this.injectFailure) {
      const state = this.injectFailure === "TEMPORARY" ? "TEMPORARY_FAILURE" : "PERMANENT_FAILURE";
      return {
        providerMessageId: null,
        state,
        errorCategory: this.injectErrorCategory || "simulated_error",
        errorMessage: this.injectErrorMessage || `Simulated ${state}`,
      };
    }

    this.emails.push({ ...input, sentAt: new Date() });

    return {
      providerMessageId: `fake-${randomUUID()}`,
      state: "SENT",
    };
  }

  setFailure(type: "TEMPORARY" | "PERMANENT" | null, category?: string, message?: string) {
    this.injectFailure = type;
    this.injectErrorCategory = category || null;
    this.injectErrorMessage = message || null;
  }

  getSentEmails(): readonly CapturedEmail[] {
    return this.emails;
  }

  getLastEmail(): CapturedEmail | undefined {
    return this.emails[this.emails.length - 1];
  }

  clear(): void {
    this.emails.length = 0;
    this.injectFailure = null;
    this.injectErrorCategory = null;
    this.injectErrorMessage = null;
  }
}
