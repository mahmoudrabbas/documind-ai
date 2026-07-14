import express from "express";
import cors from "cors";
import { AppError } from "./common/errors/AppError.js";
import { BAD_REQUEST } from "./common/errors/errorCodes.js";
import { errorHandlerMiddleware } from "./common/middlewares/errorHandler.middleware.js";
import { notFoundMiddleware } from "./common/middlewares/notFound.middleware.js";
import { requestContextMiddleware } from "./common/middlewares/requestContext.middleware.js";
import { requestLoggerMiddleware } from "./common/middlewares/requestLogger.middleware.js";
import { validateRequest } from "./common/middlewares/validateRequest.js";
import { config } from "./config/index.js";
import authRoutes from "./modules/auth/auth.routes.js";
import usersRoutes from "./modules/users/users.routes.js";
import adminRoutes from "./modules/admin/admin.routes.js";
import bootstrapRoutes from "./modules/bootstrap/bootstrap.routes.js";
import documentsRoutes from "./modules/documents/documents.routes.js";
import rolesRoutes from "./modules/roles/roles.routes.js";
import platformRoutes from "./modules/platform/platform.routes.js";
import publicRoutes from "./modules/public/public.routes.js";
import { getRedisClient, isRedisConnected } from "./db/redis.js";
import { isMongoConnected } from "./db/connection.js";
const app = express();
app.set("trust proxy", 1);
const redisClient = getRedisClient();
app.locals.redisClient = redisClient;
const parseAllowedOrigins = () => {
    const configuredOrigins = [
        process.env.CORS_ORIGIN,
        process.env.APP_FRONTEND_URL,
        process.env.NODE_ENV !== "production" ? "http://localhost:3000" : "",
    ];
    return new Set(configuredOrigins
        .filter(Boolean)
        .flatMap((origin) => String(origin).split(","))
        .map((origin) => origin.trim().replace(/\/$/, ""))
        .filter(Boolean));
};
const allowedOrigins = parseAllowedOrigins();
const corsOptions = {
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
    allowedHeaders: [
        "Content-Type",
        "Authorization",
        "X-Request-ID",
        "X-Correlation-ID",
    ],
    exposedHeaders: ["X-Request-ID"],
    credentials: true,
    optionsSuccessStatus: 204,
};
app.use(requestContextMiddleware);
app.use(requestLoggerMiddleware);
// ── Health-check probes (before CORS / auth so internal probes work) ──
/**
 * Liveness probe — confirms the process is alive and the event loop is
 * not blocked. Orchestrators (Docker, K8s) restart the container when
 * this fails.
 */
app.get("/healthz", (_req, res) => {
    res.status(200).json({ status: "ok" });
});
app.use(cors(corsOptions));
app.use(express.json());
app.use("/auth", authRoutes);
app.use("/users", usersRoutes);
app.use("/platform", adminRoutes);
app.use("/platform", platformRoutes);
app.use("/internal/bootstrap", bootstrapRoutes);
app.use("/documents", documentsRoutes);
app.use("/roles", rolesRoutes);
app.use("/public", publicRoutes);
app.get("/", (_, res) => {
    res.json({ message: "API is running :)" });
});
/**
 * Readiness probe — reports whether the service can handle traffic.
 * Returns 200 when all dependencies are reachable, 503 otherwise.
 */
app.get("/readyz", (_req, res) => {
    const mongoOk = isMongoConnected();
    const redisOk = isRedisConnected();
    const allOk = mongoOk && redisOk;
    res.status(allOk ? 200 : 503).json({
        status: allOk ? "ready" : "degraded",
        checks: {
            mongo: mongoOk ? "connected" : "disconnected",
            redis: redisOk ? "connected" : "disconnected",
        },
    });
});
if (config.NODE_ENV !== "production") {
    app.get("/boom", () => {
        throw new AppError(400, BAD_REQUEST, "Bad request", {
            field: "email",
            issue: "invalid format",
        });
    });
    app.post("/signup", validateRequest({
        body: (req) => {
            const errors = [];
            const body = req.body;
            if (typeof body?.email !== "string" || !body.email.includes("@")) {
                errors.push({ field: "email", issue: "invalid format" });
            }
            return errors;
        },
    }, { errorCode: "AUTH_SIGNUP_VALIDATION_ERROR" }), (_req, res) => {
        res.status(201).json({ ok: true });
    });
}
app.use(notFoundMiddleware);
app.use(errorHandlerMiddleware);
export default app;
//# sourceMappingURL=app.js.map