import { z } from "zod";

export const TemplateId = z.enum([
  "email_verification",
  "password_reset",
  "user_invitation",
  "invitation_reminder",
]);
export type TemplateIdType = z.infer<typeof TemplateId>;

export const EmailVerificationVars = z.object({
  adminName: z.string(),
  companyName: z.string(),
  verificationUrl: z.string(),
  expiryLabel: z.string(),
});

export const PasswordResetVars = z.object({
  userName: z.string(),
  companyName: z.string(),
  resetUrl: z.string(),
  expiryLabel: z.string(),
});

export const UserInvitationVars = z.object({
  companyName: z.string(),
  inviterName: z.string().optional(),
  inviterEmail: z.string().optional(),
  role: z.string(),
  invitationUrl: z.string(),
  expiryDate: z.string(),
});

export const InvitationReminderVars = UserInvitationVars;

export const TemplateVariablesSchema = z.union([
  EmailVerificationVars,
  PasswordResetVars,
  UserInvitationVars,
]);

export interface Branding {
  accentColor?: string;
  logoUrl?: string;
}

export interface RenderedTemplate {
  subject: string;
  text: string;
  html: string;
}

export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getBrandingColor(branding?: Branding) {
  return branding?.accentColor || "#4f46e5";
}

function renderHeader(companyName: string, branding?: Branding) {
  if (branding?.logoUrl) {
    return `<img src="${escapeHtml(branding.logoUrl)}" alt="${escapeHtml(companyName)}" height="40" style="margin:0 0 20px;" />`;
  }
  return `<h1 style="margin:0 0 20px;font-size:24px;line-height:32px;font-weight:700;color:#111827;">${escapeHtml(companyName)}</h1>`;
}

