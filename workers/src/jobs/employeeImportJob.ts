import { z } from "zod";
import crypto from "node:crypto";
import { ObjectId, type Db } from "mongodb";
import { Queue } from "bullmq";
import { getMongoClient } from "../db/mongo.js";
import { getRedisClient, isRedisConnected } from "../db/redis.js";
import { logger } from "../logger.js";
import { config } from "../config/index.js";
import { createUserInvitationToken } from "./userInvitationToken.js";
import type { JobHandlerDefinition, JobHandlerResult } from "../contracts/jobDispatcher.js";
import { RetryableJobError, PermanentJobError } from "../contracts/retryPolicy.js";
import {
  importBatchesCompleted,
  importBatchProcessingDuration,
  importRowsProcessed,
} from "../metrics/importMetrics.js";

// ─── Schema ─────────────────────────────────────────────────────────────────────

export const employeeImportPayloadSchema = z.object({
  batchId: z.string(),
  tenantId: z.string(),
  actorId: z.string(),
});

type EmployeeImportPayload = z.infer<typeof employeeImportPayloadSchema>;

// ─── Constants ───────────────────────────────────────────────────────────────────

const QUEUE_NAME = "documind-jobs";

// Plan → employee limit mapping (mirrors the billing configuration).
// These values should ideally come from the tenant's plan document.
const PLAN_LIMITS: Record<string, number> = {
  free: 20,
  trial: 50,
  pro: 500,
};

// ─── Lazy queue singleton (to avoid creating Redis connections per handler call) ─

let emailQueue: Queue | null = null;

function getEmailQueue(): Queue {
  if (!emailQueue) {
    emailQueue = new Queue(QUEUE_NAME, {
      connection: getRedisClient() as never,
    });
  }
  return emailQueue;
}

// ─── MongoDB collection helpers (type-safe wrappers) ─────────────────────────────

function collections(db: Db) {
  return {
    batches: db.collection("employeeimportbatches"),
    rows: db.collection("employeeimportrows"),
    users: db.collection("users"),
    emails: db.collection("emailmessages"),
    tenants: db.collection("tenants"),
  };
}

// ─── Invitation link builder (mirrors the API's buildVerificationUrl) ──────────

function buildInvitationUrl(token: string) {
  const url = new URL("/set-password-from-invite", config.APP_FRONTEND_URL);

  url.searchParams.set("token", token);

  return url.toString();
}

// ─── Row state helpers ───────────────────────────────────────────────────────────

async function markRowCreated(
  db: Db,
  rowId: ObjectId,
  batchId: ObjectId,
  tenantId: ObjectId,
  userId: ObjectId,
): Promise<void> {
  await collections(db).rows.updateOne(
    { _id: rowId, batchId, tenantId },
    {
      $set: { state: "CREATED", createdUserId: userId, processedAt: new Date() },
      $unset: { errorMessage: 1 },
    },
  );
}

async function markRowFailed(
  db: Db,
  rowId: ObjectId,
  batchId: ObjectId,
  tenantId: ObjectId,
  error: string,
): Promise<void> {
  await collections(db).rows.updateOne(
    { _id: rowId, batchId, tenantId },
    {
      $set: {
        state: "FAILED",
        errorMessage: error.substring(0, 500),
        processedAt: new Date(),
      },
    },
  );
}

async function markRowSkipped(
  db: Db,
  rowId: ObjectId,
  batchId: ObjectId,
  tenantId: ObjectId,
  reason: string,
): Promise<void> {
  await collections(db).rows.updateOne(
    { _id: rowId, batchId, tenantId },
    {
      $set: {
        state: "SKIPPED",
        errorMessage: reason.substring(0, 500),
        processedAt: new Date(),
      },
    },
  );
}

// ─── Handler ─────────────────────────────────────────────────────────────────────

/**
 * Processes an employee import batch:
 * 1. Loads the batch from MongoDB and validates its state
 * 2. Transitions QUEUED → PROCESSING (resumes PROCESSING on crash recovery)
 * 3. Re-checks tenant user quota
 * 4. Loads pending/failed rows and processes each sequentially
 * 5. For each row: idempotency check → dedup check → user creation →
 *    EmailMessage creation → email.send job enqueue → row state update
 * 6. Updates batch summary and terminal state on completion
 *
 * Partial success: individual row failures are caught and the batch continues.
 * The batch finalises as PARTIALLY_COMPLETED when some rows succeed and some fail.
 */
