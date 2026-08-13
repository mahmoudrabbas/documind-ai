import { Router } from "express";
import { authenticate } from "../../common/middlewares/authenticate.middleware.js";
import { tenantScoping } from "../../common/middlewares/tenantScoping.middleware.js";
import { requirePermission } from "../permissions/permissions.middleware.js";
import { Permission } from "../permissions/permissions.catalog.js";
import { createRateLimiter } from "../../common/middlewares/rateLimit.middleware.js";
import {
  inviteUserController,
  listUsersController,
  updateUserController,
  deleteUserController,
  setPasswordFromInviteController,
  getInviteDetailsController,
  resendInvitationController,
  revokeInvitationController,
} from "./users.controller.js";
import {
  validateInviteUserInput,
  validateListUsersInput,
  validateUpdateUserInput,
} from "./users.validator.js";
import { createEntitlementGuard } from "../entitlement/middlewares/entitlement.middleware.js";
import { getEntitlementService } from "../entitlement/entitlement.service.js";

const router = Router();
const invitationRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: "Too many invitation attempts. Please try again later.",
});

// ── Entitlement guards ─────────────────────────────────────────────────────

const svc = getEntitlementService();

const employeeInviteGuard = createEntitlementGuard(svc, {
  dimension: "employees",
  amount: 1,
  failMode: "fail-closed",
});
const requireUserUpdate = requirePermission(Permission.USERS_UPDATE);
const requireRoleAssignment = requirePermission(Permission.USERS_ASSIGN_ROLE);
const validateInvite: import("express").RequestHandler = (req, _res, next) => {
  try {
    validateInviteUserInput(req.body);
    next();
  } catch (error) {
    next(error);
  }
};
const validateList: import("express").RequestHandler = (req, _res, next) => {
  try {
    validateListUsersInput(req.query);
    next();
  } catch (error) {
    next(error);
  }
};
const validateUpdate: import("express").RequestHandler = (req, _res, next) => {
  try {
    validateUpdateUserInput(req.body);
    next();
  } catch (error) {
    next(error);
  }
};

const requireRoleAssignmentForBaseRoleChange: import("express").RequestHandler =
  (req, res, next) => {
    if (
      req.body &&
      typeof req.body === "object" &&
      Object.prototype.hasOwnProperty.call(req.body, "role")
    ) {
      void requireRoleAssignment(req, res, next);
      return;
    }
    next();
  };
const requireRoleAssignmentForAdminInvite: import("express").RequestHandler =
  (req, res, next) => {
    if (
      req.body &&
      typeof req.body === "object" &&
      "role" in req.body &&
      req.body.role === "COMPANY_ADMIN"
    ) {
      void requireRoleAssignment(req, res, next);
      return;
    }
    next();
  };

/**
 * @openapi
 * /users:
 *   get:
 *     summary: List users
 *     description: Returns a paginated list of users for the tenant,
 *       optionally filtered by a case-insensitive search over name or email,
 *       or by base role. Pagination defaults to page 1 with 20 records per page.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Records per page (max 100)
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by name or email
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *           enum: [COMPANY_ADMIN, EMPLOYEE]
 *         description: Filter by base role
 *     responses:
 *       200:
 *         description: Paginated list of users
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
 *                     users:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           name:
 *                             type: string
 *                           email:
 *                             type: string
 *                           role:
 *                             type: string
 *                           status:
 *                             type: string
 *                           emailVerified:
 *                             type: boolean
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         page:
 *                           type: integer
 *                         pageSize:
 *                           type: integer
 *                         totalPages:
 *                           type: integer
 *                         totalRecords:
 *                           type: integer
 *       400:
 *         description: Validation error
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 */
router.get(
  "/",
  authenticate,
  tenantScoping,
  requirePermission(Permission.USERS_READ),
  validateList,
  listUsersController,
);

/**
 * @openapi
 * /users/{id}:
 *   patch:
 *     summary: Update user
 *     description: Updates a user's base role or status. Changing the role
 *       requires the role-assignment permission. Guards prevent demoting or
 *       disabling the last active Company Admin of the tenant.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: User id
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               role:
 *                 type: string
 *                 enum: [COMPANY_ADMIN, EMPLOYEE]
 *                 description: New base role
 *               status:
 *                 type: string
 *                 enum: [active, pending, pending_email_verification, disabled]
 *                 description: New user status
 *     responses:
 *       200:
 *         description: User updated successfully
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
 *       400:
 *         description: Validation error
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: User not found
 *       409:
 *         description: Conflict (for example, last admin protection or self demotion)
 */
router.patch(
  "/:id",
  authenticate,
  tenantScoping,
  requireUserUpdate,
  requireRoleAssignmentForBaseRoleChange,
  validateUpdate,
  updateUserController,
);

