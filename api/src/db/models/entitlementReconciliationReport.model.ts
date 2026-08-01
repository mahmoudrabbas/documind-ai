import mongoose, { Schema } from "mongoose";

export interface EntitlementReconciliationResult {
  dimension: string;
  authoritative: number;
  current: number;
  discrepancy: number;
  fixed: boolean;
}

export interface EntitlementReconciliationReportDocument extends mongoose.Document {
  tenantId: mongoose.Types.ObjectId;
  mode: "dry-run" | "execute";
  timestamp: Date;
  periodStart: string;
  periodEnd: string | null;
  results: EntitlementReconciliationResult[];
  totalDiscrepancies: number;
  totalFixed: number;
  createdAt: Date;
}

const entitlementReconciliationReportSchema =
  new Schema<EntitlementReconciliationReportDocument>(
    {
      tenantId: {
        type: Schema.Types.ObjectId,
        ref: "Tenant",
        required: true,
        index: true,
      },
      mode: {
        type: String,
        enum: ["dry-run", "execute"],
        required: true,
        index: true,
      },
      timestamp: { type: Date, required: true, index: true },
      periodStart: { type: String, required: true },
      periodEnd: { type: String, default: null },
      results: {
        type: [
          {
            _id: false,
            dimension: { type: String, required: true },
            authoritative: { type: Number, required: true },
            current: { type: Number, required: true },
            discrepancy: { type: Number, required: true },
            fixed: { type: Boolean, required: true },
          },
        ],
        default: [],
      },
      totalDiscrepancies: { type: Number, required: true, min: 0, default: 0 },
      totalFixed: { type: Number, required: true, min: 0, default: 0 },
    },
    { timestamps: { createdAt: true, updatedAt: false } },
  );

entitlementReconciliationReportSchema.index(
  { tenantId: 1, timestamp: -1 },
  { name: "idx_reconciliation_tenant_timestamp" },
);
entitlementReconciliationReportSchema.index(
  { mode: 1, timestamp: -1 },
  { name: "idx_reconciliation_mode_timestamp" },
);

const EntitlementReconciliationReportModel =
  mongoose.model<EntitlementReconciliationReportDocument>(
    "EntitlementReconciliationReport",
    entitlementReconciliationReportSchema,
    "entitlement_reconciliation_reports",
  );

export default EntitlementReconciliationReportModel;
