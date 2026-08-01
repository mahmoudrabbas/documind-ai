/**
 * T25a — invitation_accepted + welcome trigger integration tests.
 *
 * Verifies the API-side producer wiring end-to-end through the shared T10
 * outbox path (publishTrigger → dispatcher → factory → NotificationService):
 *   - setPasswordFromInvite fires EXACTLY ONE invitation_accepted trigger (→
 *     tenant active admins, invitee excluded) + ONE welcome trigger (→ invitee)
 *     ONLY after the status flip succeeds;
 *   - inviteUser alone writes ZERO trigger entries (no premature fire);
 *   - a malformed trigger is visibly rejected by the factory (retry_pending +
 *     DISPATCH_FAILED), never silently dropped;
 *   - a second invitee in the same DB session triggers its own independent
 *     notifications (no stale-state contamination between occurrences).
 *
 * Mirrors the notifications module test conventions (vitest, unique dbName for
 * parallel-worker isolation, skipIf(!MONGODB_URI) like sibling files) and
 * wires the real create port exactly as api/src/server.ts does (T6).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import TenantModel from "../../../db/models/tenant.model.js";
import UserModel from "../../../db/models/user.model.js";
import NotificationModel from "../../../db/models/notification.model.js";
import NotificationOutboxModel from "../../../db/models/notificationOutbox.model.js";
import UserNotificationStateModel from "../../../db/models/userNotificationState.model.js";
import { NotificationService } from "../notifications.service.js";
import { MongoNotificationRepository } from "../repositories/mongo/notification.repository.js";
import { MongoUserNotificationStateRepository } from "../repositories/mongo/userNotificationState.repository.js";
import { RecipientResolver } from "../recipientResolver.js";
import {
  setNotificationCreatePort,
  getNotificationOutboxDispatcher,
  NotificationOutboxDispatcher,
  type NotificationCreatePort,
} from "../outbox/notificationOutbox.dispatcher.js";
import {
  inviteUser,
  setPasswordFromInvite,
} from "../../users/users.service.js";
import { createEmailVerificationTokenForUser } from "../../auth/auth.service.js";
import { USER_INVITATION_PURPOSE } from "../../auth/emailVerificationToken.js";
import type { OutboxTriggerPort } from "../ports/outboxTrigger.port.js";

const hasMongo = Boolean(process.env.MONGODB_URI);

describe.skipIf(!hasMongo)("T25a invitation_accepted + welcome triggers", () => {
  let tenantId = "";
  let adminAId = "";
  let adminBId = "";
  let employeeId = "";
  let notificationService: NotificationService;
  let connectedByThisFile = false;

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_URI as string, {
        dbName: "invitation-accepted-test",
      });
      connectedByThisFile = true;
    }
    await Promise.all([
      TenantModel.init(),
      UserModel.init(),
      NotificationModel.init(),
      NotificationOutboxModel.init(),
      UserNotificationStateModel.init(),
    ]);

    // T6 wiring — mirror of api/src/server.ts so getNotificationOutboxDispatcher()
    // (used by users.service.ts) resolves the real NotificationService.
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

    const [adminA, adminB, employee] = await Promise.all([
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
        name: "Admin B",
        email: "admin-b@example.test",
        passwordHash: "test",
        role: "SUPER_ADMIN",
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
    adminAId = adminA.id;
    adminBId = adminB.id;
    employeeId = employee.id;
  });

  const adminContext = () => ({
    tenantId,
    actorId: adminAId,
    actorEmail: "admin-a@example.test",
    actorRole: "COMPANY_ADMIN" as const,
  });

  /** Dispatch the outbox entries the producer wrote, through the REAL
   *  NotificationService.create fan-out, but with a no-op enqueue port —
   *  avoids a BullMQ/Redis dependency (Redis is not available in unit-test
   *  runs; outbox.test.ts does the same with a fake queue). */
  async function dispatchOutboxEntries(tenant: string): Promise<void> {
    const createPort: NotificationCreatePort = {
      create: (t, draft, recipientUserIds) =>
        notificationService.create(t, draft, recipientUserIds),
    };
    const dispatcher = new NotificationOutboxDispatcher(createPort, {
      async enqueueDispatch() {
        /* no-op — delivery enqueue is T11's surface, not asserted here */
      },
    });
    await dispatcher.dispatchPending(tenant);
  }

  /** Real invite flow → pending invitee + persisted token hash. */
  async function inviteAndFetchToken(name: string, email: string) {
    const invite = await inviteUser(
      { name, email, role: "EMPLOYEE" },
      adminContext(),
    );
    const invitee = await UserModel.findById(invite.user.id).exec();
    if (!invitee) throw new Error(`invitee not found for ${email}`);
    const token = await createEmailVerificationTokenForUser(invitee, {
      purpose: USER_INVITATION_PURPOSE,
    });
    return { invitee, token };
  }

  it("inviteUser alone writes ZERO trigger entries (no premature fire)", async () => {
    await inviteUser(
      { name: "Sara Ali", email: "sara@example.test", role: "EMPLOYEE" },
      adminContext(),
    );

    expect(await NotificationOutboxModel.countDocuments({ tenantId })).toBe(0);
    expect(await NotificationModel.countDocuments({ tenantId })).toBe(0);
  });

  it("setPasswordFromInvite fires exactly one invitation_accepted + one welcome; invitee excluded from admins", async () => {
    const { invitee, token } = await inviteAndFetchToken(
      "Sara Ali",
      "sara@example.test",
    );
    const inviteeId = invitee._id.toString();

    const result = await setPasswordFromInvite({
      token,
      password: "Password123!",
    });
    expect(result.user.status).toBe("active");

    // Exactly one trigger entry per emission, both with the invitee as actor.
    const entries = await NotificationOutboxModel.find({ tenantId })
      .lean()
      .exec();
    expect(entries).toHaveLength(2);
    const invitation = entries.find((e) => e.notificationType === "invitation_accepted");
    const welcome = entries.find((e) => e.notificationType === "welcome");
    expect(invitation).toBeDefined();
    expect(welcome).toBeDefined();

    expect(invitation!.actorId.toString()).toBe(inviteeId);
    expect(invitation!.kind).toBe("trigger");
    expect(String(invitation!.dedupKey)).toContain(`invitation_accepted:${inviteeId}:`);
    const invPayload = invitation!.payload as {
      recipientUserIds?: string[];
      metadata?: { inviteeUserId?: string; inviteeName?: string };
      source?: { type?: string; id?: string };
    };
    // Both active admins, employee excluded, invitee excluded.
    expect(invPayload.recipientUserIds?.sort()).toEqual([adminAId, adminBId].sort());
    expect(invPayload.recipientUserIds).not.toContain(employeeId);
    expect(invPayload.recipientUserIds).not.toContain(inviteeId);
    expect(invPayload.metadata?.inviteeUserId).toBe(inviteeId);
    expect(invPayload.metadata?.inviteeName).toBe("Sara Ali");
    expect(invPayload.source?.id).toBe(inviteeId);

    expect(welcome!.actorId.toString()).toBe(inviteeId);
    expect(welcome!.kind).toBe("trigger");
    expect(String(welcome!.dedupKey)).toContain(`welcome:${inviteeId}:`);
    const welPayload = welcome!.payload as {
      recipientUserIds?: string[];
      metadata?: { companyName?: string };
    };
    expect(welPayload.recipientUserIds).toEqual([inviteeId]);
    expect(welPayload.metadata?.companyName).toBe("Acme Corp");

    // Dispatch the real outbox → factory → service.create fan-out.
    await dispatchOutboxEntries(tenantId);

    const notifications = await NotificationModel.find({ tenantId }).lean().exec();
    // 2 invitation_accepted (admins) + 1 welcome (invitee).
    expect(notifications).toHaveLength(3);
    const invDocs = notifications.filter((n) => n.type === "invitation_accepted");
    const welDocs = notifications.filter((n) => n.type === "welcome");
    expect(invDocs.map((n) => n.userId.toString()).sort()).toEqual(
      [adminAId, adminBId].sort(),
    );
    expect(welDocs.map((n) => n.userId.toString())).toEqual([inviteeId]);
    for (const doc of [...invDocs, ...welDocs]) {
      expect(doc.dedupEventId).toBe(inviteeId);
      expect(doc.category).toBe("workflow");
    }
    expect(invDocs.every((n) => n.priority === "normal")).toBe(true);
    expect(welDocs.every((n) => n.priority === "low")).toBe(true);
  });

  it("a malformed trigger is visibly rejected (retry_pending + DISPATCH_FAILED), never silent", async () => {
    const port: OutboxTriggerPort = getNotificationOutboxDispatcher();
    // Missing inviteeName → strict zod metadata schema throws at the factory.
    await port.publishTrigger({
      eventId: randomUUID(),
      type: "invitation_accepted",
      tenantId,
      actorId: adminAId,
      recipientUserIds: [adminBId],
      payload: {
        metadata: { inviteeUserId: adminAId },
        dedupEventId: adminAId,
        actorId: adminAId,
      },
    });

    await dispatchOutboxEntries(tenantId);

    const entry = await NotificationOutboxModel.findOne({ tenantId }).lean().exec();
    expect(entry).not.toBeNull();
    expect(entry!.state).toBe("retry_pending");
    expect(entry!.failureCode).toBe("DISPATCH_FAILED");
    // No partial notification leaked.
    expect(await NotificationModel.countDocuments({ tenantId })).toBe(0);
  });

  it("a second invitee triggers its own independent notifications (no stale state)", async () => {
    const first = await inviteAndFetchToken("First User", "first@example.test");
    await setPasswordFromInvite({ token: first.token, password: "Password123!" });

    const second = await inviteAndFetchToken("Second User", "second@example.test");
    await setPasswordFromInvite({ token: second.token, password: "Password123!" });

    const entries = await NotificationOutboxModel.find({ tenantId }).lean().exec();
    expect(entries).toHaveLength(4); // 2 per invitee.

    await dispatchOutboxEntries(tenantId);
    const notifications = await NotificationModel.find({ tenantId }).lean().exec();
    expect(notifications).toHaveLength(6); // (2 admins + 1 self) × 2 invitees.

    const firstId = first.invitee._id.toString();
    const secondId = second.invitee._id.toString();
    expect(
      notifications.filter((n) => n.dedupEventId === firstId),
    ).toHaveLength(3);
    expect(
      notifications.filter((n) => n.dedupEventId === secondId),
    ).toHaveLength(3);
  });
});
