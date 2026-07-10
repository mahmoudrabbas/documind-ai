import type { RequestHandler } from "express";
import { type Store } from "express-rate-limit";
import { getRedisClient } from "../../db/redis.js";
export declare function createRateLimiter(options?: {
    windowMs?: number;
    max?: number;
    message?: string;
    store?: Store;
    redisClient?: ReturnType<typeof getRedisClient>;
}): RequestHandler;
export declare function authRateLimiter(): RequestHandler<import("express-serve-static-core").ParamsDictionary, any, any, import("qs").ParsedQs, Record<string, any>>;
//# sourceMappingURL=rateLimit.middleware.d.ts.map