import mongoose, { Schema } from "mongoose";
const usageLogSchema = new Schema({
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    eventType: {
        type: String,
        enum: ["QUESTION_ASKED", "ASSISTANT_RESPONSE", "SYSTEM_EVENT"],
        required: true,
    },
    requestId: { type: String, trim: true },
}, { timestamps: { createdAt: true, updatedAt: false } });
usageLogSchema.index({ tenantId: 1, eventType: 1 });
usageLogSchema.index({ tenantId: 1, requestId: 1 }, {
    unique: true,
    name: "uniq_usage_event_request",
    partialFilterExpression: { requestId: { $type: "string" } },
});
const UsageLogModel = mongoose.model("UsageLog", usageLogSchema);
export default UsageLogModel;
//# sourceMappingURL=usageLog.model.js.map