import mongoose, { Schema } from "mongoose";

export interface AnalyticsAggregateDocument extends mongoose.Document {
  tenantId: mongoose.Types.ObjectId;
  date: string; // YYYY-MM-DD
  periodGranularity: "hourly" | "daily" | "weekly" | "monthly";
  departmentId?: string | null;
  actorId?: mongoose.Types.ObjectId | null;
  provider?: string | null;
  modelName?: string | null;
  eventType?: string | null;
  documentId?: mongoose.Types.ObjectId | null;
  eventCount: number;
  totalTokens: number;
  totalCostMinorUnits: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  successCount: number;
  failureCount: number;
  refusalCount: number;
  reconciliationDrift: number;
  aggregatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const analyticsAggregateSchema = new Schema<AnalyticsAggregateDocument>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    date: {
      type: String,
      required: true,
      index: true,
    },
    periodGranularity: {
      type: String,
      enum: ["hourly", "daily", "weekly", "monthly"],
      default: "daily",
    },
    departmentId: {
      type: String,
      default: null,
    },
    actorId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    provider: {
      type: String,
      default: null,
    },
    modelName: {
      type: String,
      default: null,
    },
    eventType: {
      type: String,
      default: null,
    },
    documentId: {
      type: Schema.Types.ObjectId,
      ref: "Document",
      default: null,
    },
    eventCount: {
      type: Number,
      default: 0,
    },
    totalTokens: {
      type: Number,
      default: 0,
    },
    totalCostMinorUnits: {
      type: Number,
      default: 0,
    },
    avgLatencyMs: {
      type: Number,
      default: 0,
    },
    p95LatencyMs: {
      type: Number,
      default: 0,
    },
    successCount: {
      type: Number,
      default: 0,
    },
    failureCount: {
      type: Number,
      default: 0,
    },
    refusalCount: {
      type: Number,
      default: 0,
    },
    reconciliationDrift: {
      type: Number,
      default: 0,
    },
    aggregatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

analyticsAggregateSchema.index({ tenantId: 1, date: 1, periodGranularity: 1 });
analyticsAggregateSchema.index({ tenantId: 1, provider: 1, modelName: 1, date: 1 });

const AnalyticsAggregateModel = mongoose.model<AnalyticsAggregateDocument>(
  "AnalyticsAggregate",
  analyticsAggregateSchema,
  "analytics_aggregates"
);

export default AnalyticsAggregateModel;
