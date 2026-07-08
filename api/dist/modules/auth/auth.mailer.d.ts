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
export declare function buildEmailVerificationTemplate(input: BuildEmailVerificationTemplateInput): EmailVerificationTemplate;
export declare function sendVerificationEmail(input: SendVerificationEmailInput): Promise<void>;
export {};
//# sourceMappingURL=auth.mailer.d.ts.map