import mongoose from "mongoose";
import { config } from "../config/index.js";

export async function connectDB() {
  try {
    await mongoose.connect(config.MONGODB_URI);

    console.log("✅ MongoDB Connected");
  } catch (err) {
    console.error("❌ MongoDB Connection Error", err);
    process.exit(1);
  }
}
