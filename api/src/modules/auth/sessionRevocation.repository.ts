import mongoose, { type ClientSession } from "mongoose";
import { ACTIVE_REFRESH_SESSION_FILTER } from "./sessionSecurity.js";

export function revokeActiveRefreshSessionsForTenantUser(
  userId: string,
  tenantId: string,
  revokedAt: Date,
  session?: ClientSession,
) {
  return mongoose.connection.collection("refresh_tokens").updateMany(
    {
      tenantId: new mongoose.Types.ObjectId(tenantId),
      userId: new mongoose.Types.ObjectId(userId),
      ...ACTIVE_REFRESH_SESSION_FILTER,
    },
    { $set: { revokedAt } },
    { session },
  );
}
