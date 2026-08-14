import { Router, type RequestHandler } from "express";
import {
  activePackagesController,
  getLogoController,
} from "./public.controller.js";
import { ttsController } from "./tts.controller.js";
import { createRateLimiter } from "../../common/middlewares/rateLimit.middleware.js";

// TTS synthesizes remote audio on every request, so it gets its own tighter
// per-IP budget than the general API limiter.
const defaultTtsRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 30,
  message: "Too many speech requests, please try again later.",
  storePrefix: "rate-limit:tts:",
});

/**
 * Factory so tests can mount the public router with an isolated rate-limit
 * store per server instance.
 */
export function createPublicRouter(
  ttsRateLimiter: RequestHandler = defaultTtsRateLimiter,
): Router {
  const routes = Router();
  routes.get("/packages", activePackagesController);
  routes.get("/tts", ttsRateLimiter, ttsController);
  return routes;
}

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
const publicRouter = createPublicRouter();
publicRouter.get("/logos/:tenantId/:file", getLogoController);

export default publicRouter;
