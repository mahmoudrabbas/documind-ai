import mongoose, { Schema } from "mongoose";

export type OcrQuotaReservationStatus =
  | "active"
  | "committed"
  | "released";

export interface OcrQuotaReservationDocument extends mongoose.Document {
  tenantId: mongoose.Types.ObjectId;
  reservationId: string;
  requestId: string | null;
  dimension: "ocrPagesPerMonth";
  periodStart: string;
  reservedAmount: number;
  actualAmount: number | null;
  status: OcrQuotaReservationStatus;
  expiresAt: Date;
  settledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<OcrQuotaReservationDocument>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    reservationId: {
      type: String,
      required: true,
      trim: true,
    },
    requestId: {
      type: String,
      default: null,
      trim: true,
    },
    dimension: {
      type: String,
      enum: ["ocrPagesPerMonth"],
      required: true,
      default: "ocrPagesPerMonth",
    },
    periodStart: {
      type: String,
      required: true,
    },
    reservedAmount: {
      type: Number,
      required: true,
      min: 1,
    },
    actualAmount: {
      type: Number,
      default: null,
      min: 0,
    },
    status: {
      type: String,
      enum: ["active", "committed", "released"],
      required: true,
      default: "active",
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    settledAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

schema.index(
  { reservationId: 1 },
  { unique: true, name: "uniq_ocr_quota_reservation_id" },
);

schema.index(
  { tenantId: 1, requestId: 1 },
  {
    unique: true,
    name: "uniq_ocr_quota_reservation_request",
    partialFilterExpression: {
      requestId: { $type: "string" },
    },
  },
);

schema.index(
  { status: 1, expiresAt: 1 },
  { name: "ocr_quota_active_expiry" },
);

const OcrQuotaReservationModel =
  mongoose.model<OcrQuotaReservationDocument>(
    "OcrQuotaReservation",
    schema,
  );

export default OcrQuotaReservationModel;
