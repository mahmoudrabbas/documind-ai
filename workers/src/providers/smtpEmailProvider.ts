import nodemailer from "nodemailer";
import type {
  EmailDispatchPort,
  EmailDispatchInput,
  EmailDispatchResult,
} from "./emailDispatchPort.js";
import { config } from "../config/index.js";
import { logger } from "../logger.js";

export class SmtpEmailProvider implements EmailDispatchPort {
  async send(input: EmailDispatchInput): Promise<EmailDispatchResult> {
    const missingFields: string[] = [];
    if (!config.SMTP_HOST) missingFields.push("SMTP_HOST");
    if (!config.SMTP_USER) missingFields.push("SMTP_USER");
    if (!config.SMTP_PASS) missingFields.push("SMTP_PASS");
    if (!config.SMTP_FROM) missingFields.push("SMTP_FROM");

    if (missingFields.length > 0) {
      return {
        providerMessageId: null,
        state: "PERMANENT_FAILURE",
        errorCategory: "config_missing",
        errorMessage: `Missing SMTP config: ${missingFields.join(", ")}`,
      };
    }

    try {
      const transporter = nodemailer.createTransport({
        host: config.SMTP_HOST,
        port: config.SMTP_PORT,
        secure: config.SMTP_SECURE,
        auth: { user: config.SMTP_USER, pass: config.SMTP_PASS },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 10000,
      });

      const info = await transporter.sendMail({
        from: config.SMTP_FROM,
        to: input.to,
        subject: input.subject,
        text: input.text,
        html: input.html,
        messageId: input.messageId, // Embed internal message ID for tracking
      });

      return {
        providerMessageId: info.messageId || null,
        state: "SENT",
      };
    } catch (err: unknown) {
      const error = err as Error & { code?: string };
      logger.warn({ err: error, messageId: input.messageId }, "SMTP send failed");

      const msg = error.message || "Unknown error";
      const code = error.code || "UNKNOWN";

      let state: "TEMPORARY_FAILURE" | "PERMANENT_FAILURE" =
        "TEMPORARY_FAILURE";
      let category = "smtp_error";

      if (
        code === "EAUTH" ||
        code === "EENVELOPE" ||
        msg.includes("550") ||
        msg.includes("553")
      ) {
        state = "PERMANENT_FAILURE";
        category = "rejected";
      } else if (
        code === "ETIMEDOUT" ||
        code === "ESOCKETTIMEDOUT" ||
        code === "ECONNRESET"
      ) {
        state = "TEMPORARY_FAILURE";
        category = "timeout";
      }

      return {
        providerMessageId: null,
        state,
        errorCategory: category,
        errorMessage: msg.substring(0, 500),
      };
    }
  }
}
