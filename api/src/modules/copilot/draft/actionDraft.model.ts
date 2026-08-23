import mongoose, { Schema } from "mongoose";

export interface CopilotActionDraftDocument extends mongoose.Document {
  tenantId: mongoose.Types.ObjectId;
  actorId: mongoose.Types.ObjectId;
  toolName: string;
  utterance: string;
  locale: "en" | "ar";
  /** Partially collected tool input (merged as answers arrive). */
  toolInput: Record<string, unknown>;
  /** The ordered list of fields the draft will ask for (stable for the draft's lifetime). */
  questionFields: string[];
  /** Fields already answered, in order (for the chat transcript). */
  answered: { field: string; value: string }[];
  /** Grant permissions whose scope question was already answered (roles.create
   * incremental loop) — needed because "everything" resolves to an
   * unrestricted grant (no scopes) which is otherwise indistinguishable from
   * an unanswered one. */
  grantScopesResolved: string[];
  /** Failed extraction attempts on the current question. */
  retries: number;
  status: "active" | "completed";
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
}

/**
 * Server-side state for the interactive action-input flow (guider.md §12/§16):
 * when an action plan is missing required parameters, the copilot asks for them
 * one at a time and stores the partial input here until the tool schema is
 * satisfied. TTL-indexed (15 minutes) so abandoned conversations clean up
 * themselves. Tenant + actor scoped so a draft can never be answered across
 * tenants or by a different user.
 */
const copilotActionDraftSchema = new Schema<CopilotActionDraftDocument>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    actorId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    toolName: {
      type: String,
      required: true,
      maxlength: 128,
    },
    utterance: {
      type: String,
      default: "",
      maxlength: 2048,
    },
    locale: {
      type: String,
      enum: ["en", "ar"],
      default: "en",
    },
    toolInput: {
      type: Schema.Types.Mixed,
      default: {},
    },
    questionFields: {
      type: [String],
      required: true,
    },
    answered: {
      type: [
        {
          field: { type: String, required: true },
          value: { type: String, required: true },
        },
      ],
      default: [],
    },
    grantScopesResolved: {
      type: [String],
      default: [],
    },
    retries: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ["active", "completed"],
      default: "active",
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  {
    collection: "copilot_action_drafts",
  },
);

copilotActionDraftSchema.index({ tenantId: 1, actorId: 1 });
copilotActionDraftSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.models.CopilotActionDraft ||
  mongoose.model<CopilotActionDraftDocument>(
    "CopilotActionDraft",
    copilotActionDraftSchema,
  );
