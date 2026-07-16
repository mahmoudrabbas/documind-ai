import pino, { type DestinationStream, type LoggerOptions } from "pino";
import { SENSITIVE_FIELDS } from "../observability/redactionRules.js";

const nodeEnv = process.env.NODE_ENV ?? "development";
const configuredLevel = process.env.LOG_LEVEL ?? "info";
const isTest =
  nodeEnv === "test" || process.env.NODE_TEST_CONTEXT !== undefined;
const level =
  isTest && process.env.LOG_LEVEL === undefined ? "silent" : configuredLevel;

const transport =
  process.env.LOG_PRETTY?.toLowerCase() === "true" && nodeEnv !== "production"
    ? pino.transport({
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:standard",
        },
      })
    : undefined;

export function createStructuredLogger(
  serviceName: string,
  destination?: DestinationStream,
) {
  const options: LoggerOptions = {
    level,
    base: { service: serviceName },
    timestamp: pino.stdTimeFunctions.isoTime,
    messageKey: "message",
    redact: {
      paths: [...SENSITIVE_FIELDS],
      censor: "[Redacted]",
    },
    formatters: {
      level(label) {
        return { level: label };
      },
    },
  };

  return destination ? pino(options, destination) : pino(options, transport);
}
