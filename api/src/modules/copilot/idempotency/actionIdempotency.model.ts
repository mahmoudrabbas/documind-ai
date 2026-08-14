import mongoose, { Schema } from "mongoose";

export interface CopilotActionIdempotencyDocument extends mongoose.Document {
  tenantId: mongoose.Types.ObjectId;
  actorId: mongoose.Types.ObjectId;
  idempotencyKey: string;
  runId: string;
  createdAt: Date;
}

/**
 * Maps a client `Idempotency-Key` (POST /copilot/action) to the supervisor run
 * it created, so a duplicate request no-ops and returns the original result
 * instead of launching a second run/approval (guider.md §14/§16).
 *
 * The unique compound index is the authoritative guard: if two requests race,
 * the second insert fails with E11000 and the caller falls back to reading the
 * winning mapping.
 */
const copilotActionIdempotencySchema = new Schema<CopilotActionIdempotencyDocument>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    actorId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    idempotencyKey: {
      type: String,
      required: true,
    },
    runId: {
      type: String,
      required: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    collection: "copilot_action_idempotency",
  },
);

copilotActionIdempotencySchema.index(
  { tenantId: 1, actorId: 1, idempotencyKey: 1 },
  { unique: true },
);

export default mongoose.models.CopilotActionIdempotency ||
  mongoose.model<CopilotActionIdempotencyDocument>(
    "CopilotActionIdempotency",
    copilotActionIdempotencySchema,
  );
