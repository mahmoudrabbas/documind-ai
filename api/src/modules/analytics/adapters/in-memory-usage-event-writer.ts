import type {
  UsageEventWriter,
  UsageEventInput,
  UsageEventRecord,
} from "../ports/usageEventWriter.port.js";

export class InMemoryUsageEventWriter implements UsageEventWriter {
  private events: UsageEventRecord[] = [];

  async record(input: UsageEventInput): Promise<UsageEventRecord> {
    if (input.idempotencyKey) {
      const existing = this.events.find((e) => e.idempotencyKey === input.idempotencyKey);
      if (existing) {
        return existing;
      }
    }

    const record: UsageEventRecord = {
      ...input,
      id: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      actorId: input.actorId ?? null,
      departmentId: input.departmentId ?? null,
      provider: input.provider ?? null,
      model: input.model ?? null,
      modelVersion: input.modelVersion ?? null,
      documentId: input.documentId ?? null,
      evidenceIds: input.evidenceIds ?? [],
      conversationId: input.conversationId ?? null,
      messageId: input.messageId ?? null,
      inputTokens: input.inputTokens ?? 0,
      outputTokens: input.outputTokens ?? 0,
      totalTokens: input.totalTokens ?? ((input.inputTokens ?? 0) + (input.outputTokens ?? 0)),
      units: input.units ?? 1,
      costMinorUnits: input.costMinorUnits ?? 0,
      currency: input.currency ?? "USD",
      costType: input.costType ?? "estimated",
      latencyMs: input.latencyMs ?? 0,
      success: input.success ?? true,
      errorCode: input.errorCode ?? null,
      traceId: input.traceId ?? null,
      requestId: input.requestId ?? null,
      idempotencyKey: input.idempotencyKey ?? null,
      metadata: input.metadata ?? {},
      createdAt: new Date(),
    };

    this.events.push(record);
    return record;
  }

  async recordBatch(inputs: UsageEventInput[]): Promise<UsageEventRecord[]> {
    const results: UsageEventRecord[] = [];
    for (const input of inputs) {
      results.push(await this.record(input));
    }
    return results;
  }

  getEvents(): UsageEventRecord[] {
    return [...this.events];
  }

  clear(): void {
    this.events = [];
  }
}