function renderBodyWrapper(content: string, lang: "en" | "ar") {
  const dir = lang === "ar" ? "rtl" : "ltr";
  const fontFamily =
    lang === "ar"
      ? "Tahoma, Arial, sans-serif"
      : "Arial, sans-serif";
  return `<!doctype html>
<html lang="${lang}" dir="${dir}">
  <body style="margin:0;padding:0;background:#f4f7fb;font-family:${fontFamily};color:#111827;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f7fb;padding:32px 0;">
      <tr>
        <td align="center" style="padding:0 16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:16px;padding:32px;border:1px solid #e5e7eb;text-align:${lang === "ar" ? "right" : "left"};">
            <tr>
              <td style="padding:0;">
                ${content}
              </td>
            </tr>
          </table>
          <p style="margin:16px 0 0;font-size:12px;line-height:18px;color:#6b7280;text-align:center;">DocuMind AI Powered</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function getTemplate(
  templateId: TemplateIdType,
  lang: "en" | "ar",
  variables: unknown,
  branding?: Branding,
): RenderedTemplate {
  const color = getBrandingColor(branding);

  if (templateId === "email_verification") {
    const vars = EmailVerificationVars.parse(variables);
    const header = renderHeader(vars.companyName, branding);
    
    if (lang === "ar") {
      const subject = `قم بتأكيد حسابك في DocuMind AI`;
      const text = `مرحباً ${vars.adminName},\n\nيرجى تأكيد حسابك في ${vars.companyName}.\n\nقم بتأكيد بريدك الإلكتروني:\n${vars.verificationUrl}\n\nسوف تنتهي صلاحية هذا الرابط خلال ${vars.expiryLabel}.\n\nإذا لم تقم بإنشاء هذا الحساب، يمكنك تجاهل هذه الرسالة.`;
      const htmlContent = `${header}
        <p style="margin:0 0 16px;font-size:16px;line-height:24px;color:#374151;">مرحباً ${escapeHtml(vars.adminName)}،</p>
        <p style="margin:0 0 24px;font-size:16px;line-height:24px;color:#374151;">يرجى تأكيد حسابك لشركة ${escapeHtml(vars.companyName)}.</p>
        <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 24px;">
          <tr>
            <td bgcolor="${color}" style="border-radius:8px;">
              <a href="${escapeHtml(vars.verificationUrl)}" style="display:inline-block;padding:12px 22px;font-size:16px;line-height:20px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:8px;background:${color};">تأكيد البريد الإلكتروني</a>
            </td>
          </tr>
        </table>
        <p style="margin:0 0 8px;font-size:14px;line-height:22px;color:#4b5563;">إذا كان الزر لا يعمل، انسخ والصق هذا الرابط في متصفحك:</p>
        <p style="margin:0 0 24px;font-size:14px;line-height:22px;word-break:break-all;">
          <a href="${escapeHtml(vars.verificationUrl)}" style="color:${color};text-decoration:underline;">${escapeHtml(vars.verificationUrl)}</a>
        </p>
        <p style="margin:0 0 16px;font-size:14px;line-height:22px;color:#4b5563;">سوف تنتهي صلاحية هذا الرابط خلال ${escapeHtml(vars.expiryLabel)}.</p>
        <p style="margin:0;font-size:14px;line-height:22px;color:#6b7280;">إذا لم تقم بإنشاء هذا الحساب، يمكنك تجاهل هذه الرسالة بأمان.</p>`;
      return { subject, text, html: renderBodyWrapper(htmlContent, lang) };
    }

    const subject = "Verify your DocuMind AI account";
    const text = `Hi ${vars.adminName},\n\nPlease verify your DocuMind AI account for ${vars.companyName}.\n\nVerify your email:\n${vars.verificationUrl}\n\nThis link will expire in ${vars.expiryLabel}.\n\nIf you did not create this account, you can safely ignore this email.`;
    const htmlContent = `${header}
      <p style="margin:0 0 16px;font-size:16px;line-height:24px;color:#374151;">Hi ${escapeHtml(vars.adminName)},</p>
      <p style="margin:0 0 24px;font-size:16px;line-height:24px;color:#374151;">Please verify your DocuMind AI account for ${escapeHtml(vars.companyName)}.</p>
      <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 24px;">
        <tr>
          <td bgcolor="${color}" style="border-radius:8px;">
            <a href="${escapeHtml(vars.verificationUrl)}" style="display:inline-block;padding:12px 22px;font-size:16px;line-height:20px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:8px;background:${color};">Verify Email</a>
          </td>
        </tr>
      </table>
      <p style="margin:0 0 8px;font-size:14px;line-height:22px;color:#4b5563;">If the button does not work, copy and paste this link into your browser:</p>
      <p style="margin:0 0 24px;font-size:14px;line-height:22px;word-break:break-all;">
        <a href="${escapeHtml(vars.verificationUrl)}" style="color:${color};text-decoration:underline;">${escapeHtml(vars.verificationUrl)}</a>
      </p>
      <p style="margin:0 0 16px;font-size:14px;line-height:22px;color:#4b5563;">This link will expire in ${escapeHtml(vars.expiryLabel)}.</p>
      <p style="margin:0;font-size:14px;line-height:22px;color:#6b7280;">If you did not create this account, you can safely ignore this email.</p>`;
    return { subject, text, html: renderBodyWrapper(htmlContent, lang) };
  }

  if (templateId === "password_reset") {
    const vars = PasswordResetVars.parse(variables);
    const header = renderHeader(vars.companyName, branding);

    if (lang === "ar") {
      const subject = `إعادة تعيين كلمة مرورك في DocuMind AI لشركة ${vars.companyName}`;
      const text = `مرحباً ${vars.userName},\n\nتلقينا طلباً لإعادة تعيين كلمة مرور حسابك في DocuMind AI لشركة ${vars.companyName}.\n\nأعد تعيين كلمة المرور:\n${vars.resetUrl}\n\nسينتهي هذا الرابط خلال ${vars.expiryLabel}.\n\nإذا لم تطلب إعادة تعيين كلمة المرور، يمكنك تجاهل هذه الرسالة.\n\nلأسباب أمنية، ستبقى كلمة مرورك كما هي حتى تنقر على الرابط أعلاه وتقوم بتعيين كلمة مرور جديدة.`;
      const htmlContent = `${header}
        <p style="margin:0 0 16px;font-size:16px;line-height:24px;color:#374151;">مرحباً ${escapeHtml(vars.userName)}،</p>
        <p style="margin:0 0 24px;font-size:16px;line-height:24px;color:#374151;">لقد تلقينا طلباً لإعادة تعيين كلمة المرور لحسابك في ${escapeHtml(vars.companyName)}.</p>
        <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 24px;">
          <tr>
            <td bgcolor="${color}" style="border-radius:8px;">
              <a href="${escapeHtml(vars.resetUrl)}" style="display:inline-block;padding:12px 22px;font-size:16px;line-height:20px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:8px;background:${color};">إعادة تعيين كلمة المرور</a>
            </td>
          </tr>
        </table>
        <p style="margin:0 0 8px;font-size:14px;line-height:22px;color:#4b5563;">إذا كان الزر لا يعمل، انسخ والصق هذا الرابط في متصفحك:</p>
        <p style="margin:0 0 24px;font-size:14px;line-height:22px;word-break:break-all;">
          <a href="${escapeHtml(vars.resetUrl)}" style="color:${color};text-decoration:underline;">${escapeHtml(vars.resetUrl)}</a>
        </p>
        <p style="margin:0 0 16px;font-size:14px;line-height:22px;color:#4b5563;">سينتهي هذا الرابط خلال ${escapeHtml(vars.expiryLabel)}.</p>
        <p style="margin:0 0 16px;font-size:14px;line-height:22px;color:#6b7280;">إذا لم تطلب إعادة تعيين كلمة المرور، يمكنك تجاهل هذه الرسالة.</p>
        <p style="margin:0;font-size:14px;line-height:22px;color:#6b7280;">لأسباب أمنية، ستبقى كلمة مرورك كما هي حتى تنقر على الرابط وتقوم بتعيين كلمة جديدة.</p>`;
      return { subject, text, html: renderBodyWrapper(htmlContent, lang) };
    }

    const subject = `Reset your ${vars.companyName} DocuMind AI password`;
    const text = `Hi ${vars.userName},\n\nWe received a request to reset the password for your ${vars.companyName} DocuMind AI account.\n\nReset your password:\n${vars.resetUrl}\n\nThis link will expire in ${vars.expiryLabel}.\n\nIf you did not request a password reset, you can safely ignore this email.\n\nFor security reasons, your password will remain the same until you click the link above and set a new one.`;
    const htmlContent = `${header}
      <p style="margin:0 0 16px;font-size:16px;line-height:24px;color:#374151;">Hi ${escapeHtml(vars.userName)},</p>
      <p style="margin:0 0 24px;font-size:16px;line-height:24px;color:#374151;">We received a request to reset the password for your ${escapeHtml(vars.companyName)} DocuMind AI account.</p>
      <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 24px;">
        <tr>
          <td bgcolor="${color}" style="border-radius:8px;">
            <a href="${escapeHtml(vars.resetUrl)}" style="display:inline-block;padding:12px 22px;font-size:16px;line-height:20px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:8px;background:${color};">Reset Password</a>
          </td>
        </tr>
      </table>
      <p style="margin:0 0 8px;font-size:14px;line-height:22px;color:#4b5563;">If the button does not work, copy and paste this link into your browser:</p>
      <p style="margin:0 0 24px;font-size:14px;line-height:22px;word-break:break-all;">
        <a href="${escapeHtml(vars.resetUrl)}" style="color:${color};text-decoration:underline;">${escapeHtml(vars.resetUrl)}</a>
      </p>
      <p style="margin:0 0 16px;font-size:14px;line-height:22px;color:#4b5563;">This link will expire in ${escapeHtml(vars.expiryLabel)}.</p>
      <p style="margin:0 0 16px;font-size:14px;line-height:22px;color:#6b7280;">If you did not request a password reset, you can safely ignore this email.</p>
      <p style="margin:0;font-size:14px;line-height:22px;color:#6b7280;">For security reasons, your password will remain the same until you click the link above and set a new one.</p>`;
    return { subject, text, html: renderBodyWrapper(htmlContent, lang) };
  }

  if (templateId === "user_invitation" || templateId === "invitation_reminder") {
    const vars = UserInvitationVars.parse(variables);
    const header = renderHeader(vars.companyName, branding);
    
    const inviterName = vars.inviterName || "A company administrator";
    const inviterEmailText = vars.inviterEmail ? ` (${vars.inviterEmail})` : "";
    const roleFormatted = vars.role.replaceAll("_", " ").toLowerCase();

    if (lang === "ar") {
      const subject = templateId === "invitation_reminder" 
        ? `تذكير: دعوة للانضمام إلى ${vars.companyName}` 
        : `لقد تمت دعوتك للانضمام إلى ${vars.companyName}`;
        
      const inviterNameAr = vars.inviterName || "أحد مسؤولي الشركة";

      const text = `لقد تمت دعوتك للانضمام إلى ${vars.companyName}\n\nقام ${inviterNameAr}${inviterEmailText} بدعوتك للانضمام إلى ${vars.companyName} بصفتك ${roleFormatted} على منصة DocuMind AI.\n\nاقبل الدعوة:\n${vars.invitationUrl}\n\nتنتهي هذه الدعوة في ${vars.expiryDate}. إذا لم تكن تتوقعها، يمكنك تجاهل هذه الرسالة.`;
      const htmlContent = `${header}
        <h1 style="margin:0 0 18px;font-size:24px;line-height:32px;">لقد تمت دعوتك للانضمام إلى ${escapeHtml(vars.companyName)}</h1>
        <p style="margin:0 0 22px;font-size:16px;line-height:24px;color:#374151;">قام ${escapeHtml(inviterNameAr)}${escapeHtml(inviterEmailText)} بدعوتك للانضمام إلى ${escapeHtml(vars.companyName)} بصفتك <strong>${escapeHtml(roleFormatted)}</strong>.</p>
        <table role="presentation" cellspacing="0" cellpadding="0">
          <tr>
            <td bgcolor="${color}" style="border-radius:8px;">
              <a href="${escapeHtml(vars.invitationUrl)}" style="display:inline-block;padding:12px 22px;color:#fff;text-decoration:none;font-weight:700;background:${color};border-radius:8px;">قبول الدعوة</a>
            </td>
          </tr>
        </table>
        <p style="margin:24px 0 8px;font-size:14px;line-height:20px;color:#64748b;">إذا كان الزر لا يعمل، استخدم هذا الرابط:</p>
        <p style="margin:0 0 22px;font-size:14px;line-height:20px;word-break:break-all;">
          <a href="${escapeHtml(vars.invitationUrl)}" style="color:${color};">${escapeHtml(vars.invitationUrl)}</a>
        </p>
        <p style="margin:0;font-size:14px;line-height:20px;color:#64748b;">تنتهي هذه الدعوة في ${escapeHtml(vars.expiryDate)}. إذا لم تكن تتوقعها، يمكنك تجاهل هذه الرسالة.</p>`;
      return { subject, text, html: renderBodyWrapper(htmlContent, lang) };
    }

    const subject = templateId === "invitation_reminder" 
      ? `Reminder: Invitation to join ${vars.companyName} on DocuMind AI`
      : `You have been invited to join ${vars.companyName} on DocuMind AI`;

    const text = `You have been invited to join ${vars.companyName}\n\n${inviterName}${inviterEmailText} invited you to join ${vars.companyName} as ${roleFormatted} on DocuMind AI.\n\nAccept invitation:\n${vars.invitationUrl}\n\nThis invitation expires on ${vars.expiryDate}. If you were not expecting it, you can ignore this email.`;
    const htmlContent = `${header}
      <h1 style="margin:0 0 18px;font-size:24px;line-height:32px;">You have been invited to join ${escapeHtml(vars.companyName)}</h1>
      <p style="margin:0 0 22px;font-size:16px;line-height:24px;color:#374151;">${escapeHtml(inviterName)}${escapeHtml(inviterEmailText)} invited you to join ${escapeHtml(vars.companyName)} as <strong>${escapeHtml(roleFormatted)}</strong>.</p>
      <table role="presentation" cellspacing="0" cellpadding="0">
        <tr>
          <td bgcolor="${color}" style="border-radius:8px;">
            <a href="${escapeHtml(vars.invitationUrl)}" style="display:inline-block;padding:12px 22px;color:#fff;text-decoration:none;font-weight:700;background:${color};border-radius:8px;">Accept invitation</a>
          </td>
        </tr>
      </table>
      <p style="margin:24px 0 8px;font-size:14px;line-height:20px;color:#64748b;">If the button does not work, use this link:</p>
      <p style="margin:0 0 22px;font-size:14px;line-height:20px;word-break:break-all;">
        <a href="${escapeHtml(vars.invitationUrl)}" style="color:${color};">${escapeHtml(vars.invitationUrl)}</a>
      </p>
      <p style="margin:0;font-size:14px;line-height:20px;color:#64748b;">This invitation expires on ${escapeHtml(vars.expiryDate)}. If you were not expecting it, you can ignore this email.</p>`;
    return { subject, text, html: renderBodyWrapper(htmlContent, lang) };
  }

  throw new Error(`Unsupported template ID: ${templateId}`);
}
