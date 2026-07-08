import dotenv from "dotenv";
import mongoose from "mongoose";
import app from "./app.js";
import { connectDB } from "./db/connection.js";
import { connectRedis, disconnectRedis } from "./db/redis.js";
import { config } from "./config/index.js";
import { logger } from "./common/logger/logger.js";
dotenv.config();
await connectDB();
await connectRedis();
const server = app.listen(config.PORT, () => {
    logger.info({ port: config.PORT }, "API server started");
});
async function gracefulShutdown(signal) {
    logger.info({ signal }, "graceful shutdown started");
    server.close(() => {
        logger.info("HTTP server closed");
    });
    await disconnectRedis();
    await mongoose.disconnect();
    process.exit(0);
}
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
//# sourceMappingURL=server.js.map