export const employeeImportJobHandler: JobHandlerDefinition<EmployeeImportPayload> = {
  jobType: "import.employee.batch",
  description:
    "Process an employee import batch — validates, creates users, dispatches invitations",
  payloadSchema: employeeImportPayloadSchema,
  maxAttempts: 3,

  handle: async (payload, ctx): Promise<JobHandlerResult> => {
    const client = getMongoClient();
    if (!client) {
      throw new RetryableJobError("Database not connected");
    }
    const db = client.db()!;
    const { batches, rows, users, emails, tenants } = collections(db);

    const batchId = new ObjectId(payload.batchId);
    const envelopeTenantId = ctx.envelope.tenantId;
    if (payload.tenantId !== envelopeTenantId) {
      throw new PermanentJobError("Tenant mismatch for import job");
    }
    const tenantId = new ObjectId(envelopeTenantId);
    const actorId = new ObjectId(payload.actorId);

    // ── 1. Load batch ──────────────────────────────────────────────────────────
    ctx.progress("Loading batch", { batchId: payload.batchId });

    const batch = await batches.findOne({ _id: batchId });
    if (!batch) {
      throw new PermanentJobError("Batch not found");
    }

    if (batch.tenantId?.toString() !== envelopeTenantId) {
      throw new PermanentJobError("Tenant mismatch for import batch");
    }

    if (batch.state !== "QUEUED" && batch.state !== "PROCESSING") {
      throw new PermanentJobError(
        `Invalid batch state: ${batch.state}. Expected QUEUED or PROCESSING.`,
      );
    }

    // ── 2. Transition to PROCESSING ─────────────────────────────────────────────
    let processingStartTime: Date;
    if (batch.state === "QUEUED") {
      processingStartTime = new Date();
      await batches.updateOne(
        { _id: batchId, tenantId },
        { $set: { state: "PROCESSING", processingStartedAt: processingStartTime } },
      );
      ctx.progress("Batch transitioned QUEUED → PROCESSING");
    } else {
      processingStartTime = batch.processingStartedAt
        ? new Date(batch.processingStartedAt)
        : new Date();
      ctx.progress(
        "Resuming batch from PROCESSING (crash recovery — will skip already-processed rows)",
      );
    }

    logger.info(
      {
        batchId: payload.batchId,
        tenantId: payload.tenantId,
        state: "PROCESSING",
        resumed: batch.state !== "QUEUED",
      },
      "import batch processing started",
    );

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    // ── 3. Quota re-check ───────────────────────────────────────────────────────
    // Count non-disabled EMPLOYEE users to match reconciliation service seat model
    const activeUserCount = await users.countDocuments({
      tenantId,
      role: "EMPLOYEE",
      status: { $ne: "disabled" },
    });

    const tenant = await tenants.findOne({ _id: tenantId });
    const plan = typeof tenant?.plan === "string" ? tenant.plan : "free";
    const planLimit =
      typeof tenant?.employeeLimit === "number"
        ? tenant.employeeLimit
        : (PLAN_LIMITS[plan] ?? 50);

    ctx.progress("Quota check", {
      activeUsers: activeUserCount,
      planLimit,
      plan,
    });

    // ── 4. Load rows ────────────────────────────────────────────────────────────
    const pendingRows = await rows
      .find({
        batchId,
        tenantId,
        state: { $in: ["PENDING", "VALID", "WARNING", "FAILED"] },
      })
      .sort({ rowNumber: 1 })
      .toArray();

    if (pendingRows.length === 0) {
      await batches.updateOne(
        { _id: batchId, tenantId },
        { $set: { state: "COMPLETED", completedAt: new Date() } },
      );

      const durationSeconds =
        (Date.now() - processingStartTime.getTime()) / 1000;
      importBatchesCompleted.inc({ state: "COMPLETED" });
      importBatchProcessingDuration.observe(
        { state: "COMPLETED", tenant_id: payload.tenantId },
        durationSeconds,
      );

      logger.info(
        {
          batchId: payload.batchId,
          tenantId: payload.tenantId,
          state: "COMPLETED",
          created: 0,
          failed: 0,
          skipped: 0,
          durationSeconds,
        },
        "import batch finalized (no pending rows)",
      );

      ctx.progress("No pending/failed rows — batch completed");
      return { summary: { rowsProcessed: 0, state: "COMPLETED" } };
    }

    ctx.progress("Rows to process", { count: pendingRows.length });

    // ── 5. Process rows sequentially ────────────────────────────────────────────
    const columnMapping = (batch.mapping as Record<string, unknown>)?.columnMapping as Record<string, string> | undefined;

    const getRowValue = (raw: Record<string, unknown>, targetField: string): string => {
      if (!raw) return "";
      // 1. Direct property match
      if (raw[targetField] != null && String(raw[targetField]).trim() !== "") {
        return String(raw[targetField]).trim();
      }
      // 2. Lookup via batch.mapping.columnMapping (header -> targetField)
      if (columnMapping) {
        for (const [header, mappedKey] of Object.entries(columnMapping)) {
          if (mappedKey === targetField && raw[header] != null && String(raw[header]).trim() !== "") {
            return String(raw[header]).trim();
          }
        }
      }
      // 3. Fallback case-insensitive match on keys
      for (const [k, v] of Object.entries(raw)) {
        if (k.toLowerCase().trim() === targetField.toLowerCase().trim() && v != null && String(v).trim() !== "") {
          return String(v).trim();
        }
      }
      return "";
    };

    const processedKeys = new Set<string>();
    let createdCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    let usersCreatedThisRun = 0;

    for (const row of pendingRows) {
      // Honour graceful shutdown
      if (ctx.signal.aborted) {
        ctx.progress("Abort signal received — stopping row processing");
        break;
      }

      try {
        // ── 5a. Idempotency guard ─────────────────────────────────────────────
        if (processedKeys.has(row.idempotencyKey)) {
          skippedCount++;
          continue;
        }

        // ── 5b. Extract & validate email ──────────────────────────────────────
        const rawData = (row.rawData as Record<string, unknown>) ?? {};
        const rowEmail = getRowValue(rawData, "email").toLowerCase();
        if (!rowEmail || !EMAIL_REGEX.test(rowEmail)) {
          const reason = !rowEmail
            ? "Missing or empty email field"
            : `Invalid email format: "${rowEmail}"`;
          await markRowFailed(db, row._id, batchId, tenantId, reason);
          failedCount++;
          continue;
        }

        // ── 5c. Dedup: existing user with same email + tenant ────────────────
        const existingUser = await users.findOne({ tenantId, email: rowEmail }) as Record<string, unknown> | null;
        if (existingUser) {
          await markRowSkipped(db, row._id, batchId, tenantId, `User already exists: ${rowEmail}`);
          skippedCount++;
          processedKeys.add(row.idempotencyKey);
          continue;
        }

        // ── 5d. Quota guard (per-row so we catch mid-batch breaches) ─────────
        if (activeUserCount + usersCreatedThisRun >= planLimit) {
          await markRowFailed(
            db,
            row._id,
            batchId,
            tenantId,
            `Tenant user limit reached (${planLimit})`,
          );
          failedCount++;
          continue;
        }

        // ── 5e. Build user document ──────────────────────────────────────────
        const firstName = getRowValue(rawData, "firstName");
        const lastName = getRowValue(rawData, "lastName");
        const fullName = getRowValue(rawData, "fullName");
        const userName = `${firstName} ${lastName}`.trim() || fullName || rowEmail.split("@")[0];

        const employeeProfile: Record<string, unknown> = {};
        const empId = getRowValue(rawData, "employeeId");
        if (empId) employeeProfile.employeeId = empId;
        const dept = getRowValue(rawData, "department");
        if (dept) employeeProfile.department = dept;
        const jobT = getRowValue(rawData, "jobTitle");
        if (jobT) employeeProfile.jobTitle = jobT;
        const ph = getRowValue(rawData, "phone");
        if (ph) employeeProfile.phone = ph;
        const hDate = getRowValue(rawData, "hireDate");
        if (hDate) employeeProfile.hireDate = new Date(hDate);
        const lang = getRowValue(rawData, "language");
        employeeProfile.preferredLanguage = lang === "ar" ? "ar" : "en";

        const tempPasswordHash = crypto
          .createHash("sha256")
          .update(crypto.randomBytes(32).toString("hex"))
          .digest("hex");

        const newUserId = new ObjectId();
        const invitation = createUserInvitationToken({
          userId: newUserId.toString(),
          tenantId: payload.tenantId,
          email: rowEmail,
        });

        const userDoc = {
          _id: newUserId,
          tenantId,
          name: userName,
          email: rowEmail,
          passwordHash: tempPasswordHash,
          role: "EMPLOYEE",
          status: "pending_email_verification",
          emailVerified: false,
          emailVerifiedAt: null,
          emailVerificationTokenHash: invitation.tokenHash,
          emailVerificationExpiresAt: invitation.expiresAt,
          passwordResetTokenHash: null,
          passwordResetExpiresAt: null,
          customRoleId: null,
          permissionBaseline: "standard",
          roleMigrationState: "complete",
          sessionGuardVersion: 0,
          employeeProfile:
            Object.keys(employeeProfile).length > 0
              ? employeeProfile
              : undefined,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        // ── 5f. Insert user (with duplicate-key fallback) ────────────────────
        try {
          await users.insertOne(userDoc);
        } catch (insertErr: unknown) {
          const mongoErr = insertErr as { code?: number };
          if (mongoErr.code === 11000) {
            // Duplicate key — idempotent re-run guard. The user was created
            // in a previous attempt but the row wasn't updated.
            const dup = (await users.findOne({
              tenantId,
              email: rowEmail,
            })) as Record<string, unknown> | null;
            if (dup) {
              await markRowCreated(db, row._id, batchId, tenantId, dup._id as ObjectId);
              createdCount++;
              processedKeys.add(row.idempotencyKey);
              continue;
            }
          }
          throw insertErr;
        }

        usersCreatedThisRun++;

        // ── 5g. Create EmailMessage document ─────────────────────────────────
        const emailIdempotencyKey = `${row.idempotencyKey}-invite`;
        const emailHash = crypto
          .createHash("sha256")
          .update(rowEmail)
          .digest("hex");
        const preferredLang =
          (employeeProfile.preferredLanguage as string) ?? "en";

        const emailDoc = {
          _id: new ObjectId(),
          tenantId,
          recipientEmail: rowEmail,
          recipientHash: emailHash,
          templateId: "user_invitation",
          templateVersion: "2.0",
          language: preferredLang,
          variables: {
            companyName: (tenant?.name as string) || "DocuMind",
            role: "EMPLOYEE",
            invitationUrl: buildInvitationUrl(invitation.token),
            expiryDate: invitation.expiresAt.toUTCString(),
          },
          subject: `Welcome to DocuMind, ${userName}`,
          state: "PENDING",
          idempotencyKey: emailIdempotencyKey,
          correlationId: payload.batchId,
          priority: 10,
          scheduledFor: null,
          sentAt: null,
          deliveredAt: null,
          failedAt: null,
          lastAttemptAt: null,
          attemptCount: 0,
          maxAttempts: 5,
          errorCategory: null,
          errorMessage: null,
          providerMessageId: null,
          createdBy: actorId,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        try {
          await emails.insertOne(emailDoc);
        } catch (emailInsertErr: unknown) {
          const mongoErr = emailInsertErr as { code?: number };
          if (mongoErr.code !== 11000) {
            // Non-duplicate failure — log and continue; the email will be
            // picked up by a retry or manual process.
            logger.warn(
              {
                err: emailInsertErr,
                rowNumber: row.rowNumber,
                idempotencyKey: emailIdempotencyKey,
              },
              "EmailMessage insert failed (non-duplicate) — continuing",
            );
          }
          // 11000 = idempotent duplicate from a previous attempt; safe to continue
        }

        // ── 5h. Enqueue email.send job ───────────────────────────────────────
        try {
          if (isRedisConnected()) {
            const queue = getEmailQueue();
            const emailJobId = crypto
              .createHash("sha256")
              .update(`email.send:${emailIdempotencyKey}`)
              .digest("hex");

            const existingJob = await queue.getJob(emailJobId);
            if (!existingJob) {
              await queue.add(
                "email.send",
                {
                  schemaVersion: "1.0.0",
                  jobType: "email.send",
                  tenantId: payload.tenantId,
                  actorId: payload.actorId,
                  traceId: ctx.traceId,
                  idempotencyKey: emailIdempotencyKey,
                  payload: { messageId: emailDoc._id.toString() },
                  createdAt: new Date().toISOString(),
                },
                { jobId: emailJobId },
              );
            }
          } else {
            logger.warn(
              "Redis not connected — skipping email.send enqueue (email pending in MongoDB)",
            );
          }
        } catch (queueErr) {
          // Non-critical: the EmailMessage is already persisted in MongoDB with
          // state PENDING. A reconciliation job or retry can pick it up later.
          logger.warn(
            { err: queueErr, rowNumber: row.rowNumber },
            "Failed to enqueue email.send job — continuing",
          );
        }

        // ── 5i. Mark row CREATED ─────────────────────────────────────────────
        await markRowCreated(db, row._id, batchId, tenantId, newUserId);
        createdCount++;
        processedKeys.add(row.idempotencyKey);

        ctx.progress("Row processed", {
          rowNumber: row.rowNumber,
          created: true,
        });
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        ctx.progress("Row failed", {
          rowNumber: row.rowNumber,
          error: errorMsg.substring(0, 200),
        });
        await markRowFailed(db, row._id, batchId, tenantId, errorMsg);
        failedCount++;
      }
    }

    // Recount actual row states from DB to avoid $inc accumulation across retries
    const allRows = await rows.find({ batchId, tenantId }).sort({ rowNumber: 1 }).toArray();
    const actualCreated = allRows.filter((r) => r.state === "CREATED" || r.state === "INVITED").length;
    const actualFailed = allRows.filter((r) => r.state === "FAILED").length;
    const actualSkipped = allRows.filter((r) => r.state === "SKIPPED").length;

    const finalState =
      actualCreated > 0 && actualFailed === 0
        ? "COMPLETED"
        : actualCreated > 0 && actualFailed > 0
          ? "PARTIALLY_COMPLETED"
          : actualCreated === 0 && actualSkipped > 0
            ? "COMPLETED"
            : "FAILED";

    await batches.updateOne(
      { _id: batchId, tenantId },
      {
        $set: {
          state: finalState,
          completedAt: new Date(),
          errorMessage:
            actualFailed > 0
              ? `${actualFailed} row(s) failed out of ${allRows.length}`
              : null,
          "summary.created": actualCreated,
          "summary.failed": actualFailed,
          "summary.skipped": actualSkipped,
        },
      },
    );

    // Record row-level metrics
    if (createdCount > 0) importRowsProcessed.inc({ state: "CREATED" }, createdCount);
    if (skippedCount > 0) importRowsProcessed.inc({ state: "SKIPPED" }, skippedCount);
    if (failedCount > 0) importRowsProcessed.inc({ state: "FAILED" }, failedCount);

    // Record batch completion metrics
    const durationSeconds =
      (Date.now() - processingStartTime.getTime()) / 1000;
    importBatchesCompleted.inc({ state: finalState });
    importBatchProcessingDuration.observe(
      { state: finalState, tenant_id: payload.tenantId },
      durationSeconds,
    );

    logger.info(
      {
        batchId: payload.batchId,
        tenantId: payload.tenantId,
        state: finalState,
        created: createdCount,
        failed: failedCount,
        skipped: skippedCount,
        durationSeconds,
      },
      "import batch finalized",
    );

    // ── 7. Reconcile quota counter post-import ────────────────────────────────
    try {
      const actualCount = await users.countDocuments({
        tenantId,
        role: "EMPLOYEE",
        status: { $ne: "disabled" },
      });
      await db.collection("quotacounters").updateOne(
        { tenantId, dimension: "employees" },
        {
          $set: {
            current: actualCount,
            lastReconciledAt: new Date(),
            updatedAt: new Date(),
          },
        },
        { upsert: true },
      );
      logger.info(
        { tenantId: payload.tenantId, actualCount },
        "employee quota counter reconciled post-import",
      );
    } catch (reconcileErr) {
      logger.warn(
        { err: reconcileErr, tenantId: payload.tenantId },
        "failed to reconcile employee quota counter post-import",
      );
    }

    ctx.progress("Batch finalized", {
      state: finalState,
      created: createdCount,
      failed: failedCount,
      skipped: skippedCount,
      durationSeconds,
    });

    return {
      summary: {
        rowsProcessed: createdCount + failedCount + skippedCount,
        created: createdCount,
        failed: failedCount,
        skipped: skippedCount,
        state: finalState,
      },
    };
  },
};
