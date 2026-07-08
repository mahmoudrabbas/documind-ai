import dotenv from "dotenv";
import app from "./app.js";
import { connectDB, disconnectDB } from "./db/connection.js";
import { connectRedis, disconnectRedis } from "./db/redis.js";
import { config } from "./config/index.js";
import { logger } from "./common/logger/logger.js";
dotenv.config();
let shuttingDown = false;
async function gracefulShutdown(signal) {
    if (shuttingDown) {
        return;
    }
    shuttingDown = true;
    logger.info({ signal }, "graceful shutdown started");
    await new Promise((resolve) => {
        server.close(() => {
            logger.info("HTTP server closed");
            resolve();
        });
    });
    await Promise.allSettled([disconnectRedis(), disconnectDB()]);
    process.exit(0);
}
try {
    await connectDB();
    await connectRedis();
}
catch (err) {
    logger.fatal({ err }, "API startup failed");
    process.exit(1);
}
const server = app.listen(config.PORT, () => {
    logger.info({ port: config.PORT }, "API server started");
});
process.on("SIGTERM", () => {
    void gracefulShutdown("SIGTERM");
});
process.on("SIGINT", () => {
    void gracefulShutdown("SIGINT");
});
//# sourceMappingURL=server.js.map