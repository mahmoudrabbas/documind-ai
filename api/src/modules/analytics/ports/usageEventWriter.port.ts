import type { UsageEventType, CostType } from "../../../db/models/usageEvent.model.js";

export interface UsageEventInput {
  tenantId: string;
  actorId?: string | null;
  departmentId?: string | null;
  eventType: UsageEventType;
  provider?: string | null;
  model?: string | null;
  modelVersion?: string | null;
  documentId?: string | null;
  evidenceIds?: string[];
  conversationId?: string | null;
  messageId?: string | null;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  units?: number;
  costMinorUnits?: number;
  currency?: string;
  costType?: CostType;
  latencyMs?: number;
  success?: boolean;
  errorCode?: string | null;
  traceId?: string | null;
  requestId?: string | null;
  idempotencyKey?: string | null;
  metadata?: Record<string, unknown>;
}

export interface UsageEventRecord extends UsageEventInput {
  id: string;
  createdAt: Date;
}

export interface UsageEventWriter {
  record(event: UsageEventInput): Promise<UsageEventRecord>;
  recordBatch(events: UsageEventInput[]): Promise<UsageEventRecord[]>;
}
