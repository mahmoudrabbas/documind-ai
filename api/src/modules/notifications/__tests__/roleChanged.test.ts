/**
 * T25b — role_changed trigger producer integration tests.
 *
 * Verifies the API-side producer wiring end-to-end through the shared T10
 * outbox path (publishTrigger → dispatcher → factory → NotificationService)
 * across all four role-mutation hook points, exactly as wired in
 * users.service.ts updateUser + roles.service.ts assignRole /
 * removeRoleAssignment / migrateRoleUsers:
 *   1. updateUser base-role change  → ONE entry, action "changed";
 *   2. assignRole                   → ONE entry, action "assigned";
 *   3. assign→remove within 24h     → ONE notification after dispatch
 *      (role_changed is replace-rule dedup on dedupEventId = target userId);
 *   4. migrateRoleUsers (3 users)   → ONE entry per affected ACTIVE user;
 *   5. pending_email_verification targets are NEVER notified (all hooks);
 *   6. exactly one outbox entry per emission; idempotent assign adds none.
 *
 * Mirrors invitationAccepted.test.ts (vitest, unique dbName for
 * parallel-worker isolation, skipIf(!MONGODB_URI), real create port wired as
 * api/src/server.ts does).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import TenantModel from "../../../db/models/tenant.model.js";
import UserModel from "../../../db/models/user.model.js";
import RoleModel from "../../../db/models/role.model.js";
import NotificationModel from "../../../db/models/notification.model.js";
import NotificationOutboxModel from "../../../db/models/notificationOutbox.model.js";
import UserNotificationStateModel from "../../../db/models/userNotificationState.model.js";
import { NotificationService } from "../notifications.service.js";
import { MongoNotificationRepository } from "../repositories/mongo/notification.repository.js";
import { MongoUserNotificationStateRepository } from "../repositories/mongo/userNotificationState.repository.js";
import { RecipientResolver } from "../recipientResolver.js";
import {
  setNotificationCreatePort,
  NotificationOutboxDispatcher,
  type NotificationCreatePort,
} from "../outbox/notificationOutbox.dispatcher.js";
import {
  assignRole,
  createRole,
  migrateRoleUsers,
  removeRoleAssignment,
  type RoleOperationContext,
} from "../../roles/roles.service.js";
import { updateUser } from "../../users/users.service.js";

const hasMongo = Boolean(process.env.MONGODB_URI);

describe.skipIf(!hasMongo)("T25b role_changed triggers", () => {
  let tenantId = "";
  let adminId = "";
  let employeeId = "";
  let notificationService: NotificationService;
  let connectedByThisFile = false;

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_URI as string, {
        dbName: "role-changed-test",
      });
      connectedByThisFile = true;
    }
    await Promise.all([
      TenantModel.init(),
      UserModel.init(),
      RoleModel.init(),
      NotificationModel.init(),
      NotificationOutboxModel.init(),
      UserNotificationStateModel.init(),
    ]);

    notificationService = new NotificationService(
      new MongoNotificationRepository(),
      new MongoUserNotificationStateRepository(),
      new RecipientResolver(),
    );
    setNotificationCreatePort({
      create: (t, draft, recipientUserIds) =>
        notificationService.create(t, draft, recipientUserIds),
    });
  });

  afterAll(async () => {
    if (connectedByThisFile) await mongoose.disconnect();
  });

  beforeEach(async () => {
    await Promise.all([
      TenantModel.deleteMany({}),
      UserModel.deleteMany({}),
      RoleModel.deleteMany({}),
      NotificationModel.deleteMany({}),
      NotificationOutboxModel.deleteMany({}),
      UserNotificationStateModel.deleteMany({}),
    ]);

    const tenant = await TenantModel.create({
      name: "Acme Corp",
      slug: "acme-corp",
      status: "active",
      plan: "free",
    });
    tenantId = tenant.id;

    const [admin, employee] = await Promise.all([
      UserModel.create({
        tenantId: tenant._id,
        name: "Admin A",
        email: "admin-a@example.test",
        passwordHash: "test",
        role: "COMPANY_ADMIN",
        status: "active",
        emailVerified: true,
      }),
      UserModel.create({
        tenantId: tenant._id,
        name: "Employee E",
        email: "employee-e@example.test",
        passwordHash: "test",
        role: "EMPLOYEE",
        status: "active",
        emailVerified: true,
      }),
    ]);
    adminId = admin.id;
    employeeId = employee.id;
  });

  const adminContext = (): RoleOperationContext => ({
    tenantId,
    actorId: adminId,
    actorEmail: "admin-a@example.test",
    actorRole: "COMPANY_ADMIN",
    traceId: "trace-role-changed",
    requestId: "request-role-changed",
  });

  /** Dispatch the outbox entries the producer wrote, through the REAL
   *  NotificationService.create fan-out, with a no-op enqueue port (Redis is
   *  not available in unit-test runs — same as invitationAccepted.test.ts). */
  async function dispatchOutboxEntries(tenant: string): Promise<void> {
    const createPort: NotificationCreatePort = {
      create: (t, draft, recipientUserIds) =>
        notificationService.create(t, draft, recipientUserIds),
    };
    const dispatcher = new NotificationOutboxDispatcher(createPort, {
      async enqueueDispatch() {},
    });
    await dispatcher.dispatchPending(tenant);
  }

  it("updateUser base-role change fires exactly one role_changed trigger (changed)", async () => {
    await updateUser({ role: "COMPANY_ADMIN" }, adminContext(), employeeId);

    const entries = await NotificationOutboxModel.find({ tenantId }).lean().exec();
    expect(entries).toHaveLength(1);
    const entry = entries[0]!;
    expect(entry.notificationType).toBe("role_changed");
    expect(entry.kind).toBe("trigger");
    expect(String(entry.dedupKey)).toContain(`role_changed:${employeeId}:`);
    expect(entry.actorId.toString()).toBe(adminId);
    const payload = entry.payload as {
      recipientUserIds?: string[];
      dedupEventId?: string;
      metadata?: Record<string, string>;
      source?: { type?: string; id?: string; displayName?: string };
    };
    expect(payload.recipientUserIds).toEqual([employeeId]);
    expect(payload.dedupEventId).toBe(employeeId);
    expect(payload.metadata).toEqual({
      roleType: "base",
      action: "changed",
      roleName: "COMPANY_ADMIN",
      beforeRole: "EMPLOYEE",
      afterRole: "COMPANY_ADMIN",
    });
    expect(payload.source).toEqual({
      type: "role",
      id: "COMPANY_ADMIN",
      displayName: "COMPANY_ADMIN",
    });

    await dispatchOutboxEntries(tenantId);
    const notifications = await NotificationModel.find({ tenantId }).lean().exec();
    expect(notifications).toHaveLength(1);
    expect(notifications[0]!.type).toBe("role_changed");
    expect(notifications[0]!.userId.toString()).toBe(employeeId);
    expect(notifications[0]!.dedupEventId).toBe(employeeId);
    expect(notifications[0]!.category).toBe("workflow");
    expect(notifications[0]!.priority).toBe("normal");
  });

  it("assignRole fires exactly one role_changed trigger (assigned)", async () => {
    const role = await createRole(
      { name: "HR Manager", baseRole: "EMPLOYEE", grants: [] },
      adminContext(),
    );

    const result = await assignRole(
      { userId: employeeId, roleVersion: role.role.version },
      adminContext(),
      role.role.id,
    );
    expect(result.changed).toBe(true);

    const entries = await NotificationOutboxModel.find({ tenantId }).lean().exec();
    expect(entries).toHaveLength(1);
    const payload = entries[0]!.payload as {
      recipientUserIds?: string[];
      dedupEventId?: string;
      metadata?: Record<string, string>;
      source?: { type?: string; id?: string; displayName?: string };
    };
    expect(payload.metadata).toEqual({
      roleType: "custom",
      action: "assigned",
      roleName: "HR Manager",
    });
    expect(payload.recipientUserIds).toEqual([employeeId]);
    expect(payload.dedupEventId).toBe(employeeId);
    expect(payload.source).toEqual({
      type: "role",
      id: role.role.id,
      displayName: "HR Manager",
    });

    await dispatchOutboxEntries(tenantId);
    expect(await NotificationModel.countDocuments({ tenantId })).toBe(1);
  });

  it("assign then remove within 24h dedups to exactly ONE notification", async () => {
    const role = await createRole(
      { name: "HR Manager", baseRole: "EMPLOYEE", grants: [] },
      adminContext(),
    );
    await assignRole(
      { userId: employeeId, roleVersion: role.role.version },
      adminContext(),
      role.role.id,
    );
    await removeRoleAssignment(
      { userId: employeeId, roleVersion: role.role.version },
      adminContext(),
      role.role.id,
    );

    const entries = await NotificationOutboxModel.find({ tenantId }).lean().exec();
    expect(entries).toHaveLength(2);
    const actions = entries
      .map((e) => (e.payload as { metadata?: { action?: string } }).metadata?.action)
      .sort();
    expect(actions).toEqual(["assigned", "removed"]);

    await dispatchOutboxEntries(tenantId);
    const notifications = await NotificationModel.find({ tenantId }).lean().exec();
    expect(notifications).toHaveLength(1);
    expect(notifications[0]!.dedupEventId).toBe(employeeId);
  });

  it("migrateRoleUsers fires one trigger per affected ACTIVE user (migrated)", async () => {
    const source = await createRole(
      { name: "Source Role", baseRole: "EMPLOYEE", grants: [] },
      adminContext(),
    );
    const destination = await createRole(
      { name: "Destination Role", baseRole: "EMPLOYEE", grants: [] },
      adminContext(),
    );
    const [second, third] = await Promise.all([
      UserModel.create({
        tenantId,
        name: "Second",
        email: "second@example.test",
        passwordHash: "test",
        role: "EMPLOYEE",
        status: "active",
        emailVerified: true,
        customRoleId: source.role.id,
      }),
      UserModel.create({
        tenantId,
        name: "Third",
        email: "third@example.test",
        passwordHash: "test",
        role: "EMPLOYEE",
        status: "active",
        emailVerified: true,
        customRoleId: source.role.id,
      }),
    ]);
    await UserModel.updateOne(
      { _id: employeeId },
      { $set: { customRoleId: source.role.id } },
    ).exec();

    const migrated = await migrateRoleUsers(
      {
        destinationRoleId: destination.role.id,
        sourceVersion: source.role.version,
        destinationVersion: destination.role.version,
      },
      adminContext(),
      source.role.id,
    );
    expect(migrated.affected).toBe(3);

    const entries = await NotificationOutboxModel.find({ tenantId }).lean().exec();
    expect(entries).toHaveLength(3);
    for (const entry of entries) {
      const payload = entry.payload as {
        recipientUserIds?: string[];
        metadata?: Record<string, string>;
        source?: { id?: string };
      };
      expect(payload.metadata?.roleType).toBe("custom");
      expect(payload.metadata?.action).toBe("migrated");
      expect(payload.metadata?.roleName).toBe("Destination Role");
      expect(payload.metadata?.afterRole).toBe("Destination Role");
      expect(payload.recipientUserIds).toHaveLength(1);
      expect(payload.source?.id).toBe(destination.role.id);
    }
    expect(
      entries
        .map((e) => (e.payload as { dedupEventId?: string }).dedupEventId)
        .sort(),
    ).toEqual([employeeId, second.id, third.id].sort());

    await dispatchOutboxEntries(tenantId);
    expect(await NotificationModel.countDocuments({ tenantId })).toBe(3);
  });

  it("never emits role_changed for pending_email_verification targets", async () => {
    const pendingForAssign = await UserModel.create({
      tenantId,
      name: "Pending Assign",
      email: "pending-assign@example.test",
      passwordHash: "test",
      role: "EMPLOYEE",
      status: "pending_email_verification",
      emailVerified: false,
    });

    const role = await createRole(
      { name: "HR Manager", baseRole: "EMPLOYEE", grants: [] },
      adminContext(),
    );
    const assigned = await assignRole(
      { userId: pendingForAssign.id, roleVersion: role.role.version },
      adminContext(),
      role.role.id,
    );
    expect(assigned.changed).toBe(true);
    expect(await NotificationOutboxModel.countDocuments({ tenantId })).toBe(0);

    const pendingForUpdate = await UserModel.create({
      tenantId,
      name: "Pending Update",
      email: "pending-update@example.test",
      passwordHash: "test",
      role: "EMPLOYEE",
      status: "pending_email_verification",
      emailVerified: false,
    });
    await updateUser(
      { role: "COMPANY_ADMIN" },
      adminContext(),
      pendingForUpdate.id,
    );
    expect(await NotificationOutboxModel.countDocuments({ tenantId })).toBe(0);

    const source = await createRole(
      { name: "Source Role", baseRole: "EMPLOYEE", grants: [] },
      adminContext(),
    );
    const destination = await createRole(
      { name: "Destination Role", baseRole: "EMPLOYEE", grants: [] },
      adminContext(),
    );
    const pendingForMigrate = await UserModel.create({
      tenantId,
      name: "Pending Migrate",
      email: "pending-migrate@example.test",
      passwordHash: "test",
      role: "EMPLOYEE",
      status: "pending_email_verification",
      emailVerified: false,
      customRoleId: source.role.id,
    });
    await UserModel.updateOne(
      { _id: employeeId },
      { $set: { customRoleId: source.role.id } },
    ).exec();

    const migrated = await migrateRoleUsers(
      {
        destinationRoleId: destination.role.id,
        sourceVersion: source.role.version,
        destinationVersion: destination.role.version,
      },
      adminContext(),
      source.role.id,
    );
    expect(migrated.affected).toBe(2);

    const entries = await NotificationOutboxModel.find({ tenantId }).lean().exec();
    expect(entries).toHaveLength(1);
    expect(
      entries[0]!.payload as { dedupEventId?: string },
    ).toBeDefined();
    expect(
      (entries[0]!.payload as { dedupEventId?: string }).dedupEventId,
    ).toBe(employeeId);
    // The pending user's role WAS migrated (counted in affected) but it must
    // never receive an outbox entry.
    expect(
      entries.some(
        (e) =>
          (e.payload as { dedupEventId?: string }).dedupEventId ===
          pendingForMigrate.id,
      ),
    ).toBe(false);
    expect(await NotificationModel.countDocuments({ tenantId })).toBe(0);
  });

  it("writes exactly one outbox entry per emission; idempotent assign adds none", async () => {
    const role = await createRole(
      { name: "HR Manager", baseRole: "EMPLOYEE", grants: [] },
      adminContext(),
    );
    await assignRole(
      { userId: employeeId, roleVersion: role.role.version },
      adminContext(),
      role.role.id,
    );
    expect(await NotificationOutboxModel.countDocuments({ tenantId })).toBe(1);

    const repeated = await assignRole(
      { userId: employeeId, roleVersion: role.role.version },
      adminContext(),
      role.role.id,
    );
    expect(repeated.changed).toBe(false);
    expect(await NotificationOutboxModel.countDocuments({ tenantId })).toBe(1);

    await removeRoleAssignment(
      { userId: employeeId, roleVersion: role.role.version },
      adminContext(),
      role.role.id,
    );
    expect(await NotificationOutboxModel.countDocuments({ tenantId })).toBe(2);
  });
});
