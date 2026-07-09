import test from "node:test";
import { config } from "../../config/index.js";
import { sendVerificationEmail } from "./auth.mailer.js";
test("sendVerificationEmail resolves when SMTP configuration is missing in development", async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalConfig = { ...config };
    try {
        process.env.NODE_ENV = "development";
        config.SEND_EMAILS = true;
        config.SMTP_HOST = "";
        config.SMTP_USER = "";
        config.SMTP_PASS = "";
        config.SMTP_FROM = "";
        await sendVerificationEmail({
            to: "test@example.com",
            adminName: "Test Admin",
            companyName: "Test Company",
            verificationUrl: "http://localhost:3000/verify-email?token=test-token",
        });
    }
    finally {
        process.env.NODE_ENV = originalNodeEnv;
        Object.assign(config, originalConfig);
    }
});
//# sourceMappingURL=auth.mailer.test.js.map