import nodemailer from "nodemailer";
import { AppError } from "../../common/errors/AppError.js";
import { EMAIL_SENDING_FAILED } from "../../common/errors/errorCodes.js";
import { config } from "../../config/index.js";

interface SendVerificationEmailInput {
  to: string;
  adminName: string;
  companyName: string;
  verificationUrl: string;
}

interface BuildEmailVerificationTemplateInput {
  adminName: string;
  companyName: string;
  verificationUrl: string;
  expiryLabel: string;
}

interface EmailVerificationTemplate {
  subject: string;
  text: string;
  html: string;
}

export function buildEmailVerificationTemplate(
  input: BuildEmailVerificationTemplateInput
): EmailVerificationTemplate {
  const subject = "Verify your DocuMind AI account";
  const escapedAdminName = escapeHtml(input.adminName);
  const escapedCompanyName = escapeHtml(input.companyName);
  const escapedVerificationUrl = escapeHtml(input.verificationUrl);
  const escapedExpiryLabel = escapeHtml(input.expiryLabel);

  return {
    subject,
    text: [
      `Hi ${input.adminName},`,
      "",
      `Please verify your DocuMind AI account for ${input.companyName}.`,
      "",
      "Verify your email:",
      input.verificationUrl,
      "",
      `This link will expire in ${input.expiryLabel}.`,
      "",
      "If you did not create this account, you can safely ignore this email.",
    ].join("\n"),
    html: `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f7fb;font-family:Arial,sans-serif;color:#111827;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f7fb;padding:32px 0;">
      <tr>
        <td align="center" style="padding:0 16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:16px;padding:32px;border:1px solid #e5e7eb;">
            <tr>
              <td style="padding:0;">
                <h1 style="margin:0 0 20px;font-size:24px;line-height:32px;font-weight:700;color:#111827;">DocuMind AI</h1>
                <p style="margin:0 0 16px;font-size:16px;line-height:24px;color:#374151;">Hi ${escapedAdminName},</p>
                <p style="margin:0 0 24px;font-size:16px;line-height:24px;color:#374151;">Please verify your DocuMind AI account for ${escapedCompanyName}.</p>
                <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 24px;">
                  <tr>
                    <td bgcolor="#4f46e5" style="border-radius:8px;">
                      <a href="${escapedVerificationUrl}" style="display:inline-block;padding:12px 22px;font-size:16px;line-height:20px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:8px;background:#4f46e5;">Verify Email</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 8px;font-size:14px;line-height:22px;color:#4b5563;">If the button does not work, copy and paste this link into your browser:</p>
                <p style="margin:0 0 24px;font-size:14px;line-height:22px;word-break:break-all;">
                  <a href="${escapedVerificationUrl}" style="color:#4f46e5;text-decoration:underline;">${escapedVerificationUrl}</a>
                </p>
                <p style="margin:0 0 16px;font-size:14px;line-height:22px;color:#4b5563;">This link will expire in ${escapedExpiryLabel}.</p>
                <p style="margin:0;font-size:14px;line-height:22px;color:#6b7280;">If you did not create this account, you can safely ignore this email.</p>
              </td>
            </tr>
          </table>
          <p style="margin:16px 0 0;font-size:12px;line-height:18px;color:#6b7280;">DocuMind AI account security</p>
        </td>
      </tr>
    </table>
  </body>
</html>`,
  };
}

export async function sendVerificationEmail(input: SendVerificationEmailInput) {
  if (process.env.NODE_ENV === "test") {
    return;
  }

  if (!config.SEND_EMAILS) {
    if (config.NODE_ENV === "development") {
      console.log(`[email-verification] ${input.verificationUrl}`);
    }

    return;
  }

  const missingFields: string[] = [];

  if (!config.SMTP_HOST) missingFields.push("SMTP_HOST");
  if (!config.SMTP_USER) missingFields.push("SMTP_USER");
  if (!config.SMTP_PASS) missingFields.push("SMTP_PASS");
  if (!config.SMTP_FROM) missingFields.push("SMTP_FROM");

  if (missingFields.length > 0) {
    const message = `Missing SMTP config: ${missingFields.join(", ")}`;

    if (config.NODE_ENV !== "production") {
      console.warn(
        `[email-verification] ${message}. Verification URL: ${input.verificationUrl}`,
      );
      return;
    }

    throw new AppError(
      500,
      EMAIL_SENDING_FAILED,
      "SMTP is not configured",
      { missingFields },
    );
  }

  const template = buildEmailVerificationTemplate({
    adminName: input.adminName,
    companyName: input.companyName,
    verificationUrl: input.verificationUrl,
    expiryLabel: "24 hours",
  });

  const transporter = nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_SECURE,
    auth: {
      user: config.SMTP_USER,
      pass: config.SMTP_PASS,
    },
  });

  try {
    await transporter.sendMail({
      from: config.SMTP_FROM,
      to: input.to,
      subject: template.subject,
      text: template.text,
      html: template.html,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to send verification email";

    if (config.NODE_ENV !== "production") {
      console.warn(
        `[email-verification] ${message}. Verification URL: ${input.verificationUrl}`,
      );
      return;
    }

    throw new AppError(
      500,
      EMAIL_SENDING_FAILED,
      "Unable to send verification email",
      { details: message },
    );
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
