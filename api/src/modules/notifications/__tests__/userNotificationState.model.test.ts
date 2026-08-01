import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "vitest";
import mongoose from "mongoose";
import UserNotificationStateModel from "../../../db/models/userNotificationState.model.js";

// The harness (scripts/run-api-tests.mjs) sets MONGODB_URI from a
// MongoMemoryReplSet. When the file is run directly without the harness,
// skip the suite gracefully instead of connecting to nothing.
const hasMongo = Boolean(process.env.MONGODB_URI);

describe.skipIf(!hasMongo)("UserNotificationStateModel", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!, {
      dbName: "user-notification-state-test",
    });
    // Ensure the unique {tenantId, userId} index exists before the dup test.
    await UserNotificationStateModel.init();
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await UserNotificationStateModel.deleteMany({});
  });

  it("creates two distinct states for two users in the same tenant", async () => {
    const tenantId = new mongoose.Types.ObjectId();
    const [first, second] = await UserNotificationStateModel.create([
      { tenantId, userId: new mongoose.Types.ObjectId() },
      { tenantId, userId: new mongoose.Types.ObjectId() },
    ]);

    expect(first._id).not.toEqual(second._id);
    expect(first.unreadCount).toBe(0);
    expect(second.unreadCount).toBe(0);
    expect(await UserNotificationStateModel.countDocuments({ tenantId })).toBe(2);
  });

  it("rejects a duplicate {tenantId, userId} with E11000", async () => {
    const tenantId = new mongoose.Types.ObjectId();
    const userId = new mongoose.Types.ObjectId();

    await UserNotificationStateModel.create({ tenantId, userId });

    await expect(
      UserNotificationStateModel.create({ tenantId, userId }),
    ).rejects.toMatchObject({ code: 11000 });
  });

  it("increments unreadCount atomically via $inc", async () => {
    const state = await UserNotificationStateModel.create({
      tenantId: new mongoose.Types.ObjectId(),
      userId: new mongoose.Types.ObjectId(),
    });

    // Two concurrent atomic $inc on the same doc — both must land (final 2),
    // proving the counter is incremented atomically, not read-modify-write.
    await Promise.all([
      UserNotificationStateModel.findOneAndUpdate(
        { _id: state._id },
        { $inc: { unreadCount: 1 } },
      ),
      UserNotificationStateModel.findOneAndUpdate(
        { _id: state._id },
        { $inc: { unreadCount: 1 } },
      ),
    ]);

    const fresh = await UserNotificationStateModel.findById(state._id);
    expect(fresh?.unreadCount).toBe(2);
  });

  it("round-trips mutedTypes (default [], set, read back)", async () => {
    const state = await UserNotificationStateModel.create({
      tenantId: new mongoose.Types.ObjectId(),
      userId: new mongoose.Types.ObjectId(),
    });
    expect(state.mutedTypes).toEqual([]);

    state.mutedTypes = ["processing_failed"];
    await state.save();

    const fresh = await UserNotificationStateModel.findById(state._id);
    expect(fresh?.mutedTypes).toEqual(["processing_failed"]);
  });
});
