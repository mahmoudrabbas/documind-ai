import mongoose, { type ClientSession } from "mongoose";
import UserModel from "../../db/models/user.model.js";
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

/**
 * Revokes every active refresh session for the user except the one identified
 * by `excludeJtiHash` (the current device) and bumps the user's session
 * version, atomically.
 *
 * The version bump is what makes already-issued access tokens from other
 * sessions fail `authenticate` on their next request. The current session's
 * refresh token survives so this device stays signed in.
 */
export async function revokeOtherRefreshSessionsForTenantUser(
  userId: string,
  tenantId: string,
  excludeJtiHash: string | undefined,
  nextSessionVersion: number,
  revokedAt: Date,
) {
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      const filter: Record<string, unknown> = {
        tenantId: new mongoose.Types.ObjectId(tenantId),
        userId: new mongoose.Types.ObjectId(userId),
        ...ACTIVE_REFRESH_SESSION_FILTER,
      };

      if (excludeJtiHash) {
        filter.jtiHash = { $ne: excludeJtiHash };
      }

      await mongoose.connection
        .collection("refresh_tokens")
        .updateMany(filter, { $set: { revokedAt } }, { session });

      const userUpdate = await UserModel.updateOne(
        {
          _id: new mongoose.Types.ObjectId(userId),
          tenantId: new mongoose.Types.ObjectId(tenantId),
        },
        { $set: { sessionVersion: nextSessionVersion } },
        { session },
      ).exec();

      if (userUpdate.matchedCount !== 1) {
        throw new Error("USER_NOT_FOUND_DURING_SESSION_REVOCATION");
      }
    });
  } finally {
    await session.endSession();
  }
}
