import { randomUUID } from "node:crypto";
import { logger } from "../logger/logger.js";
import { withTraceContext } from "../utils/requestContext.js";
const MAX_REQUEST_ID_LENGTH = 128;
const VALID_REQUEST_ID = /^[\x21-\x7e]+$/;
function getSafeHeader(value) {
    const str = Array.isArray(value) ? value[0] : value;
    if (str === undefined ||
        str.length === 0 ||
        str.length > MAX_REQUEST_ID_LENGTH ||
        !VALID_REQUEST_ID.test(str)) {
        return undefined;
    }
    return str;
}
export const requestContextMiddleware = (req, res, next) => {
    const incomingRequestId = getSafeHeader(req.headers["x-request-id"]) ??
        getSafeHeader(req.headers["x-correlation-id"]);
    const incomingTraceId = getSafeHeader(req.headers["x-trace-id"]);
    const requestId = incomingRequestId ?? randomUUID();
    const traceId = incomingTraceId ?? randomUUID();
    const ctx = {
        traceId,
        requestId,
    };
    req.requestId = requestId;
    req.traceId = traceId;
    try {
        req.log = logger.child({ traceId, requestId });
    }
    catch {
        req.log = logger;
    }
    res.setHeader("X-Request-ID", requestId);
    res.setHeader("X-Trace-ID", traceId);
    // We can't set tenantId/actorId yet because authentication hasn't run, 
    // but they'll be added to the context by later middlewares/services if needed,
    // or we can just rely on req.auth/req.tenantId in the audit writer.
    withTraceContext(ctx, () => {
        next();
    });
};
//# sourceMappingURL=requestContext.middleware.js.map