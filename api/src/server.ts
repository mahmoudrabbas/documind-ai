import dotenv from "dotenv";
import app from "./app.js";
import { connectDB, disconnectDB, getDb } from "./db/connection.js";
import { connectRedis, disconnectRedis } from "./db/redis.js";
import { config } from "./config/index.js";
import { logger } from "./common/logger/logger.js";
import { startEntitlementReconciliation } from "./modules/entitlement/reconciliation.scheduler.js";
import { startTokenQuotaReservationScheduler } from "./modules/entitlement/tokenQuotaReservation.scheduler.js";
import { getReconciliationService } from "./modules/entitlement/reconciliation.service.js";
import { registerPlanChangeHook } from "./modules/billing/subscription.service.js";
import { startNotificationOutboxScheduler } from "./modules/notifications/outbox/notificationOutbox.scheduler.js";
import { startNotificationSweepsScheduler } from "./modules/notifications/sweeps/notificationSweeps.scheduler.js";
import { NotificationService } from "./modules/notifications/notifications.service.js";
import { MongoNotificationRepository } from "./modules/notifications/repositories/mongo/notification.repository.js";
import { MongoUserNotificationStateRepository } from "./modules/notifications/repositories/mongo/userNotificationState.repository.js";
import { RecipientResolver } from "./modules/notifications/recipientResolver.js";
import { setNotificationCreatePort } from "./modules/notifications/outbox/notificationOutbox.dispatcher.js";
import { createSocketServer } from "./modules/notifications/socket/notificationSocketServer.js";
import { setCopilotSocketServer } from "./modules/copilot/socket/copilotSocketEmitter.js";
import SubscriptionModel from "./db/models/subscription.model.js";
import { inspectSubscriptionIndexInvariant } from "./db/subscription-index-invariant.js";
import { shutdownLangfuse } from "./providers/observability/langfuse.js";

dotenv.config();

const VECTOR_INDEX_NAME = "vidx_chunk_embeddings_v1";
const KEYWORD_INDEX_NAME = "kidx_chunk_text_v1";

async function ensureSearchIndexes(): Promise<void> {
  const db = getDb();
  if (!db) {
    logger.warn("Database not connected; skipping search index validation");
    return;
  }

  try {
    const chunkEmbeddings = db.collection("chunkembeddings");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (chunkEmbeddings as any).createSearchIndex({
      name: VECTOR_INDEX_NAME,
      type: "vectorSearch",
      definition: {
        fields: [
          { type: "vector", numDimensions: parseInt(process.env.AI_PROVIDER === "groq" ? (process.env.JINA_EMBEDDING_DIMENSIONS || "1024") : process.env.AI_PROVIDER === "student-bedrock" ? "1024" : (process.env.OPENAI_EMBEDDING_DIMENSIONS || "1536"), 10), path: "vector", similarity: "cosine" },
          { type: "filter", path: "tenantId" },
          { type: "filter", path: "documentId" },
          { type: "filter", path: "generationId" },
          { type: "filter", path: "department" },
          { type: "filter", path: "classification" },
          { type: "filter", path: "language" },
          { type: "filter", path: "contentType" },
        ],
      },
    });
    logger.info({ indexName: VECTOR_INDEX_NAME }, "Vector search index ensured");
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    if (error.message.includes("already exists")) {
      logger.info({ indexName: VECTOR_INDEX_NAME }, "Vector search index already exists");
    } else {
      logger.warn({ err, indexName: VECTOR_INDEX_NAME }, "Could not create vector search index (will retry on first indexing job)");
    }
  }

  try {
    const documentChunks = db.collection("documentchunks");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (documentChunks as any).createSearchIndex({
      name: KEYWORD_INDEX_NAME,
      type: "search",
      definition: {
        mappings: {
          dynamic: false,
          fields: {
            text: { type: "string", analyzer: "luceneStandard" },
            tenantId: { type: "objectId" },
            documentId: { type: "objectId" },
            generationId: { type: "objectId" },
            classification: { type: "string", analyzer: "luceneStandard" },
            department: { type: "string", analyzer: "luceneStandard" },
            category: { type: "string", analyzer: "luceneStandard" },
          },
        },
      },
    });
    logger.info({ indexName: KEYWORD_INDEX_NAME }, "Keyword search index ensured");
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    if (error.message.includes("already exists")) {
      logger.info({ indexName: KEYWORD_INDEX_NAME }, "Keyword search index already exists");
    } else {
      logger.warn({ err, indexName: KEYWORD_INDEX_NAME }, "Could not create keyword search index (will retry on first indexing job)");
    }
  }

  try {
    const chunkEmbeddings = db.collection("chunkembeddings");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vectorIndexes = await (chunkEmbeddings as any).listSearchIndexes().toArray();
    const vectorReady = vectorIndexes.some(
      (idx: { name: string; status?: string }) => idx.name === VECTOR_INDEX_NAME && idx.status === "READY",
    );
    const documentChunks = db.collection("documentchunks");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const keywordIndexes = await (documentChunks as any).listSearchIndexes().toArray();
    const keywordReady = keywordIndexes.some(
      (idx: { name: string; status?: string }) => idx.name === KEYWORD_INDEX_NAME && idx.status === "READY",
    );

    if (vectorReady && keywordReady) {
      logger.info("Atlas search indexes are READY");
    } else {
      logger.warn(
        { vectorReady, keywordReady },
        "Atlas search indexes not yet READY; service started in degraded mode — writes proceed but documents cannot become SEARCHABLE until indexes are READY",
      );
    }
  } catch {
    logger.warn("Could not verify Atlas search index status at startup");
  }
}

