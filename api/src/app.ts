import express from "express";

const app = express();

app.use(express.json());

app.get("/", (_, res) => {
  res.json({ message: "API is running now" });
});

export default app;
