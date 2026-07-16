import type { AuditWriter } from "./auditWriter.js";
import { MongoAuditWriter } from "./auditWriter.js";
import type { MetricRecorder } from "./metricRecorder.js";
import { LogMetricRecorder, InMemoryMetricRecorder } from "./metricRecorder.js";

// Global instances
let auditWriterInstance: AuditWriter | null = null;
let metricRecorderInstance: MetricRecorder | null = null;

export function initObservability(isTest = process.env.NODE_ENV === "test") {
  // Always use MongoAuditWriter — tests run against a real MongoDB (mongoms)
  // and existing tests assert directly on AuditLogModel.
  auditWriterInstance = new MongoAuditWriter();
  metricRecorderInstance = isTest
    ? new InMemoryMetricRecorder()
    : new LogMetricRecorder();
}

export function getAuditWriter(): AuditWriter {
  if (!auditWriterInstance) {
    initObservability();
  }
  return auditWriterInstance!;
}

export function getMetricRecorder(): MetricRecorder {
  if (!metricRecorderInstance) {
    initObservability();
  }
  return metricRecorderInstance!;
}

