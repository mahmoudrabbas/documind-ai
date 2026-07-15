import { logger } from "../logger/logger.js";

export interface MetricRecorder {
  increment(name: string, tags?: Record<string, string | number | boolean>): void;
  histogram(name: string, value: number, tags?: Record<string, string | number | boolean>): void;
  gauge(name: string, value: number, tags?: Record<string, string | number | boolean>): void;
}

export class LogMetricRecorder implements MetricRecorder {
  increment(name: string, tags?: Record<string, string | number | boolean>): void {
    logger.info({ metric: name, type: "counter", value: 1, tags }, `Metric: ${name}`);
  }

  histogram(name: string, value: number, tags?: Record<string, string | number | boolean>): void {
    logger.info({ metric: name, type: "histogram", value, tags }, `Metric: ${name}`);
  }

  gauge(name: string, value: number, tags?: Record<string, string | number | boolean>): void {
    logger.info({ metric: name, type: "gauge", value, tags }, `Metric: ${name}`);
  }
}

export class InMemoryMetricRecorder implements MetricRecorder {
  public metrics: Array<{ name: string; type: string; value: number; tags?: Record<string, string | number | boolean> }> = [];

  increment(name: string, tags?: Record<string, string | number | boolean>): void {
    this.metrics.push({ name, type: "counter", value: 1, tags });
  }

  histogram(name: string, value: number, tags?: Record<string, string | number | boolean>): void {
    this.metrics.push({ name, type: "histogram", value, tags });
  }

  gauge(name: string, value: number, tags?: Record<string, string | number | boolean>): void {
    this.metrics.push({ name, type: "gauge", value, tags });
  }

  clear(): void {
    this.metrics = [];
  }
}