/**
 * @openapi
 * /users:
 *   post:
 *     summary: Invite user
 *     description: Creates a user with a pending_email_verification status and
 *       sends an invitation email with a link to set a password. Inviting a
 *       COMPANY_ADMIN requires the role-assignment permission. The employee
 *       count entitlement is checked before creation.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, role]
 *             properties:
 *               name:
 *                 type: string
 *                 description: User's display name
 *                 example: Sarah Johnson
 *               email:
 *                 type: string
 *                 format: email
 *                 example: sarah@acme.com
 *               role:
 *                 type: string
 *                 enum: [COMPANY_ADMIN, EMPLOYEE]
 *                 example: EMPLOYEE
 *               customRoleId:
 *                 type: string
 *                 description: Optional custom role id to assign
 *     responses:
 *       201:
 *         description: Invitation created
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
 *                     emailDelivery:
 *                       type: object
 *                       properties:
 *                         sent:
 *                           type: boolean
 *                         error:
 *                           type: string
 *       400:
 *         description: Validation error
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions or entitlement limit reached
 *       409:
 *         description: Email already exists in this tenant
 *       500:
 *         description: Failed to invite user
 */
router.post(
  "/",
  authenticate,
  tenantScoping,
  requirePermission(Permission.USERS_CREATE),
  requireRoleAssignmentForAdminInvite,
  validateInvite,
  employeeInviteGuard,
  inviteUserController,
);

/**
 * @openapi
 * /users/{id}/resend-invitation:
 *   post:
 *     summary: Resend invitation
 *     description: Re-issues the invitation email for a user that is still in
 *       the pending_email_verification state, generating a fresh verification
 *       token. Rate limited and subject to the employee count entitlement.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: User id
 *     responses:
 *       200:
 *         description: Invitation email resent
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
 *                   example: Invitation email resent successfully.
 *                 data:
 *                   type: object
 *                   properties:
 *                     user:
 *                       type: object
 *       400:
 *         description: Malformed id or validation error
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions or entitlement limit reached
 *       404:
 *         description: Invitation not found
 *       429:
 *         description: Too many invitation attempts
 */
router.post(
  "/:id/resend-invitation",
  authenticate,
  tenantScoping,
  requirePermission(Permission.USERS_CREATE),
  invitationRateLimiter,
  employeeInviteGuard,
  resendInvitationController,
);

/**
 * @openapi
 * /users/{id}/revoke-invitation:
 *   post:
 *     summary: Revoke invitation
 *     description: Deletes a pending invitee and revokes the outstanding
 *       invitation. Fails with a conflict when the invitation has already been
 *       accepted by the user.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: User id
 *     responses:
 *       200:
 *         description: Invitation revoked
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
 *                   example: Invitation revoked successfully.
 *       400:
 *         description: Malformed id
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: User not found
 *       409:
 *         description: Invitation has already been accepted
 */
router.post(
  "/:id/revoke-invitation",
  authenticate,
  tenantScoping,
  requirePermission(Permission.USERS_DELETE),
  revokeInvitationController,
);

/**
 * @openapi
 * /users/{id}:
 *   delete:
 *     summary: Delete user
 *     description: Soft-deletes a user and revokes their active refresh
 *       sessions. Admin users are protected against removing the last active
 *       Company Admin of the tenant, and actors cannot delete their own account.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: User id
 *     responses:
 *       200:
 *         description: User deleted successfully
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
 *                   example: User deleted successfully.
 *       400:
 *         description: Malformed id
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: User not found
 *       409:
 *         description: Self deletion or last admin protection
 */
router.delete(
  "/:id",
  authenticate,
  tenantScoping,
  requirePermission(Permission.USERS_DELETE),
  deleteUserController,
);

/**
 * @openapi
 * /users/set-password-from-invite:
 *   post:
 *     summary: Set password from invite
 *     description: Completes the invitation flow by validating the invite token
 *       and setting the user's password. On success the user becomes active and
 *       can log in. The password must contain at least 8 characters with an
 *       uppercase letter, a lowercase letter and a digit.
 *     tags: [Users]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, password]
 *             properties:
 *               token:
 *                 type: string
 *                 description: Invitation token from the emailed link
 *               password:
 *                 type: string
 *                 format: password
 *                 example: "StrongPass123"
 *     responses:
 *       200:
 *         description: Password set successfully
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
 *                   example: Password set successfully. You can now log in.
 *                 data:
 *                   type: object
 *                   properties:
 *                     user:
 *                       type: object
 *       400:
 *         description: Invalid, expired or malformed token, or weak password
 *       409:
 *         description: Invitation link must be reissued by the administrator
 */
router.post(
  "/set-password-from-invite",
  invitationRateLimiter,
  setPasswordFromInviteController,
);
/**
 * @openapi
 * /users/validate-invite:
 *   post:
 *     summary: Validate invite token
 *     description: Returns the company name, email, role and expiry for a valid
 *       invitation token, used to render the set-password screen before
 *       submission. Returns a conflict when the invitation was already accepted
 *       and a gone status when it has expired.
 *     tags: [Users]
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
 *                 description: Invitation token from the emailed link
 *     responses:
 *       200:
 *         description: Invitation details
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
 *                     companyName:
 *                       type: string
 *                     email:
 *                       type: string
 *                     role:
 *                       type: string
 *                     expiresAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Invalid or missing token
 *       409:
 *         description: Invitation has already been accepted
 *       410:
 *         description: Invitation has expired
 */
router.post(
  "/validate-invite",
  invitationRateLimiter,
  getInviteDetailsController,
);

export default router;
