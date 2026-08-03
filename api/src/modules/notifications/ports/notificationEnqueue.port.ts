/**
 * Notification dispatch enqueue port (T10).
 *
 * The narrow port the outbox dispatcher uses to hand a batch of freshly
 * created notifications to the BullMQ 'notification.dispatch' queue. The real
 * implementation wraps `getApiJobDispatcher()` (the API is producer-only,
 * guardrail 17); tests inject a fake. T11's worker consumes the job.
 */
export const NOTIFICATION_DISPATCH_JOB = "notification.dispatch";

export interface EnqueueDispatchInput {
  notificationIds: string[];
  tenantId: string;
  traceId?: string;
  idempotencyKey?: string;
  actorId: string;
}

export interface NotificationEnqueuePort {
  /** Enqueue one 'notification.dispatch' job for the created batch. Resolves
   *  on success, rejects on queue failure (the dispatcher then schedules a
   *  retry). */
  enqueueDispatch(input: EnqueueDispatchInput): Promise<void>;
}
