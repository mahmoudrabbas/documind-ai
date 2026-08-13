import { Router, type RequestHandler } from "express";
import { activePackagesController } from "./public.controller.js";
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

export default createPublicRouter();