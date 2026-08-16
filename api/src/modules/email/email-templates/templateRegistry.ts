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
  supportEmail?: string;
}

export interface RenderedTemplate {
  subject: string;
  text: string;
  html: string;
}

const BRAND_NAVY = "#0b1f3a";
const BRAND_BLUE = "#1688f5";
const DEFAULT_ACCENT = "#1688f5";
const TEXT_BODY = "#334155";
const TEXT_MUTED = "#64748b";
const TEXT_FAINT = "#94a3b8";
const BORDER = "#e6eaf2";
const BG_BODY = "#f2f4f8";
const BG_CARD = "#ffffff";

function fontFamily(lang: "en" | "ar"): string {
  return lang === "ar"
    ? "Tahoma, 'Segoe UI', Arial, sans-serif"
    : "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
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
  const value = branding?.accentColor;
  return value && /^#[0-9a-fA-F]{6}$/.test(value) ? value : DEFAULT_ACCENT;
}

function isSafeHttpUrl(value?: string): boolean {
  return Boolean(value && /^https?:\/\//i.test(value.trim()));
}

function renderBrandHeader(
  branding: Branding | undefined,
  opts: { lang: "en" | "ar"; companyName?: string; useTenantBrand?: boolean },
): string {
  const logo = opts.useTenantBrand ? branding?.logoUrl : undefined;
  if (logo && isSafeHttpUrl(logo)) {
    return `<img src="${escapeHtml(logo)}" alt="${escapeHtml(opts.companyName ?? "DocuMind AI")}" width="160" style="display:block;width:auto;max-width:180px;height:auto;max-height:56px;border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;" />`;
  }
  return `<span dir="ltr" style="display:inline-block;font-family:${fontFamily(opts.lang)};font-size:22px;line-height:28px;font-weight:700;letter-spacing:-0.3px;color:${BRAND_NAVY};">DocuMind&nbsp;<span style="color:${BRAND_BLUE};">AI</span></span>`;
}

function renderTitle(title: string): string {
  return `<h1 style="margin:0 0 14px;font-size:24px;line-height:32px;font-weight:700;color:${BRAND_NAVY};">${title}</h1>`;
}

function renderParagraph(text: string): string {
  return `<p style="margin:0 0 20px;font-size:16px;line-height:26px;color:${TEXT_BODY};">${text}</p>`;
}

function renderNote(text: string): string {
  return `<p style="margin:0;font-size:14px;line-height:22px;color:${TEXT_MUTED};">${text}</p>`;
}

function renderButton(href: string, label: string, color: string): string {
  return `
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 auto 0 auto;">
        <tr>
          <td align="center" bgcolor="${color}" style="border-radius:10px;background-color:${color};">
            <a href="${escapeHtml(href)}" target="_blank" rel="noopener" class="email-cta" style="display:inline-block;padding:14px 30px;font-size:16px;line-height:20px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;background-color:${color};border:1px solid ${color};">${escapeHtml(label)}</a>
          </td>
        </tr>
      </table>`;
}

function renderFallbackUrl(href: string, lang: "en" | "ar"): string {
  const label =
    lang === "ar"
      ? "إذا لم يعمل الزر، انسخ والصق هذا الرابط في متصفحك:"
      : "If the button doesn't work, copy and paste this link into your browser:";
  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f6f8fb;border:1px solid ${BORDER};border-radius:10px;">
      <tr>
        <td style="padding:14px 16px;">
          <p style="margin:0 0 6px;font-size:13px;line-height:19px;color:${TEXT_MUTED};">${label}</p>
          <a href="${escapeHtml(href)}" style="font-size:13px;line-height:19px;color:${TEXT_MUTED};text-decoration:underline;word-break:break-all;overflow-wrap:break-word;word-wrap:break-word;">${escapeHtml(href)}</a>
        </td>
      </tr>
    </table>`;
}

function renderDivider(): string {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td style="padding:0;"><div style="border-top:1px solid ${BORDER};font-size:0;line-height:0;">&nbsp;</div></td></tr></table>`;
}

function renderFooter(branding: Branding | undefined, lang: "en" | "ar"): string {
  const parts: string[] = [];
  if (branding?.supportEmail) {
    const email = escapeHtml(branding.supportEmail);
    const help =
      lang === "ar"
        ? `تحتاج إلى مساعدة؟ تواصل معنا عبر البريد: <a href="mailto:${email}" style="color:${BRAND_BLUE};text-decoration:underline;">${email}</a>`
        : `Need help? Contact us at <a href="mailto:${email}" style="color:${BRAND_BLUE};text-decoration:underline;">${email}</a>`;
    parts.push(`<p style="margin:0 0 8px;font-size:13px;line-height:20px;color:${TEXT_MUTED};">${help}</p>`);
  }
  const powered = lang === "ar" ? "مدعوم من DocuMind AI" : "Powered by DocuMind AI";
  parts.push(`<p style="margin:0;font-size:12px;line-height:18px;color:${TEXT_FAINT};">${powered}</p>`);
  return parts.join("\n");
}

function spacer(px: number): string {
  return `<div style="height:${px}px;font-size:0;line-height:0;">&nbsp;</div>`;
}

function renderBodyWrapper(
  content: string,
  opts: { lang: "en" | "ar"; subject: string; preheader: string },
) {
  const { lang, subject, preheader } = opts;
  const dir = lang === "ar" ? "rtl" : "ltr";
  const family = fontFamily(lang);
  const textAlign = lang === "ar" ? "right" : "left";
  return `<!doctype html>
<html lang="${lang}" dir="${dir}" xmlns="http://www.w3.org/1999/xhtml">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="x-apple-disable-message-reformatting" />
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <meta name="color-scheme" content="light" />
    <meta name="supported-color-schemes" content="light" />
    <title>${escapeHtml(subject)}</title>
    <!--[if mso]>
    <noscript>
      <xml>
        <o:OfficeDocumentSettings>
          <o:PixelsPerInch>96</o:PixelsPerInch>
        </o:OfficeDocumentSettings>
      </xml>
    </noscript>
    <![endif]-->
    <style>
      @media only screen and (max-width: 620px) {
        .email-card { width: 100% !important; }
        .email-card-inner { padding-left: 20px !important; padding-right: 20px !important; }
        .email-cta { width: 100% !important; display: block !important; box-sizing: border-box !important; text-align: center !important; }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background-color:${BG_BODY};font-family:${family};color:${TEXT_BODY};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background-color:${BG_BODY};">
      <tr>
        <td align="center" style="padding:28px 16px;">
          <table role="presentation" class="email-card" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background-color:${BG_CARD};border-radius:14px;border:1px solid ${BORDER};">
            <tr>
              <td class="email-card-inner" style="padding:36px 40px 32px;text-align:${textAlign};">
                <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${BG_BODY};">${escapeHtml(preheader)}</div>
                ${content}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function renderInvitationMeta(expiryDate: string, isAr: boolean): string {
  const prefix = isAr ? "تنتهي هذه الدعوة " : "This invitation expires ";
  return `${prefix}<span dir="ltr">${escapeHtml(expiryDate)}</span>.`;
}

export function getTemplate(
  templateId: TemplateIdType,
  lang: "en" | "ar",
  variables: unknown,
  branding?: Branding,
): RenderedTemplate {
  const color = getBrandingColor(branding);
  const isAr = lang === "ar";

  if (templateId === "email_verification") {
    const vars = EmailVerificationVars.parse(variables);

    if (isAr) {
      const subject = "قم بتأكيد حسابك في DocuMind AI";
      const preheader = "قم بتأكيد بريدك الإلكتروني لإكمال إعداد حسابك في DocuMind AI.";
      const text = `مرحباً ${vars.adminName}،\n\nيرجى تأكيد بريدك الإلكتروني لإكمال إعداد حسابك في ${vars.companyName} على DocuMind AI.\n\nتأكيد البريد الإلكتروني:\n${vars.verificationUrl}\n\nسوف تنتهي صلاحية هذا الرابط خلال ${vars.expiryLabel}.\n\nإذا لم تقم بإنشاء هذا الحساب، يمكنك تجاهل هذه الرسالة بأمان.`;
      const html = renderBodyWrapper(
        `${renderBrandHeader(branding, { lang, useTenantBrand: false })}
        ${spacer(24)}
        ${renderTitle("قم بتأكيد بريدك الإلكتروني")}
        ${renderParagraph(`مرحباً ${escapeHtml(vars.adminName)}، تأكد من بريدك الإلكتروني لإكمال إعداد حسابك في ${escapeHtml(vars.companyName)} على DocuMind AI.`)}
        ${renderButton(vars.verificationUrl, "تأكيد البريد الإلكتروني", color)}
        ${spacer(20)}
        ${renderNote(`سوف تنتهي صلاحية هذا الرابط خلال ${escapeHtml(vars.expiryLabel)}.`)}
        ${spacer(8)}
        ${renderNote("إذا لم تقم بإنشاء هذا الحساب، يمكنك تجاهل هذه الرسالة بأمان.")}
        ${spacer(28)}
        ${renderFallbackUrl(vars.verificationUrl, lang)}
        ${spacer(28)}
        ${renderDivider()}
        ${spacer(20)}
        ${renderFooter(branding, lang)}`,
        { lang, subject, preheader },
      );
      return { subject, text, html };
    }

    const subject = "Verify your DocuMind AI account";
    const preheader = "Confirm your email address to finish setting up your DocuMind AI account.";
    const text = `Hi ${vars.adminName},\n\nConfirm your email address to finish setting up your ${vars.companyName} account on DocuMind AI.\n\nVerify your email:\n${vars.verificationUrl}\n\nThis link will expire in ${vars.expiryLabel}.\n\nIf you did not create this account, you can safely ignore this email.`;
    const html = renderBodyWrapper(
      `${renderBrandHeader(branding, { lang, useTenantBrand: false })}
      ${spacer(24)}
      ${renderTitle("Verify your email")}
      ${renderParagraph(`Hi ${escapeHtml(vars.adminName)}, confirm your email address to finish setting up your ${escapeHtml(vars.companyName)} account on DocuMind AI.`)}
      ${renderButton(vars.verificationUrl, "Verify Email", color)}
      ${spacer(20)}
      ${renderNote(`This link will expire in ${escapeHtml(vars.expiryLabel)}.`)}
      ${spacer(8)}
      ${renderNote("If you did not create this account, you can safely ignore this email.")}
      ${spacer(28)}
      ${renderFallbackUrl(vars.verificationUrl, lang)}
      ${spacer(28)}
      ${renderDivider()}
      ${spacer(20)}
      ${renderFooter(branding, lang)}`,
      { lang, subject, preheader },
    );
    return { subject, text, html };
  }

  if (templateId === "password_reset") {
    const vars = PasswordResetVars.parse(variables);

    if (isAr) {
      const subject = `إعادة تعيين كلمة مرورك في DocuMind AI لشركة ${vars.companyName}`;
      const preheader = "تلقينا طلباً لإعادة تعيين كلمة مرور حسابك في DocuMind AI.";
      const text = `مرحباً ${vars.userName}،\n\nتلقينا طلباً لإعادة تعيين كلمة مرور حسابك في ${vars.companyName} على DocuMind AI.\n\nإعادة تعيين كلمة المرور:\n${vars.resetUrl}\n\nسينتهي هذا الرابط خلال ${vars.expiryLabel}.\n\nإذا لم تطلب إعادة تعيين كلمة المرور، يمكنك تجاهل هذه الرسالة بأمان.\n\nلأسباب أمنية، ستبقى كلمة مرورك كما هي حتى تنقر على الرابط أعلاه وتقوم بتعيين كلمة مرور جديدة.`;
      const html = renderBodyWrapper(
        `${renderBrandHeader(branding, { lang, useTenantBrand: false })}
        ${spacer(24)}
        ${renderTitle("إعادة تعيين كلمة المرور")}
        ${renderParagraph(`تلقينا طلباً لإعادة تعيين كلمة مرور حسابك في ${escapeHtml(vars.companyName)} على DocuMind AI.`)}
        ${renderButton(vars.resetUrl, "إعادة تعيين كلمة المرور", color)}
        ${spacer(20)}
        ${renderNote(`سينتهي هذا الرابط خلال ${escapeHtml(vars.expiryLabel)}.`)}
        ${spacer(8)}
        ${renderNote("إذا لم تطلب إعادة تعيين كلمة المرور، يمكنك تجاهل هذه الرسالة بأمان.")}
        ${spacer(8)}
        ${renderNote("لأسباب أمنية، ستبقى كلمة مرورك كما هي حتى تنقر على الرابط أعلاه وتقوم بتعيين كلمة مرور جديدة.")}
        ${spacer(28)}
        ${renderFallbackUrl(vars.resetUrl, lang)}
        ${spacer(28)}
        ${renderDivider()}
        ${spacer(20)}
        ${renderFooter(branding, lang)}`,
        { lang, subject, preheader },
      );
      return { subject, text, html };
    }

    const subject = `Reset your ${vars.companyName} DocuMind AI password`;
    const preheader = "We received a request to reset the password for your DocuMind AI account.";
    const text = `Hi ${vars.userName},\n\nWe received a request to reset the password for your ${vars.companyName} DocuMind AI account.\n\nReset your password:\n${vars.resetUrl}\n\nThis link will expire in ${vars.expiryLabel}.\n\nIf you did not request a password reset, you can safely ignore this email.\n\nFor security reasons, your password will remain the same until you click the link above and set a new one.`;
    const html = renderBodyWrapper(
      `${renderBrandHeader(branding, { lang, useTenantBrand: false })}
      ${spacer(24)}
      ${renderTitle("Reset your password")}
      ${renderParagraph(`We received a request to reset the password for your ${escapeHtml(vars.companyName)} DocuMind AI account.`)}
      ${renderButton(vars.resetUrl, "Reset Password", color)}
      ${spacer(20)}
      ${renderNote(`This link will expire in ${escapeHtml(vars.expiryLabel)}.`)}
      ${spacer(8)}
      ${renderNote("If you did not request a password reset, you can safely ignore this email.")}
      ${spacer(8)}
      ${renderNote("For security reasons, your password will remain the same until you click the link above and set a new one.")}
      ${spacer(28)}
      ${renderFallbackUrl(vars.resetUrl, lang)}
      ${spacer(28)}
      ${renderDivider()}
      ${spacer(20)}
      ${renderFooter(branding, lang)}`,
      { lang, subject, preheader },
    );
    return { subject, text, html };
  }

  if (templateId === "user_invitation" || templateId === "invitation_reminder") {
    const vars = UserInvitationVars.parse(variables);

    const inviterName = vars.inviterName || "A company administrator";
    const inviterEmailText = vars.inviterEmail ? ` (${vars.inviterEmail})` : "";
    const roleFormatted = vars.role.replaceAll("_", " ").toLowerCase();

    if (isAr) {
      const subject =
        templateId === "invitation_reminder"
          ? `تذكير: دعوة للانضمام إلى ${vars.companyName}`
          : `لقد تمت دعوتك للانضمام إلى ${vars.companyName}`;
      const preheader = `أنت مدعو للانضمام إلى ${vars.companyName} على DocuMind AI.`;
      const inviterNameAr = vars.inviterName || "أحد مسؤولي الشركة";

      const text = `أنت مدعو للانضمام إلى ${vars.companyName}\n\nدعاك ${inviterNameAr}${inviterEmailText} للانضمام إلى ${vars.companyName} على DocuMind AI بصفتك ${roleFormatted}.\n\nقبول الدعوة:\n${vars.invitationUrl}\n\nتنتهي هذه الدعوة ${vars.expiryDate}. إذا لم تكن تتوقع هذه الدعوة، يمكنك تجاهل هذه الرسالة بأمان.`;
      const html = renderBodyWrapper(
        `${renderBrandHeader(branding, { lang, useTenantBrand: true, companyName: vars.companyName })}
        ${spacer(24)}
        ${renderTitle(`أنت مدعو للانضمام إلى ${escapeHtml(vars.companyName)}`)}
        ${renderParagraph(`دعاك ${escapeHtml(inviterNameAr)}${escapeHtml(inviterEmailText)} للانضمام إلى ${escapeHtml(vars.companyName)} على DocuMind AI بصفتك <span dir="ltr"><strong>${escapeHtml(roleFormatted)}</strong></span>.`)}
        ${renderButton(vars.invitationUrl, "قبول الدعوة", color)}
        ${spacer(20)}
        ${renderNote(renderInvitationMeta(vars.expiryDate, true))}
        ${spacer(8)}
        ${renderNote("إذا لم تكن تتوقع هذه الدعوة، يمكنك تجاهل هذه الرسالة بأمان.")}
        ${spacer(28)}
        ${renderFallbackUrl(vars.invitationUrl, lang)}
        ${spacer(28)}
        ${renderDivider()}
        ${spacer(20)}
        ${renderFooter(branding, lang)}`,
        { lang, subject, preheader },
      );
      return { subject, text, html };
    }

    const subject =
      templateId === "invitation_reminder"
        ? `Reminder: You have been invited to join ${vars.companyName} on DocuMind AI`
        : `You have been invited to join ${vars.companyName} on DocuMind AI`;
    const preheader = `You're invited to join ${vars.companyName} on DocuMind AI.`;

    const text = `You're invited to join ${vars.companyName}\n\n${inviterName}${inviterEmailText} invited you to join ${vars.companyName} on DocuMind AI as ${roleFormatted}.\n\nAccept invitation:\n${vars.invitationUrl}\n\nThis invitation expires ${vars.expiryDate}. If you were not expecting this invitation, you can safely ignore this email.`;
    const html = renderBodyWrapper(
      `${renderBrandHeader(branding, { lang, useTenantBrand: true, companyName: vars.companyName })}
      ${spacer(24)}
      ${renderTitle(`You're invited to join ${escapeHtml(vars.companyName)}`)}
      ${renderParagraph(`${escapeHtml(inviterName)}${escapeHtml(inviterEmailText)} invited you to join ${escapeHtml(vars.companyName)} on DocuMind AI as <strong>${escapeHtml(roleFormatted)}</strong>.`)}
      ${renderButton(vars.invitationUrl, "Accept Invitation", color)}
      ${spacer(20)}
      ${renderNote(renderInvitationMeta(vars.expiryDate, false))}
      ${spacer(8)}
      ${renderNote("If you were not expecting this invitation, you can safely ignore this email.")}
      ${spacer(28)}
      ${renderFallbackUrl(vars.invitationUrl, lang)}
      ${spacer(28)}
      ${renderDivider()}
      ${spacer(20)}
      ${renderFooter(branding, lang)}`,
      { lang, subject, preheader },
    );
    return { subject, text, html };
  }

  throw new Error(`Unsupported template ID: ${templateId}`);
}
