import { Types } from "mongoose";
import UsageLogModel from "../../db/models/usageLog.model.js";
export async function recordQuestionAsked(input) {
    if (!Types.ObjectId.isValid(input.tenantId)) {
        throw new Error("tenantId must be a valid ObjectId");
    }
    const requestId = input.requestId?.trim();
    if (input.requestId !== undefined && !requestId) {
        throw new Error("requestId must be a non-empty string when provided");
    }
    if (!requestId) {
        return UsageLogModel.create({
            tenantId: input.tenantId,
            eventType: "QUESTION_ASKED",
        });
    }
    return UsageLogModel.findOneAndUpdate({ tenantId: input.tenantId, requestId }, {
        $setOnInsert: {
            tenantId: input.tenantId,
            requestId,
            eventType: "QUESTION_ASKED",
        },
    }, { upsert: true, returnDocument: "after", runValidators: true });
}
//# sourceMappingURL=usage.service.js.map