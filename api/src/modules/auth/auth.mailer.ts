import { emailService } from "../email/email.service.js";
import { config } from "../../config/index.js";
import { AppError } from "../../common/errors/AppError.js";
import { EMAIL_SENDING_FAILED } from "../../common/errors/errorCodes.js";

interface SendVerificationEmailInput {
  to: string;
  adminName: string;
  companyName: string;
  verificationUrl: string;
  tenantId: string;
}

export async function sendVerificationEmail(input: SendVerificationEmailInput) {
  if (process.env.NODE_ENV === "test") return;

  if (!config.SEND_EMAILS && config.NODE_ENV === "development") {
    console.log(`[email-verification] ${input.verificationUrl}`);
    return;
  }

  try {
    await emailService.enqueue({
      tenantId: input.tenantId,
      recipientEmail: input.to,
      templateId: "email_verification",
      language: "en",
      variables: {
        adminName: input.adminName,
        companyName: input.companyName,
        verificationUrl: input.verificationUrl,
        expiryLabel: "24 hours",
      },
      idempotencyKey: `verify-${input.tenantId}-${input.to}-${Date.now()}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to send verification email";
    if (config.NODE_ENV !== "production") {
      console.warn(`[email-verification] ${message}. Verification URL: ${input.verificationUrl}`);
      return;
    }
    throw new AppError(500, EMAIL_SENDING_FAILED, "Unable to send verification email", { details: message });
  }
}

interface SendForgotPasswordEmailInput {
  to: string;
  userName: string;
  companyName: string;
  resetUrl: string;
  tenantId: string;
}

export async function sendForgotPasswordEmail(
  input: SendForgotPasswordEmailInput,
) {
  if (process.env.NODE_ENV === "test") return;

  if (!config.SEND_EMAILS && config.NODE_ENV === "development") {
    console.info("[forgot-password] email delivery disabled");
    return;
  }

  try {
    await emailService.enqueue({
      tenantId: input.tenantId,
      recipientEmail: input.to,
      templateId: "password_reset",
      language: "en",
      variables: {
        userName: input.userName,
        companyName: input.companyName,
        resetUrl: input.resetUrl,
        expiryLabel: "15 minutes",
      },
      idempotencyKey: `pwdreset-${input.tenantId}-${input.to}-${Date.now()}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to send password reset email";
    if (config.NODE_ENV !== "production") {
      console.warn(`[forgot-password] ${message}`);
      return;
    }
    throw new AppError(500, EMAIL_SENDING_FAILED, "Unable to send password reset email", { details: message });
  }
}

export interface InvitationTemplateInput {
  companyName: string;
  inviterName?: string;
  inviterEmail?: string;
  role: import("../../common/auth/baseRoles.js").BaseRole;
  invitationUrl: string;
  expiryDate: Date;
  tenantId: string;
}

export async function sendInvitationEmail(
  input: InvitationTemplateInput & { to: string },
) {
  if (process.env.NODE_ENV === "test") return;

  if (!config.SEND_EMAILS && config.NODE_ENV === "development") {
    console.info("[user-invitation] email delivery disabled");
    return;
  }

  try {
    await emailService.enqueue({
      tenantId: input.tenantId,
      recipientEmail: input.to,
      templateId: "user_invitation",
      language: "en",
      variables: {
        companyName: input.companyName,
        inviterName: input.inviterName,
        inviterEmail: input.inviterEmail,
        role: input.role,
        invitationUrl: input.invitationUrl,
        expiryDate: input.expiryDate.toUTCString(),
      },
      idempotencyKey: `invite-${input.tenantId}-${input.to}-${Date.now()}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to send invitation email";
    if (config.NODE_ENV !== "production") {
      console.warn(`[user-invitation] ${message}`);
      return;
    }
    throw new AppError(500, EMAIL_SENDING_FAILED, "Unable to send invitation email", { details: message });
  }
}
