import pino from "pino";
const nodeEnv = process.env.NODE_ENV ?? "development";
const configuredLevel = process.env.LOG_LEVEL ?? "info";
const isTest = nodeEnv === "test" || process.env.NODE_TEST_CONTEXT !== undefined;
const level = isTest && process.env.LOG_LEVEL === undefined ? "silent" : configuredLevel;
const transport = process.env.LOG_PRETTY?.toLowerCase() === "true" && nodeEnv !== "production"
    ? pino.transport({
        target: "pino-pretty",
        options: {
            colorize: true,
            translateTime: "SYS:standard",
        },
    })
    : undefined;
export function createStructuredLogger(serviceName) {
    return pino({
        level,
        base: { service: serviceName },
        timestamp: pino.stdTimeFunctions.isoTime,
        messageKey: "message",
        formatters: {
            level(label) {
                return { level: label };
            },
        },
    }, transport);
}
//# sourceMappingURL=structuredLogger.js.map