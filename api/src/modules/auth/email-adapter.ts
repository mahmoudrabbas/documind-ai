import nodemailer from "nodemailer";
import { AppError } from "../../common/errors/AppError.js";
import { EMAIL_SENDING_FAILED } from "../../common/errors/errorCodes.js";
import { config } from "../../config/index.js";

/**
 * @deprecated Use EmailDispatchPort and EmailService instead.
 * This adapter is maintained solely for backward compatibility with older
 * synchronous email flows and will be removed in a future release.
 */
export interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/**
 * @deprecated Use EmailDispatchPort and EmailService instead.
 */
export interface EmailAdapter {
  send(input: SendEmailInput): Promise<void>;
}

export class SmtpEmailAdapter implements EmailAdapter {
  async send(input: SendEmailInput): Promise<void> {
    const missingFields: string[] = [];
    if (!config.SMTP_HOST) missingFields.push("SMTP_HOST");
    if (!config.SMTP_USER) missingFields.push("SMTP_USER");
    if (!config.SMTP_PASS) missingFields.push("SMTP_PASS");
    if (!config.SMTP_FROM) missingFields.push("SMTP_FROM");

    if (missingFields.length > 0) {
      const message = `Missing SMTP config: ${missingFields.join(", ")}`;
      if (config.NODE_ENV !== "production") {
        console.warn(`[email-adapter] ${message}`);
        return;
      }
      throw new AppError(500, EMAIL_SENDING_FAILED, "SMTP is not configured", {
        missingFields,
      });
    }

    const transporter = nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_SECURE,
      auth: { user: config.SMTP_USER, pass: config.SMTP_PASS },
    });

    await transporter.sendMail({
      from: config.SMTP_FROM,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });
  }
}

export interface CapturedEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
  sentAt: Date;
}

export class InMemoryEmailAdapter implements EmailAdapter {
  private emails: CapturedEmail[] = [];

  async send(input: SendEmailInput): Promise<void> {
    this.emails.push({ ...input, sentAt: new Date() });
  }

  getSentEmails(): readonly CapturedEmail[] {
    return this.emails;
  }

  getLastEmail(): CapturedEmail | undefined {
    return this.emails[this.emails.length - 1];
  }

  findEmailsTo(address: string): CapturedEmail[] {
    return this.emails.filter((e) => e.to === address);
  }

  findEmailsBySubject(substring: string): CapturedEmail[] {
    return this.emails.filter((e) => e.subject.includes(substring));
  }

  clear(): void {
    this.emails.length = 0;
  }
}

let globalAdapter: EmailAdapter = new SmtpEmailAdapter();

export function setEmailAdapter(adapter: EmailAdapter): void {
  globalAdapter = adapter;
}

export function getEmailAdapter(): EmailAdapter {
  return globalAdapter;
}

export function resetEmailAdapter(): void {
  globalAdapter = new SmtpEmailAdapter();
}
