import mongoose from "mongoose";
export async function connectDB() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("✅ MongoDB Connected");
    }
    catch (err) {
        console.error("❌ MongoDB Connection Error", err);
        process.exit(1);
    }
}
