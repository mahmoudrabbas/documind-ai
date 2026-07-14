import { logger } from "../logger/logger.js";
import { getCurrentRequestId } from "../utils/requestContext.js";
export const requestLoggerMiddleware = (req, res, next) => {
    const startedAt = process.hrtime.bigint();
    res.on("finish", () => {
        try {
            const requestLogger = req.log ?? logger;
            const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
            const event = {
                ...(req.log
                    ? {}
                    : { requestId: req.requestId ?? getCurrentRequestId() }),
                method: req.method,
                path: req.originalUrl,
                statusCode: res.statusCode,
                durationMs: Number(durationMs.toFixed(2)),
                userAgent: req.get("user-agent"),
                ip: req.ip,
            };
            if (res.statusCode >= 500) {
                requestLogger.error(event, "request completed");
            }
            else if (res.statusCode >= 400) {
                requestLogger.warn(event, "request completed");
            }
            else {
                requestLogger.info(event, "request completed");
            }
        }
        catch {
            // Logging must never affect the completed response or crash the process.
        }
    });
    next();
};
//# sourceMappingURL=requestLogger.middleware.js.map