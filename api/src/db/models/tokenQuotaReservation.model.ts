import mongoose, { Schema } from "mongoose";

export type TokenQuotaReservationStatus =
  | "active"
  | "committed"
  | "released";

export interface TokenQuotaReservationDocument extends mongoose.Document {
  tenantId: mongoose.Types.ObjectId;
  reservationId: string;
  requestId: string | null;
  dimension: "tokensPerMonth";
  periodStart: string;
  reservedAmount: number;
  actualAmount: number | null;
  status: TokenQuotaReservationStatus;
  expiresAt: Date;
  settledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const tokenQuotaReservationSchema =
  new Schema<TokenQuotaReservationDocument>(
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
        enum: ["tokensPerMonth"],
        required: true,
        default: "tokensPerMonth",
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

tokenQuotaReservationSchema.index(
  { reservationId: 1 },
  { unique: true, name: "uniq_token_quota_reservation_id" },
);

tokenQuotaReservationSchema.index(
  { tenantId: 1, requestId: 1 },
  {
    unique: true,
    name: "uniq_token_quota_reservation_request",
    partialFilterExpression: {
      requestId: { $type: "string" },
    },
  },
);

tokenQuotaReservationSchema.index(
  { status: 1, expiresAt: 1 },
  { name: "token_quota_active_expiry" },
);

const TokenQuotaReservationModel =
  mongoose.model<TokenQuotaReservationDocument>(
    "TokenQuotaReservation",
    tokenQuotaReservationSchema,
  );

export default TokenQuotaReservationModel;
