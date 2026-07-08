import mongoose from "mongoose";
import { logger } from "../common/logger/logger.js";
import { config } from "../config/index.js";
const connectionStates = {
    0: "disconnected",
    1: "connected",
    2: "connecting",
    3: "disconnecting",
};
let connectPromise = null;
let listenersRegistered = false;
function sleep(delayMs) {
    return new Promise((resolve) => setTimeout(resolve, delayMs));
}
export function calculateRetryDelay(attempt, baseDelayMs = config.MONGODB_RETRY_DELAY_MS, backoffFactor = config.MONGODB_RETRY_BACKOFF_FACTOR, maxDelayMs = config.MONGODB_RETRY_MAX_DELAY_MS) {
    const exponent = Math.max(0, attempt - 1);
    return Math.min(baseDelayMs * backoffFactor ** exponent, maxDelayMs);
}
export function getMongoConnectionState() {
    return connectionStates[mongoose.connection.readyState] ?? "unknown";
}
export function isMongoConnected() {
    return mongoose.connection.readyState === 1;
}
function registerConnectionListeners() {
    if (listenersRegistered) {
        return;
    }
    listenersRegistered = true;
    mongoose.connection.on("connected", () => {
        logger.info("Mongoose connected");
    });
    mongoose.connection.on("disconnected", () => {
        logger.warn("Mongoose disconnected");
    });
    mongoose.connection.on("reconnected", () => {
        logger.info("Mongoose reconnected");
    });
    mongoose.connection.on("error", (err) => {
        logger.error({ err }, "Mongoose connection error");
    });
}
async function connectWithRetry() {
    registerConnectionListeners();
    const totalAttempts = config.MONGODB_MAX_RETRIES + 1;
    let lastError;
    for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
        try {
            logger.info({ attempt, totalAttempts }, "MongoDB connection attempt");
            await mongoose.connect(config.MONGODB_URI);
            logger.info({ attempt }, "MongoDB connected");
            return;
        }
        catch (err) {
            lastError = err;
            if (attempt === totalAttempts) {
                break;
            }
            const retryAttempt = attempt;
            const delayMs = calculateRetryDelay(retryAttempt);
            logger.warn({ attempt, nextAttempt: attempt + 1, delayMs, err }, "MongoDB connection failed; retrying");
            await sleep(delayMs);
        }
    }
    const error = new Error(`MongoDB connection failed after ${totalAttempts} attempts`, { cause: lastError });
    logger.error({ err: error, attempts: totalAttempts }, "MongoDB connection failed after retries");
    throw error;
}
export function connectDB() {
    if (isMongoConnected()) {
        return Promise.resolve();
    }
    if (connectPromise) {
        return connectPromise;
    }
    if (mongoose.connection.readyState === 2) {
        return mongoose.connection.asPromise().then(() => undefined);
    }
    connectPromise = connectWithRetry().finally(() => {
        connectPromise = null;
    });
    return connectPromise;
}
export async function disconnectDB() {
    if (connectPromise) {
        try {
            await connectPromise;
        }
        catch {
            // A failed connection is already disconnected.
        }
    }
    if (mongoose.connection.readyState === 0) {
        return;
    }
    await mongoose.disconnect();
    logger.info("MongoDB disconnected");
}
//# sourceMappingURL=connection.js.map