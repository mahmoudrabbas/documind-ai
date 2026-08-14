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

/**
 * @openapi
 * /auth/register:
 *   post:
 *     summary: Register tenant and company admin
 *     description: Creates a new tenant with a company admin account, provisions
 *       the subscription and sends an email verification link. The account is
 *       activated once the email is verified. Registration can be disabled via
 *       global settings.
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [companyName, adminName, email, password]
 *             properties:
 *               companyName:
 *                 type: string
 *                 description: Company name
 *                 example: Acme Corp
 *               companySlug:
 *                 type: string
 *                 description: Optional tenant slug; derived from companyName if omitted
 *                 example: acme
 *               adminName:
 *                 type: string
 *                 description: Name of the company admin
 *                 example: Jane Doe
 *               email:
 *                 type: string
 *                 format: email
 *                 example: admin@acme.com
 *               password:
 *                 type: string
 *                 format: password
 *                 example: "StrongPass123"
 *               packageCode:
 *                 type: string
 *                 description: Optional package to provision
 *                 example: starter
 *     responses:
 *       201:
 *         description: Tenant and admin created
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
 *                 data:
 *                   type: object
 *                   properties:
 *                     tenant:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         name:
 *                           type: string
 *                         slug:
 *                           type: string
 *                         status:
 *                           type: string
 *                         plan:
 *                           type: string
 *                         createdAt:
 *                           type: string
 *                           format: date-time
 *                     user:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         tenantId:
 *                           type: string
 *                         name:
 *                           type: string
 *                         email:
 *                           type: string
 *                         role:
 *                           type: string
 *                         status:
 *                           type: string
 *                         emailVerified:
 *                           type: boolean
 *                         createdAt:
 *                           type: string
 *                           format: date-time
 *       400:
 *         description: Validation error
 *       403:
 *         description: Registration disabled
 *       409:
 *         description: Tenant or email already exists
 */
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
/**
 * @openapi
 * /auth/super-admin/login:
 *   post:
 *     summary: Super admin login
 *     description: Authenticates a super admin with email and password. Returns
 *       user, tenant and token information. The refresh token is delivered as an
 *       HTTP-only cookie.
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: admin@documind.io
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
 *                         tokenType:
 *                           type: string
 *                         expiresIn:
 *                           type: string
 *       400:
 *         description: Validation error
 *       401:
 *         description: Invalid credentials
 */
router.post("/super-admin/login", superAdminLoginController);
/**
 * @openapi
 * /auth/refresh:
 *   post:
 *     summary: Refresh access token
 *     description: Rotates the refresh token read from the documind_refresh_token
 *       HTTP-only cookie and returns a fresh access token. A new refresh token is
 *       set back in the cookie.
 *     tags: [Auth]
 *     security: []
 *     responses:
 *       200:
 *         description: Access token refreshed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     tokens:
 *                       type: object
 *                       properties:
 *                         accessToken:
 *                           type: string
 *                         tokenType:
 *                           type: string
 *                         expiresIn:
 *                           type: string
 *       400:
 *         description: Validation error
 *       401:
 *         description: Session expired or refresh token rejected
 */
router.post("/refresh", refreshController);
/**
 * @openapi
 * /auth/logout:
 *   post:
 *     summary: Logout
 *     description: Revokes the refresh token read from the HTTP-only cookie and
 *       clears the cookie, ending the current session. Responds successfully even
 *       when no refresh token is present.
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logged out
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
 *                   example: Logged out successfully
 *       401:
 *         description: Authentication required
 */
router.post("/logout", logoutController);
/**
 * @openapi
 * /auth/logout-all:
 *   post:
 *     summary: Log out all sessions
 *     description: Revokes every active refresh session for the authenticated
 *       user. Requires the X-Confirm-Logout-All header set to true as a safety
 *       confirmation, otherwise a 409 is returned.
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: X-Confirm-Logout-All
 *         required: true
 *         schema:
 *           type: string
 *         description: Confirmation header; must equal "true"
 *     responses:
 *       200:
 *         description: All sessions revoked
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
 *       400:
 *         description: Validation error
 *       401:
 *         description: Authentication required
 *       409:
 *         description: Confirmation header missing
 */
router.post("/logout-all", authenticate, tenantScoping, logoutAllController);
/**
 * @openapi
 * /auth/revoke-other-sessions:
 *   post:
 *     summary: Revoke other sessions
 *     description: Revokes every active refresh session except the current device
 *       and bumps the session version so other access tokens are rejected. A fresh
 *       access token bound to the new session version is returned so the current
 *       device stays signed in.
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Other sessions revoked
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
 *                 data:
 *                   type: object
 *                   properties:
 *                     tokens:
 *                       type: object
 *                       properties:
 *                         accessToken:
 *                           type: string
 *                         tokenType:
 *                           type: string
 *                         expiresIn:
 *                           type: string
 *       401:
 *         description: Authentication required
 */