let shuttingDown = false;
let tokenQuotaReservationTimer: NodeJS.Timeout | null = null;

async function gracefulShutdown(signal: string) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  logger.info({ signal }, "graceful shutdown started");

  if (tokenQuotaReservationTimer) {
    clearInterval(tokenQuotaReservationTimer);
    tokenQuotaReservationTimer = null;
    logger.info("Token quota reservation scheduler stopped");
  }

  await new Promise<void>((resolve) => {
    server.close(() => {
      logger.info("HTTP server closed");
      resolve();
    });
  });

  notificationSocketServer.close();
  logger.info("Notification socket server closed");

  await Promise.allSettled([disconnectRedis(), disconnectDB(), shutdownLangfuse()]);

  process.exit(0);
}

try {
  await connectDB();
  try {
    const subscriptionIndex = await inspectSubscriptionIndexInvariant(SubscriptionModel.collection);
    if (subscriptionIndex.valid) {
      logger.info({ diagnosticsCode: "SUBSCRIPTION_INDEX_INVARIANT_READY" }, "Subscription index invariant verified");
    } else {
      logger.error({
        diagnosticsCode: "SUBSCRIPTION_INDEX_MIGRATION_REQUIRED",
        issues: subscriptionIndex.issues,
        effectiveDuplicateTenantCount: subscriptionIndex.effectiveDuplicateTenantCount,
      }, "Subscription index invariant requires migration");
    }
  } catch (error) {
    logger.error({ err: error, diagnosticsCode: "SUBSCRIPTION_INDEX_INVARIANT_CHECK_FAILED" }, "Subscription index invariant could not be verified");
  }
  await connectRedis();
  await ensureSearchIndexes();
  if (config.NODE_ENV !== "production" && config.PAYMENT_PROVIDER === "stripe") {
    logger.warn(
      {
        diagnosticsCode: "LOCAL_STRIPE_WEBHOOK_FORWARDING_UNCONFIRMED",
        listenerCommand: "npm run stripe:listen",
      },
      "Local Stripe webhook forwarding is not confirmed; keep Stripe CLI running for asynchronous lifecycle events",
    );
  }
} catch (err) {
  logger.fatal({ err }, "API startup failed");
  process.exit(1);
}

const server = app.listen(config.PORT, () => {
  logger.info({ port: config.PORT }, "API server started");
});

const notificationSocketServer = createSocketServer(server);
logger.info("Notification socket server attached");

// Copilot lifecycle channel (§15) — the same socket.io instance serves
// `copilot:<runId>` rooms; emission is best-effort (see copilotSocketEmitter).
setCopilotSocketServer(notificationSocketServer);

