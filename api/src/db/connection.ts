import mongoose from "mongoose";
import { config } from "../config/index.js";
import { logger } from "../common/logger/logger.js";

export async function connectDB() {
  try {
    await mongoose.connect(config.MONGODB_URI);

    logger.info("MongoDB connected");
  } catch (err) {
    logger.error({ err }, "MongoDB connection failed");
    process.exit(1);
  }
}

/**
 * Returns true when the Mongoose default connection is in the "connected" state.
 * Used by the /readyz health-check endpoint.
 */
export function isMongoConnected(): boolean {
  return mongoose.connection.readyState === 1;
}
