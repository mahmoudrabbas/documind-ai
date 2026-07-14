import { Types } from "mongoose";
export interface RecordQuestionAskedInput {
    tenantId: string;
    requestId?: string;
}
export declare function recordQuestionAsked(input: RecordQuestionAskedInput): Promise<import("mongoose").Document<unknown, {}, import("../../db/models/usageLog.model.js").UsageLogDocument, {}, import("mongoose").DefaultSchemaOptions> & import("../../db/models/usageLog.model.js").UsageLogDocument & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
} & {
    id: string;
}>;
//# sourceMappingURL=usage.service.d.ts.map