import dotenv from "dotenv";
import app from "./app.js";
import { connectDB } from "./db/connection.js";

await connectDB();

dotenv.config();

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});