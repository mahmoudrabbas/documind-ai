import mongoose from "mongoose";
import UserModel from "../../db/models/user.model.js";
import { emailService } from "../email/email.service.js";
import type { TemplateIdType } from "../email/email-templates/templateRegistry.js";
import { logger } from "../../common/logger/logger.js";

/**
 * Company lifecycle email notifications.
 *
 * Business rule: when a company is suspended or reactivated, notify every
 * ACTIVE COMPANY_ADMIN user belonging to that company. Employees, inactive
 * users, Super Admins and users of other tenants are never recipients.
 *
 * Delivery is intentionally decoupled from the lifecycle mutation: the
 * notification is enqueued only AFTER the transition has been applied and
 * audited, and any enqueue failure is logged and swallowed — it can never
 * roll back a completed company suspension/reactivation. Actual delivery is
 * async (the shared EmailMessage outbox + `email.send` queue), with retries
 * handled by the existing worker.
 *
 * Idempotency: the idempotency key embeds the transition event id, so
 * re-enqueueing the same transition for the same recipient is a no-op at the
 * EmailMessage layer, and an already-completed transition (which never
 * reaches this module) produces no notification at all.
 *
 * The key also becomes the BullMQ jobId (`email.send__<key>` via
 * `buildDedupKey`), so it MUST NOT contain `:` — BullMQ rejects custom job
 * ids containing `:`. `__` matches the queue's own separator convention.
 */

export type CompanyLifecycleTransition = "suspended" | "reactivated";

export interface CompanyLifecycleNotificationInput {
  tenantId: string;
  companyName: string;
  transition: CompanyLifecycleTransition;
  /** Unique identifier for the concrete lifecycle transition (event id). */
  eventId: string;
  /** Administrative reason, disclosed to recipients when provided. */
  reason?: string;
  /** Effective date/time label for the transition. */
  effectiveDate?: string;
  /** Tenant-level locale used for the emails ("en" | "ar"). Defaults to "en". */
  language?: "en" | "ar";
  actorId?: string;
  correlationId?: string;
}

export interface CompanyLifecycleNotificationSummary {
  transition: CompanyLifecycleTransition;
  /** Number of distinct active COMPANY_ADMIN recipients resolved. */
  recipients: number;
  /** Number of emails successfully enqueued. */
  enqueued: number;
  /** Number of recipients whose enqueue failed (diagnosable, never fatal). */
  failed: number;
}

const TRANSITION_TEMPLATES: Record<
  CompanyLifecycleTransition,
  TemplateIdType
> = {
  suspended: "company_suspended",
  reactivated: "company_reactivated",
};

/** Normalize and collapse recipient emails, preserving order. */
export function normalizeAndDedupeEmails(emails: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const email of emails) {
    const normalized = email.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

/**
 * Resolve distinct recipient emails for a company lifecycle notice: users of
 * the affected tenant who are active and hold the COMPANY_ADMIN base role.
 * Duplicate emails are collapsed before returning.
 */
export async function resolveActiveCompanyAdminEmails(
  tenantId: string,
): Promise<string[]> {
  const users = await UserModel.find({
    tenantId: new mongoose.Types.ObjectId(tenantId),
    status: "active",
    role: "COMPANY_ADMIN",
  })
    .select("email")
    .lean()
    .exec();

  return normalizeAndDedupeEmails(users.map((user) => user.email));
}

function toLanguage(value: "en" | "ar" | undefined): "en" | "ar" {
  return value === "ar" ? "ar" : "en";
}

/**
 * Enqueue lifecycle notification emails for the company's active admins.
 *
 * Never throws: any failure to resolve recipients or to enqueue an email is
 * logged (without PII or provider secrets) and reflected in the returned
 * summary, so a notification problem can never fail a completed lifecycle
 * transition.
 */
export async function notifyCompanyLifecycleTransition(
  input: CompanyLifecycleNotificationInput,
): Promise<CompanyLifecycleNotificationSummary> {
  const summary: CompanyLifecycleNotificationSummary = {
    transition: input.transition,
    recipients: 0,
    enqueued: 0,
    failed: 0,
  };

  let recipients: string[];
  try {
    recipients = await resolveActiveCompanyAdminEmails(input.tenantId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(
      {
        tenantId: input.tenantId,
        transition: input.transition,
        eventId: input.eventId,
      },
      `company lifecycle notification: failed to resolve recipients: ${message.slice(0, 500)}`,
    );
    summary.failed = summary.recipients = 0;
    return summary;
  }
  summary.recipients = recipients.length;
  if (recipients.length === 0) return summary;

  const templateId = TRANSITION_TEMPLATES[input.transition];
  const language = toLanguage(input.language);

  for (const recipientEmail of recipients) {
    const idempotencyKey = `company-lifecycle__${input.transition}__${input.tenantId}__${input.eventId}__${recipientEmail}`;
    try {
      await emailService.enqueue({
        tenantId: input.tenantId,
        recipientEmail,
        templateId,
        language,
        variables: {
          companyName: input.companyName,
          ...(input.reason ? { reason: input.reason } : {}),
          ...(input.effectiveDate
            ? { effectiveDate: input.effectiveDate }
            : {}),
        },
        idempotencyKey,
        ...(input.actorId ? { actorId: input.actorId } : {}),
        ...(input.correlationId
          ? { correlationId: input.correlationId }
          : {}),
      });
      summary.enqueued += 1;
    } catch (error) {
      summary.failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(
        {
          tenantId: input.tenantId,
          transition: input.transition,
          eventId: input.eventId,
          recipientCount: recipients.length,
          failedCount: summary.failed,
        },
        `company lifecycle notification: email enqueue failed: ${message.slice(0, 500)}`,
      );
    }
  }

  logger.info(
    {
      tenantId: input.tenantId,
      transition: input.transition,
      eventId: input.eventId,
      recipients: recipients.length,
      enqueued: summary.enqueued,
      failed: summary.failed,
    },
    "company lifecycle notification dispatched",
  );

  return summary;
}