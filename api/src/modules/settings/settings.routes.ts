import { Router } from "express";
import multer from "multer";
import { authenticate } from "../../common/middlewares/authenticate.middleware.js";
import { tenantScoping } from "../../common/middlewares/tenantScoping.middleware.js";
import { Permission } from "../permissions/permissions.catalog.js";
import { requirePermission } from "../permissions/permissions.middleware.js";
import { config } from "../../config/index.js";
import {
  getSettingsController,
  updateSettingsController,
  uploadLogoController,
} from "./settings.controller.js";

const router = Router();

const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.LOGO_MAX_FILE_SIZE_BYTES },
  fileFilter: (_req, file, callback) => {
    const allowedTypes = config.LOGO_ALLOWED_MIME_TYPES.split(",")
      .map((type) => type.trim().toLowerCase())
      .filter(Boolean);
    if (allowedTypes.includes(file.mimetype.toLowerCase())) {
      callback(null, true);
    } else {
      callback(
        Object.assign(new Error(`File type ${file.mimetype} is not supported`), {
          code: "UNSUPPORTED_FILE_TYPE",
        }) as Error & { code: string },
      );
    }
  },
});

router.use(authenticate, tenantScoping);
/**
 * @openapi
 * /settings:
 *   get:
 *     summary: Get tenant settings
 *     description: Returns the tenant's current settings including profile,
 *       default language, email branding, AI runtime preferences and
 *       notification toggles, along with the settings version used for
 *       optimistic concurrency.
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Tenant settings
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
 *                     settings:
 *                       type: object
 *                       properties:
 *                         profile:
 *                           type: object
 *                           properties:
 *                             companyName:
 *                               type: string
 *                             logoUrl:
 *                               type: string
 *                             accentColor:
 *                               type: string
 *                             timezone:
 *                               type: string
 *                         defaultLanguage:
 *                           type: string
 *                           enum: [en, ar]
 *                         emailBranding:
 *                           type: object
 *                           properties:
 *                             fromName:
 *                               type: string
 *                             footerText:
 *                               type: string
 *                             brandColor:
 *                               type: string
 *                         aiRuntimePreferences:
 *                           type: object
 *                           properties:
 *                             temperature:
 *                               type: number
 *                             maxTokens:
 *                               type: integer
 *                             responseStyle:
 *                               type: string
 *                               enum: [concise, balanced, detailed]
 *                             citationsEnabled:
 *                               type: boolean
 *                         notifications:
 *                           type: object
 *                           properties:
 *                             emailOnUserInvited:
 *                               type: boolean
 *                             emailOnKnowledgeGapCreated:
 *                               type: boolean
 *                             emailOnDocumentProcessingFailed:
 *                               type: boolean
 *                             emailOnWeeklyDigest:
 *                               type: boolean
 *                     settingsVersion:
 *                       type: integer
 *                     settingsUpdatedAt:
 *                       type: string
 *                       format: date-time
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Tenant not found
 */
router.get(
  "/",
  requirePermission(Permission.COMPANY_SETTINGS_READ),
  getSettingsController,
);
/**
 * @openapi
 * /settings:
 *   put:
 *     summary: Update tenant settings
 *     description: Merges a partial settings patch into the tenant's current
 *       settings and increments the settings version. Supply expectedVersion to
 *       detect concurrent updates, which are rejected with a conflict.
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [settings]
 *             properties:
 *               settings:
 *                 type: object
 *                 properties:
 *                   profile:
 *                     type: object
 *                     properties:
 *                       companyName:
 *                         type: string
 *                         example: Acme Corp
 *                       logoUrl:
 *                         type: string
 *                       accentColor:
 *                         type: string
 *                       timezone:
 *                         type: string
 *                   defaultLanguage:
 *                     type: string
 *                     enum: [en, ar]
 *                   emailBranding:
 *                     type: object
 *                     properties:
 *                       fromName:
 *                         type: string
 *                       footerText:
 *                         type: string
 *                       brandColor:
 *                         type: string
 *                   aiRuntimePreferences:
 *                     type: object
 *                     properties:
 *                       temperature:
 *                         type: number
 *                         minimum: 0
 *                         maximum: 2
 *                       maxTokens:
 *                         type: integer
 *                         minimum: 128
 *                         maximum: 8192
 *                       responseStyle:
 *                         type: string
 *                         enum: [concise, balanced, detailed]
 *                       citationsEnabled:
 *                         type: boolean
 *                   notifications:
 *                     type: object
 *                     properties:
 *                       emailOnUserInvited:
 *                         type: boolean
 *                       emailOnKnowledgeGapCreated:
 *                         type: boolean
 *                       emailOnDocumentProcessingFailed:
 *                         type: boolean
 *                       emailOnWeeklyDigest:
 *                         type: boolean
 *               expectedVersion:
 *                 type: integer
 *                 description: Expected current settings version
 *     responses:
 *       200:
 *         description: Tenant settings updated successfully
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
 *                   example: Tenant settings updated successfully.
 *                 data:
 *                   type: object
 *                   properties:
 *                     settings:
 *                       type: object
 *                     settingsVersion:
 *                       type: integer
 *                     settingsUpdatedAt:
 *                       type: string
 *                       format: date-time
 *                     updated:
 *                       type: boolean
 *                       example: true
 *       400:
 *         description: Validation error
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Tenant not found
 *       409:
 *         description: Settings were updated by another user
 */
router.put(
  "/",
  requirePermission(Permission.COMPANY_SETTINGS_UPDATE),
  updateSettingsController,
);
/**
 * @openapi
 * /settings/logo:
 *   post:
 *     summary: Upload company logo
 *     description: Uploads a logo image as multipart/form-data, stores it in the
 *       tenant's storage, and updates `settings.profile.logoUrl` with a publicly
 *       reachable URL so the logo can be embedded in the app and in outgoing
 *       emails. Replacing the logo removes the previous uploaded file.
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file]
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: Logo image (JPEG, PNG, WebP, GIF or SVG, max 2 MB)
 *     responses:
 *       200:
 *         description: Logo uploaded successfully
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
 *                   example: Logo uploaded successfully.
 *                 data:
 *                   type: object
 *                   properties:
 *                     settings:
 *                       type: object
 *                     settingsVersion:
 *                       type: integer
 *                     settingsUpdatedAt:
 *                       type: string
 *                       format: date-time
 *                     updated:
 *                       type: boolean
 *                       example: true
 *       400:
 *         description: Validation error or unsupported file type
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       413:
 *         description: File too large
 */
router.post(
  "/logo",
  requirePermission(Permission.COMPANY_SETTINGS_UPDATE),
  logoUpload.single("file"),
  uploadLogoController,
);

export default router;
