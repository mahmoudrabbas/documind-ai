import express from "express";

import cors, { type CorsOptions } from "cors";
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
import dashboardRoutes from "./modules/dashboard/dashboard.routes.js";
import settingsRoutes from "./modules/settings/settings.routes.js";
import adminRoutes from "./modules/admin/admin.routes.js";
import bootstrapRoutes from "./modules/bootstrap/bootstrap.routes.js";
import documentsRoutes from "./modules/documents/documents.routes.js";
import rolesRoutes from "./modules/roles/roles.routes.js";
import platformRoutes from "./modules/platform/platform.routes.js";
import publicRoutes from "./modules/public/public.routes.js";
import auditRoutes from "./modules/audit/audit.routes.js";
import emailRoutes from "./modules/email/email.routes.js";
import emailWebhooks from "./modules/email/email.webhooks.js";
import permissionsRoutes from "./modules/permissions/permissions.routes.js";
import jobsRoutes from "./modules/jobs/jobs.routes.js";
import {
  agentsRoutes,
  agentsAdminRoutes,
} from "./modules/agents/agents.routes.js";
import checkoutRoutes from "./modules/checkout/checkout.routes.js";
import paymentWebhookRoutes from "./modules/payment-webhooks/payment-webhooks.routes.js";
import paymentWebhookAdminRoutes from "./modules/payment-webhooks/payment-webhooks.admin.js";
import reconciliationRoutes from "./modules/reconciliation/reconciliation.routes.js";
import tenantBillingRoutes from "./modules/billing/tenant-billing.routes.js";
import refundAdminRoutes from "./modules/billing/refund-admin.routes.js";
import importsRoutes from "./modules/imports/index.js";
import processingRoutes from "./modules/processing/processing.routes.js";
import processingProgressRoutes from "./modules/processing-progress/processingProgress.routes.js";
import { createRetrievalRoutes } from "./modules/retrieval/retrieval.routes.js";
import { createRetrievalService } from "./modules/retrieval/retrieval.service.js";
import { createRetrievalRepository } from "./modules/retrieval/retrieval.repository.js";
import {
  compileAccessFilters,
  compileQueryFilters,
  mergeFilters,
  type FilterCompiler,
} from "./modules/retrieval/filterCompiler.js";
import { FusionEngine } from "./modules/retrieval/fusionEngine.js";
import {
  getVectorStoreAdapter,
  getKeywordAdapter,
} from "./providers/embedding/adapterLoader.js";
import { getEmbeddingAdapter } from "./providers/embedding/atlasEmbeddingAdapter.js";
import { FakeRerankerAdapter } from "./modules/reranker/fakeReranker.adapter.js";
import { createRerankerService } from "./modules/reranker/reranker.service.js";
import { registerRetrievalService } from "./modules/agents/agents.service.js";
import { maintenanceModeGuard } from "./common/middlewares/maintenanceMode.middleware.js";
import intentQueryRoutes from "./modules/intent-query/intentQuery.routes.js";
import { initializeIntentQueryService } from "./modules/intent-query/intentQuery.factory.js";
import { ChatService } from "./modules/chat/chat.service.js";
import { createChatRoutes } from "./modules/chat/chat.routes.js";
import { getModelAdapter } from "./providers/llm/index.js";
import documentTaxonomyRoutes from "./modules/document-taxonomy/documentTaxonomy.routes.js";
import knowledgeGapsRoutes from "./modules/knowledge-gaps/knowledge-gaps.routes.js";
import feedbackRoutes from "./modules/feedback/feedback.routes.js";
import { getRedisClient, isRedisConnected } from "./db/redis.js";
import { isMongoConnected } from "./db/connection.js";
import { getDocumentAccessAuthorizationService } from "./modules/document-access/documentAccess.authorization.service.js";
import entitlementRoutes from "./modules/entitlement/entitlement.routes.js";
import entitlementAdminRoutes from "./modules/entitlement/entitlement.admin.routes.js";
import analyticsRoutes from "./modules/analytics/analytics.routes.js";
import { EntitlementService } from "./modules/entitlement/entitlement.service.js";
import { MongoQuotaCounter } from "./modules/entitlement/adapters/mongo-quota-counter.js";
import { MongoEntitlementProvider } from "./modules/entitlement/adapters/mongo-entitlement-provider.js";

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

  return new Set(
    configuredOrigins
      .filter(Boolean)
      .flatMap((origin) => String(origin).split(","))
      .map((origin) => origin.trim().replace(/\/$/, ""))
      .filter(Boolean),
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
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Request-ID",
    "X-Correlation-ID",
    "X-Confirm-Logout-All",
    "Idempotency-Key",
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

// Stripe webhook raw body MUST be parsed before express.json() consumes the stream.
// express.raw() captures the raw Buffer for signature verification.
const rawBodyBuffer = express.raw({ type: "application/json", limit: "100kb" });
app.use("/webhooks/payment/stripe", rawBodyBuffer);

// JSON parser for all non-webhook routes
app.use((req, res, next) => {
  if (req.path.startsWith("/webhooks/")) return next();
  express.json()(req, res, next);
});

// ── Maintenance mode guard ───────────────────────────────────────────────
// Blocks non-admin traffic when maintenanceMode is enabled in Global Settings.
// Exempts: health probes, webhooks, and Super Admin users.
const MAINTENANCE_EXEMPT_PREFIXES = ["/healthz", "/readyz", "/webhooks/", "/auth/"];
app.use((req, res, next) => {
  const path = req.path;
  if (MAINTENANCE_EXEMPT_PREFIXES.some((p) => path.startsWith(p))) {
    next();
    return;
  }
  maintenanceModeGuard(req, res, next);
});

app.use("/auth", authRoutes);
app.use("/users", usersRoutes);
app.use("/platform", adminRoutes);
app.use("/platform", platformRoutes);
app.use("/internal/bootstrap", bootstrapRoutes);
app.use("/documents", documentsRoutes);
app.use("/dashboard", dashboardRoutes);
app.use("/settings", settingsRoutes);
app.use("/roles", rolesRoutes);
app.use("/public", publicRoutes);
app.use("/audit", auditRoutes);
app.use("/emails", emailRoutes);
app.use("/webhooks/email", emailWebhooks);
app.use("/permissions", permissionsRoutes);
app.use("/", jobsRoutes);
app.use("/agents", agentsRoutes);
app.use("/super-admin/agents", agentsAdminRoutes);
app.use("/webhooks/payment", paymentWebhookRoutes);
app.use("/super-admin", paymentWebhookAdminRoutes);
app.use("/super-admin", reconciliationRoutes);
app.use("/super-admin", refundAdminRoutes);
app.use("/checkout", checkoutRoutes);
app.use("/billing", tenantBillingRoutes);
app.use("/imports", importsRoutes);
app.use("/documents", processingRoutes);
app.use("/documents", processingProgressRoutes);
app.use("/intent-query", intentQueryRoutes);
app.use("/document-taxonomy", documentTaxonomyRoutes);
app.use("/knowledge-gaps", knowledgeGapsRoutes);
app.use("/feedback", feedbackRoutes);
app.use("/entitlement", entitlementRoutes);
app.use("/super-admin/entitlement", entitlementAdminRoutes);
app.use("/analytics", analyticsRoutes);

// ── EntitlementService singleton ─────────────────────────────────────────────
//
// Lazy-initialised singleton. Consumers import getEntitlementService() when
// they need to check quota or entitlement limits at runtime.
//
// Reuses the same pattern as getAuditWriter().

let entitlementServiceInstance: EntitlementService | null = null;

export function getEntitlementService(): EntitlementService {
  if (!entitlementServiceInstance) {
    entitlementServiceInstance = new EntitlementService(
      new MongoQuotaCounter(),
      new MongoEntitlementProvider(),
    );
  }
  return entitlementServiceInstance;
}

const filterCompiler: FilterCompiler = {
  compileAccessFilters,
  compileQueryFilters,
  mergeFilters,
};

const rerankerService = createRerankerService({
  reranker: new FakeRerankerAdapter(),
});

const retrievalService = createRetrievalService({
  vectorAdapter: await getVectorStoreAdapter(),
  keywordAdapter: await getKeywordAdapter(),
  embeddingAdapter: await getEmbeddingAdapter(),
  fusionEngine: new FusionEngine(),
  filterCompiler,
  repository: createRetrievalRepository(),
  rerankerService,
  resolveAccessContext: async (context) => {
    const actor = await getDocumentAccessAuthorizationService().resolveActor({ tenantId: context.tenantId, actorId: context.actorId });
    return { ...context, baseRole: actor.baseRole, customRoleId: actor.customRoleId, departmentIds: [...(actor.departmentIds ?? [])], requiredAction: "use_in_ai" };
  },
  authorizeDocumentForAi: async (context, documentId) => {
    await getDocumentAccessAuthorizationService().authorizeDocumentAction({ tenantId: context.tenantId, actorId: context.actorId }, documentId, "use_in_ai");
  },
});

registerRetrievalService(retrievalService);

await initializeIntentQueryService();
app.use("/retrieval", createRetrievalRoutes(retrievalService));

const chatService = new ChatService(retrievalService, getModelAdapter());
app.use("/chat", createChatRoutes(chatService));

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
      { errorCode: "AUTH_SIGNUP_VALIDATION_ERROR" },
    ),
    (_req, res) => {
      res.status(201).json({ ok: true });
    },
  );
}

app.use(notFoundMiddleware);
app.use(errorHandlerMiddleware);

export default app;
