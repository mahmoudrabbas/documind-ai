import dotenv from "dotenv";
import app from "./app.js";
import { connectDB } from "./db/connection.js";
import { config } from "./config/index.js";

dotenv.config();

await connectDB();

app.listen(config.PORT, () => {
  console.log(`Server running on http://localhost:${config.PORT}`);
});
