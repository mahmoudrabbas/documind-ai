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
export interface InvitationTemplateInput {
    companyName: string;
    inviterName?: string;
    inviterEmail?: string;
    role: string;
    invitationUrl: string;
    expiryDate: Date;
}
export declare function buildInvitationTemplate(input: InvitationTemplateInput): EmailVerificationTemplate;
export declare function buildEmailVerificationTemplate(input: BuildEmailVerificationTemplateInput): EmailVerificationTemplate;
export declare function sendVerificationEmail(input: SendVerificationEmailInput): Promise<void>;
interface SendForgotPasswordEmailInput {
    to: string;
    userName: string;
    companyName: string;
    resetUrl: string;
}
export declare function buildForgotPasswordTemplate(input: {
    userName: string;
    companyName: string;
    resetUrl: string;
    expiryLabel: string;
}): {
    subject: string;
    text: string;
    html: string;
};
export declare function sendForgotPasswordEmail(input: SendForgotPasswordEmailInput): Promise<void>;
export declare function sendInvitationEmail(input: InvitationTemplateInput & {
    to: string;
}): Promise<void>;
export {};
//# sourceMappingURL=auth.mailer.d.ts.map