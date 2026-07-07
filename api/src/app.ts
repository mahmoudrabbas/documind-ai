import express from "express";
import cors, { type CorsOptions } from "cors";
import { AppError } from "./common/errors/AppError.js";
import { BAD_REQUEST } from "./common/errors/errorCodes.js";
import { errorHandlerMiddleware } from "./common/middlewares/errorHandler.middleware.js";
import { notFoundMiddleware } from "./common/middlewares/notFound.middleware.js";
import { validateRequest } from "./common/middlewares/validateRequest.js";
import { config } from "./config/index.js";
import authRoutes from "./modules/auth/auth.routes.js";

const app = express();
const parseAllowedOrigins = () => {
  const configuredOrigins = [
    process.env.CORS_ORIGIN,
    process.env.APP_FRONTEND_URL,
    process.env.NODE_ENV !== "production" ? "http://localhost:3000" : "",
  ];

  return new Set(
    configuredOrigins
      .filter(Boolean)
      .flatMap((origin) => String(origin).split(","))
      .map((origin) => origin.trim().replace(/\/$/, ""))
      .filter(Boolean)
  );
};

const allowedOrigins = parseAllowedOrigins();

const corsOptions: CorsOptions = {
  origin(origin, callback) {
    // Allow server-to-server tools, Postman, curl, health checks
    if (!origin) {
      return callback(null, true);
    }

    const normalizedOrigin = origin.replace(/\/$/, "");

    if (allowedOrigins.has(normalizedOrigin)) {
      return callback(null, true);
    }

    return callback(null, false);
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));

app.use(express.json());

app.use("/auth", authRoutes);

app.get("/", (_, res) => {
  res.json({ message: "API is running :)" });
});

if (config.NODE_ENV !== "production") {
  app.get("/boom", () => {
    throw new AppError(400, BAD_REQUEST, "Bad request", {
      field: "email",
      issue: "invalid format",
    });
  });

  app.post(
    "/signup",
    validateRequest(
      {
        body: (req) => {
          const errors: Array<{ field: string; issue: string }> = [];

          const body = req.body as Record<string, unknown>;
          if (typeof body?.email !== "string" || !body.email.includes("@")) {
            errors.push({ field: "email", issue: "invalid format" });
          }

          return errors;
        },
      },
      { errorCode: "AUTH_SIGNUP_VALIDATION_ERROR" }
    ),
    (_req, res) => {
      res.status(201).json({ ok: true });
    }
  );
}

app.use(notFoundMiddleware);
app.use(errorHandlerMiddleware);

export default app;
