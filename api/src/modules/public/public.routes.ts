import { Router } from "express";
import {
  activePackagesController,
  getLogoController,
} from "./public.controller.js";

const router = Router();

/**
 * @openapi
 * /public/packages:
 *   get:
 *     summary: List public packages
 *     description: Returns the list of active packages visible to the public with
 *       pricing, entitlements and supported model information. No authentication
 *       is required.
 *     tags: [Public]
 *     security: []
 *     responses:
 *       200:
 *         description: Public packages
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       code:
 *                         type: string
 *                       description:
 *                         type: string
 *                       monthlyPrice:
 *                         type: number
 *                       annualPrice:
 *                         type: number
 *                       monthlyPriceCents:
 *                         type: number
 *                       annualPriceCents:
 *                         type: number
 *                       currency:
 *                         type: string
 *                       trialDays:
 *                         type: number
 *                       entitlements:
 *                         type: object
 *                         properties:
 *                           employees:
 *                             type: number
 *                           documents:
 *                             type: number
 *                           storageMb:
 *                             type: number
 *                           queriesPerMonth:
 *                             type: number
 *                       supportedModels:
 *                         type: array
 *                         items:
 *                           type: string
 *                       analyticsLevel:
 *                         type: string
 *                       supportLevel:
 *                         type: string
 *                       retentionDays:
 *                         type: number
 */
router.get("/packages", activePackagesController);

/**
 * @openapi
 * /public/logos/{tenantId}/{file}:
 *   get:
 *     summary: Fetch a tenant logo
 *     description: Serves an uploaded tenant logo image. Unauthenticated by
 *       design because logos are embedded in outgoing email HTML; the file name
 *       is an unguessable UUID that provides access control.
 *     tags: [Public]
 *     security: []
 *     parameters:
 *       - in: path
 *         name: tenantId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: file
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: The logo image
 *         content:
 *           image/png:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: Logo not found
 */
router.get("/logos/:tenantId/:file", getLogoController);

export default router;
