import type { AuditWriter } from "./auditWriter.js";
import { MongoAuditWriter, InMemoryAuditWriter } from "./auditWriter.js";
import type { MetricRecorder } from "./metricRecorder.js";
import { LogMetricRecorder, InMemoryMetricRecorder } from "./metricRecorder.js";

// Global instances
let auditWriterInstance: AuditWriter | null = null;
let metricRecorderInstance: MetricRecorder | null = null;

export function initObservability(isTest = process.env.NODE_ENV === "test") {
  if (isTest) {
    auditWriterInstance = new InMemoryAuditWriter();
    metricRecorderInstance = new InMemoryMetricRecorder();
  } else {
    auditWriterInstance = new MongoAuditWriter();
    metricRecorderInstance = new LogMetricRecorder();
  }
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