// ── Entitlement reconciliation scheduler ─────────────────────────────────────
//
// Lightweight in-process daily sweep. Disabled when
// ENTITLEMENT_RECONCILE_ENABLED=false. Non-blocking: DB failures are caught
// inside each tick and never crash the process.

if (process.env.ENTITLEMENT_RECONCILE_ENABLED !== "false") {
  try {
    startEntitlementReconciliation();
    logger.info("Entitlement reconciliation scheduler started");
  } catch (error) {
    logger.warn(
      { err: error },
      "Failed to start entitlement reconciliation scheduler",
    );
  }
}

// ── Token quota reservation expiry scheduler ────────────────────────────────
//
// Fast sweep for durable ACTIVE token reservations whose TTL has expired.
// This is intentionally separate from the daily entitlement reconciliation
// scheduler because token reservations have short-lived execution TTLs.

if (process.env.TOKEN_QUOTA_RESERVATION_SWEEP_ENABLED !== "false") {
  try {
    tokenQuotaReservationTimer =
      startTokenQuotaReservationScheduler();

    logger.info("Token quota reservation scheduler started");
  } catch (error) {
    logger.warn(
      { err: error },
      "Failed to start token quota reservation scheduler",
    );
  }
}

// ── Notification create port (T6) ───────────────────────────────────────────
// Wire the real NotificationService into the outbox dispatcher BEFORE the
// scheduler below starts — getNotificationOutboxDispatcher() throws unless
// setNotificationCreatePort() was called. Registration is object construction
// only (no DB/Redis access), so it cannot fail at startup.

const notificationService = new NotificationService(
  new MongoNotificationRepository(),
  new MongoUserNotificationStateRepository(),
  new RecipientResolver(),
);
setNotificationCreatePort({
  create: (tenantId, draft, recipientUserIds) =>
    notificationService.create(tenantId, draft, recipientUserIds),
  markEnqueued: (tenantId, notificationIds) =>
    notificationService.markEnqueued(tenantId, notificationIds),
});

// ── Notification outbox scheduler ────────────────────────────────────────────
//
// Phase-1 in-process 5s poller that advances the outbox (factory → create →
// enqueue). Failure-isolated: if the notification create port is not wired yet
// (T6, Wave 3) or a sweep fails, this logs and never crashes startup. Disabled
// when NOTIFICATIONS_OUTBOX_ENABLED=false.

if (process.env.NOTIFICATIONS_OUTBOX_ENABLED !== "false") {
  try {
    startNotificationOutboxScheduler();
    logger.info("Notification outbox scheduler started");
  } catch (error) {
    logger.warn(
      { err: error },
      "Failed to start notification outbox scheduler",
    );
  }
}

// ── Notification sweeps scheduler (T20) ─────────────────────────────────────
// TTL/DLQ/unread-reconcile sweeps on a fixed interval; env-gated via the T20
// keys (NOTIFICATION_SWEEP_ENABLED=false default → start() is a no-op).

if (config.NOTIFICATION_SWEEP_ENABLED) {
  try {
    startNotificationSweepsScheduler({
      intervalMs: config.NOTIFICATION_SWEEP_INTERVAL_MS,
      ttlBatch: config.NOTIFICATION_SWEEP_TTL_BATCH,
    });
    logger.info("Notification sweeps scheduler started");
  } catch (error) {
    logger.warn(
      { err: error },
      "Failed to start notification sweeps scheduler",
    );
  }
}

// ── Plan-change → entitlement reconcile hook ─────────────────────────────────
// Re-evaluate a tenant's entitlement counters immediately whenever its
// subscription plan/status changes (transition, admin PATCH, provider sync).
// Registered here — not inside the billing module — to avoid a
// billing→entitlement import cycle. Failure-isolated: a reconcile error is
// logged and never crashes the mutation that triggered it.

registerPlanChangeHook(async (info) => {
  try {
    await getReconciliationService().reconcile(info.tenantId, "execute");
  } catch (error) {
    logger.warn(
      { err: error, tenantId: info.tenantId },
      "Entitlement reconcile after plan change failed (non-blocking)",
    );
  }
});

process.on("SIGTERM", () => {
  void gracefulShutdown("SIGTERM");
});
process.on("SIGINT", () => {
  void gracefulShutdown("SIGINT");
});
