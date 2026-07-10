import { rateLimit } from "express-rate-limit";
import RedisStore from "rate-limit-redis";
import { config } from "../../config/index.js";
import { getRedisClient } from "../../db/redis.js";
function isTestEnv() {
    return process.env.NODE_ENV === "test";
}
function createRedisStore(redisClient = getRedisClient()) {
    return new RedisStore({
        sendCommand: (...args) => {
            const [command, ...rest] = args;
            return redisClient.call(command, ...rest);
        },
        prefix: "rate-limit:",
        resetExpiryOnChange: true,
    });
}
export function createRateLimiter(options = {}) {
    const windowMs = options.windowMs ?? config.RATE_LIMIT_WINDOW_MS;
    const max = options.max ?? config.RATE_LIMIT_MAX_REQUESTS;
    const message = options.message ?? config.RATE_LIMIT_MESSAGE;
    const store = options.store ??
        (isTestEnv()
            ? undefined
            : options.redisClient
                ? createRedisStore(options.redisClient)
                : createRedisStore());
    return rateLimit({
        windowMs,
        max,
        standardHeaders: true,
        legacyHeaders: false,
        skipFailedRequests: true,
        message: { error: message },
        store,
    });
}
export function authRateLimiter() {
    return createRateLimiter();
}
//# sourceMappingURL=rateLimit.middleware.js.map