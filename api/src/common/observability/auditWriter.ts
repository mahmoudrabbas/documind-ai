import type { AuditEventInput } from "./auditEvents.js";
import { getCurrentTraceContext } from "../utils/requestContext.js";
import { redactObject } from "./redactionRules.js";
import { logger } from "../logger/logger.js";
import { createAuditLog } from "../../modules/audit/audit.repository.js";

export interface AuditWriter {
  write(event: AuditEventInput): Promise<void>;
}

export class MongoAuditWriter implements AuditWriter {
  async write(event: AuditEventInput): Promise<void> {
    try {
      const ctx = getCurrentTraceContext();
      const redactedChanges = event.changes ? redactObject(event.changes) : {};
      
      const payload = {
        tenantId: event.tenantId ?? ctx?.tenantId ?? "system", // Fallback for platform/system events
        userId: event.actorId ?? ctx?.actorId ?? "system",
        resourceType: event.resourceType,
        resourceId: event.resourceId,
        action: event.action,
        actorId: event.actorId ?? ctx?.actorId ?? "system",
        actorEmail: event.actorEmail ?? "system@documind.ai",
        actorRole: event.actorRole ?? "SYSTEM",
        changes: redactedChanges,
        traceId: ctx?.traceId,
        requestId: ctx?.requestId,
        outcome: event.outcome ?? "SUCCESS",
        metadata: event.metadata ? redactObject(event.metadata) : undefined,
      };

      // In a real high-throughput scenario, we might want to batch these or 
      // send to a queue, but we'll stick to DB for now as per the architecture.
      // We wrap the repository call so it never fails the business transaction.
      await createAuditLog(payload);
    } catch (error) {
      // Failure policy: log error + increment counter, never block the calling business action
      logger.error({ err: error, action: event.action }, "Failed to write audit log");
    }
  }
}

export class InMemoryAuditWriter implements AuditWriter {
  public readonly events: AuditEventInput[] = [];

  async write(event: AuditEventInput): Promise<void> {
    this.events.push(event);
  }

  clear(): void {
    this.events.length = 0;
  }
}
