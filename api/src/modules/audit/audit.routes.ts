import { Router } from "express";
import { authenticate } from "../../common/middlewares/authenticate.middleware.js";
import { tenantScoping } from "../../common/middlewares/tenantScoping.middleware.js";
import { requirePermission } from "../permissions/permissions.middleware.js";
import { Permission } from "../permissions/permissions.catalog.js";
import { getLogs, getLogById, exportLogs } from "./audit.controller.js";
import {
  validateAuditLogIdInput,
  validateAuditLogsInput,
  validateExportAuditLogsInput,
} from "./audit.validator.js";

const router = Router();
const validate = (
  source: "query" | "params",
  validator: (input: unknown) => unknown,
): import("express").RequestHandler =>
  (req, _res, next) => {
    try {
      validator(req[source]);
      next();
    } catch (error) {
      next(error);
    }
  };

router.use(authenticate, tenantScoping);

/**
 * @openapi
 * /audit/logs:
 *   get:
 *     summary: List audit logs
 *     description: Returns a paginated list of audit log entries for the
 *       caller's tenant, newest first. Supports filtering by action, actor,
 *       resource, date range, and outcome.
 *     tags: [Audit]
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
 *           default: 50
 *         description: Number of results per page (max 100)
 *       - in: query
 *         name: action
 *         schema:
 *           type: string
 *         description: Filter by audit action
 *       - in: query
 *         name: actorId
 *         schema:
 *           type: string
 *         description: Filter by actor user id
 *       - in: query
 *         name: actorEmail
 *         schema:
 *           type: string
 *         description: Filter by actor email
 *       - in: query
 *         name: resourceType
 *         schema:
 *           type: string
 *           enum: [User, Role, Document, DocumentQuality, OcrPageResult, Package, Subscription, PlatformSetting, Tenant, Session, System, Permission]
 *         description: Filter by resource type
 *       - in: query
 *         name: resourceId
 *         schema:
 *           type: string
 *         description: Filter by resource id
 *       - in: query
 *         name: dateFrom
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Inclusive start of the log window
 *       - in: query
 *         name: dateTo
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Inclusive end of the log window
 *       - in: query
 *         name: outcome
 *         schema:
 *           type: string
 *           enum: [SUCCESS, FAILURE, DENIED]
 *         description: Filter by outcome
 *     responses:
 *       200:
 *         description: Paginated list of audit logs
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 logs:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       action:
 *                         type: string
 *                       resourceType:
 *                         type: string
 *                       resourceId:
 *                         type: string
 *                       actorId:
 *                         type: string
 *                       actorEmail:
 *                         type: string
 *                       actorRole:
 *                         type: string
 *                       outcome:
 *                         type: string
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                     pageSize:
 *                       type: integer
 *                     totalRecords:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 *       400:
 *         description: Validation error
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 */
router.get("/logs", requirePermission(Permission.AUDIT_READ), validate("query", validateAuditLogsInput), getLogs);

/**
 * @openapi
 * /audit/export:
 *   get:
 *     summary: Export audit logs
 *     description: Exports up to ten thousand audit log entries for the
 *       caller's tenant matching the provided filters. A dateFrom is required
 *       and the export window cannot exceed thirty one days. Each export is
 *       itself recorded in the audit log.
 *     tags: [Audit]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: action
 *         schema:
 *           type: string
 *         description: Filter by audit action
 *       - in: query
 *         name: actorId
 *         schema:
 *           type: string
 *         description: Filter by actor user id
 *       - in: query
 *         name: actorEmail
 *         schema:
 *           type: string
 *         description: Filter by actor email
 *       - in: query
 *         name: resourceType
 *         schema:
 *           type: string
 *           enum: [User, Role, Document, DocumentQuality, OcrPageResult, Package, Subscription, PlatformSetting, Tenant, Session, System, Permission]
 *         description: Filter by resource type
 *       - in: query
 *         name: resourceId
 *         schema:
 *           type: string
 *         description: Filter by resource id
 *       - in: query
 *         name: dateFrom
 *         required: true
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Inclusive start of the export window (required)
 *       - in: query
 *         name: dateTo
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Inclusive end of the export window (defaults to now)
 *       - in: query
 *         name: outcome
 *         schema:
 *           type: string
 *           enum: [SUCCESS, FAILURE, DENIED]
 *         description: Filter by outcome
 *     responses:
 *       200:
 *         description: Exported audit logs
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 logs:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       action:
 *                         type: string
 *                       resourceType:
 *                         type: string
 *                       resourceId:
 *                         type: string
 *                       actorId:
 *                         type: string
 *                       actorEmail:
 *                         type: string
 *                       actorRole:
 *                         type: string
 *                       outcome:
 *                         type: string
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *       400:
 *         description: Validation error
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 */
router.get("/export", requirePermission(Permission.AUDIT_READ), validate("query", validateExportAuditLogsInput), exportLogs);

/**
 * @openapi
 * /audit/logs/{id}:
 *   get:
 *     summary: Get audit log
 *     description: Returns a single audit log entry by id from the caller's
 *       tenant.
 *     tags: [Audit]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Audit log id
 *     responses:
 *       200:
 *         description: Audit log entry
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 log:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     action:
 *                       type: string
 *                     resourceType:
 *                       type: string
 *                     resourceId:
 *                       type: string
 *                     actorId:
 *                       type: string
 *                     actorEmail:
 *                       type: string
 *                     actorRole:
 *                       type: string
 *                     outcome:
 *                       type: string
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Validation error
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Audit log not found
 */
router.get("/logs/:id", requirePermission(Permission.AUDIT_READ), validate("params", validateAuditLogIdInput), getLogById);

export default router;