router.post(
  "/revoke-other-sessions",
  authenticate,
  tenantScoping,
  revokeOtherSessionsController,
);
/**
 * @openapi
 * /auth/complete-trial:
 *   post:
 *     summary: Complete trial subscription
 *     description: Transitions the tenant subscription from trial to active and
 *       updates the tenant plan. Returns the activated subscription details.
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Trial activated
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
 *                 data:
 *                   type: object
 *                   properties:
 *                     success:
 *                       type: boolean
 *                     subscription:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         packageId:
 *                           type: string
 *                         packageName:
 *                           type: string
 *                         status:
 *                           type: string
 *                         startedAt:
 *                           type: string
 *                           format: date-time
 *       401:
 *         description: Authentication required
 *       404:
 *         description: Tenant not found
 */
router.post("/complete-trial", authenticate, completeTrialController);
/**
 * @openapi
 * /auth/verify-email:
 *   post:
 *     summary: Verify email
 *     description: Verifies a user email with the token sent in the verification
 *       link. On success the user is activated and the pending tenant becomes
 *       active, allowing the user to sign in.
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token]
 *             properties:
 *               token:
 *                 type: string
 *                 description: Email verification token
 *                 example: "verify-email-token"
 *     responses:
 *       200:
 *         description: Email verified
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
 *                 data:
 *                   type: object
 *                   properties:
 *                     user:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         tenantId:
 *                           type: string
 *                         name:
 *                           type: string
 *                         email:
 *                           type: string
 *                         role:
 *                           type: string
 *                         status:
 *                           type: string
 *                         emailVerified:
 *                           type: boolean
 *                     tenant:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         status:
 *                           type: string
 *       400:
 *         description: Invalid or expired verification token
 */
router.post("/verify-email", verifyEmailController);
/**
 * @openapi
 * /auth/resend-verification-email:
 *   post:
 *     summary: Resend verification email
 *     description: Re-issues the email verification link for a pending account.
 *       Always returns the same generic message so account existence is not
 *       disclosed to callers.
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, companySlug]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: admin@acme.com
 *               companySlug:
 *                 type: string
 *                 example: acme
 *     responses:
 *       200:
 *         description: Verification email resent
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
 *       400:
 *         description: Validation error
 */
router.post(
  "/resend-verification-email",
  resendVerificationEmailRateLimiter(),
  resendVerificationEmailController,
);
/**
 * @openapi
 * /auth/forgot-password:
 *   post:
 *     summary: Forgot password
 *     description: Sends password reset instructions to the email when an active
 *       account matches the given company slug and email. Always returns a generic
 *       message to avoid account enumeration.
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, slug]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: admin@acme.com
 *               slug:
 *                 type: string
 *                 description: Tenant slug
 *                 example: acme
 *     responses:
 *       200:
 *         description: Reset instructions sent
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
 *       400:
 *         description: Validation error
 */
router.post("/forgot-password", forgotPasswordController);
/**
 * @openapi
 * /auth/reset-password:
 *   post:
 *     summary: Reset password
 *     description: Resets the account password using the token sent by email,
 *       verifying the token, slug and expiry. The password and confirmation must
 *       match.
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, slug, password, confirmPassword]
 *             properties:
 *               token:
 *                 type: string
 *                 description: Password reset token
 *                 example: "reset-password-token"
 *               slug:
 *                 type: string
 *                 description: Tenant slug
 *                 example: acme
 *               password:
 *                 type: string
 *                 format: password
 *                 example: "StrongPass123"
 *               confirmPassword:
 *                 type: string
 *                 format: password
 *                 example: "StrongPass123"
 *     responses:
 *       200:
 *         description: Password reset
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
 *       400:
 *         description: Validation error or invalid token
 */
router.post("/reset-password", resetPasswordController);
/**
 * @openapi
 * /auth/me:
 *   get:
 *     summary: Get current user
 *     description: Returns the currently authenticated user and tenant. Responds
 *       with 401 when the user or tenant no longer exists and 403 when the account
 *       is no longer active.
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current user and tenant
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     user:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         tenantId:
 *                           type: string
 *                         name:
 *                           type: string
 *                         email:
 *                           type: string
 *                         role:
 *                           type: string
 *                         status:
 *                           type: string
 *                         emailVerified:
 *                           type: boolean
 *                     tenant:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         name:
 *                           type: string
 *                         slug:
 *                           type: string
 *                         status:
 *                           type: string
 *                         plan:
 *                           type: string
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Account or tenant not active
 */
router.get("/me", authenticate, tenantScoping, meController);

/**
 * @openapi
 * /auth/test/verify-email-token:
 *   post:
 *     summary: Generate test verification token
 *     description: Test-only endpoint that mints an email verification token for a
 *       given email and company slug. Only available when the environment is set
 *       to test; returns 403 otherwise.
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, companySlug]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: admin@acme.com
 *               companySlug:
 *                 type: string
 *                 example: acme
 *     responses:
 *       200:
 *         description: Test verification token
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     token:
 *                       type: string
 *       400:
 *         description: Missing email or companySlug
 *       403:
 *         description: Only available in test environment
 */
router.post("/test/verify-email-token", testVerificationTokenController);

export default router;
