import dotenv from "dotenv";
import mongoose from "mongoose";
import app from "./app.js";
import { connectDB } from "./db/connection.js";
import { connectRedis, disconnectRedis } from "./db/redis.js";
import { config } from "./config/index.js";
dotenv.config();
await connectDB();
await connectRedis();
const server = app.listen(config.PORT, () => {
    console.log(`Server running on http://localhost:${config.PORT}`);
});
async function gracefulShutdown(signal) {
    console.log(`\n[server] Received ${signal}. Shutting down gracefully...`);
    server.close(() => {
        console.log("[server] HTTP server closed");
    });
    await disconnectRedis();
    await mongoose.disconnect();
    process.exit(0);
}
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
//# sourceMappingURL=server.js.map