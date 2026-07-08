import { randomUUID } from "node:crypto";
import { logger } from "../logger/logger.js";
const MAX_REQUEST_ID_LENGTH = 128;
const VALID_REQUEST_ID = /^[\x21-\x7e]+$/;
function getRequestId(value) {
    if (value === undefined ||
        value.length === 0 ||
        value.length > MAX_REQUEST_ID_LENGTH ||
        !VALID_REQUEST_ID.test(value)) {
        return undefined;
    }
    return value;
}
export const requestContextMiddleware = (req, res, next) => {
    const incomingRequestId = getRequestId(req.get("x-request-id")) ??
        getRequestId(req.get("x-correlation-id"));
    const requestId = incomingRequestId ?? randomUUID();
    req.requestId = requestId;
    try {
        req.log = logger.child({ requestId });
    }
    catch {
        req.log = logger;
    }
    res.setHeader("X-Request-ID", requestId);
    next();
};
//# sourceMappingURL=requestContext.middleware.js.map