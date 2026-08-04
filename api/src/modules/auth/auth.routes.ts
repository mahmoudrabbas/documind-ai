import { Router } from "express";
import {
  loginController,
  superAdminLoginController,
  logoutController,
  logoutAllController,
  revokeOtherSessionsController,
  meController,
  refreshController,
  registerController,
  resendVerificationEmailController,
  verifyEmailController,
  forgotPasswordController,
  resetPasswordController,
  completeTrialController,
  testVerificationTokenController,
} from "./auth.controller.js";
import { authenticate } from "../../common/middlewares/authenticate.middleware.js";
import {
  authRateLimiter,
  resendVerificationEmailRateLimiter,
} from "../../common/middlewares/rateLimit.middleware.js";
import { tenantScoping } from "../../common/middlewares/tenantScoping.middleware.js";

const router = Router();

router.use(authRateLimiter());

router.post("/register", registerController);

/**
 * @openapi
 * /auth/login:
 *   post:
 *     summary: Login
 *     description: Authenticates a user with company slug, email and password.
 *       Returns user, tenant and token information. The refresh token is
 *       delivered as an HTTP-only cookie.
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [companySlug, email, password]
 *             properties:
 *               companySlug:
 *                 type: string
 *                 description: Tenant/company slug
 *                 example: acme
 *               email:
 *                 type: string
 *                 format: email
 *                 example: admin@acme.com
 *               password:
 *                 type: string
 *                 format: password
 *                 example: "StrongPass123"
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Login successful
 *                 data:
 *                   type: object
 *                   properties:
 *                     user:
 *                       type: object
 *                     tenant:
 *                       type: object
 *                     tokens:
 *                       type: object
 *                       properties:
 *                         accessToken:
 *                           type: string
 *                         refreshToken:
 *                           type: string
 *       400:
 *         description: Validation error
 *       401:
 *         description: Invalid credentials
 */
router.post("/login", loginController);
router.post("/super-admin/login", superAdminLoginController);
router.post("/refresh", refreshController);
router.post("/logout", logoutController);
router.post("/logout-all", authenticate, tenantScoping, logoutAllController);
router.post(
  "/revoke-other-sessions",
  authenticate,
  tenantScoping,
  revokeOtherSessionsController,
);
router.post("/complete-trial", authenticate, completeTrialController);
router.post("/verify-email", verifyEmailController);
router.post(
  "/resend-verification-email",
  resendVerificationEmailRateLimiter(),
  resendVerificationEmailController,
);
router.post("/forgot-password", forgotPasswordController);
router.post("/reset-password", resetPasswordController);
router.get("/me", authenticate, tenantScoping, meController);

router.post("/test/verify-email-token", testVerificationTokenController);

export default router;
