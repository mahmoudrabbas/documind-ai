/**
 * T25 — RecipientResolver tests (vitest + MongoMemoryReplSet, unique dbName
 * for parallel-worker isolation; skip gracefully when run without MONGODB_URI).
 *
 * 1. Baseline characterization (written first, green on the UNCHANGED code):
 *    pins the pre-T25 explicit-ids resolution — envelope `recipientUserIds`,
 *    `metadata.recipients.userIds` fallback, empty result when no recipient
 *    information exists, actor exclusion.
 * 2. T25 audience resolution (failing-first): departments (employeeProfile.
 *    department name), roles (customRoleId ObjectId), tenantMembers (all ACTIVE
 *    tenant users), explicit-ids precedence over audiences, dedupe across
 *    overlapping audiences, and unknown/empty/malformed audiences → empty
 *    result without crashing.
 *
 * The resolver queries the REAL UserModel (its default Mongo-backed lookup),
 * so the status filter (ACTIVE only) and tenant scoping are exercised for
 * real — the adversarial classes of this todo.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import TenantModel from "../../../db/models/tenant.model.js";
import UserModel from "../../../db/models/user.model.js";
import { RecipientResolver } from "../recipientResolver.js";
import type { NotificationEvent } from "../factory/factory.js";

const hasMongo = Boolean(process.env.MONGODB_URI);

describe.skipIf(!hasMongo)("RecipientResolver (T25)", () => {
  let tenantId = "";
  let connectedByThisFile = false;

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_URI as string, {
        dbName: "recipient-resolver-test",
      });
      connectedByThisFile = true;
    }
    await Promise.all([TenantModel.init(), UserModel.init()]);
  });

  afterAll(async () => {
    if (connectedByThisFile) await mongoose.disconnect();
  });

  beforeEach(async () => {
    await Promise.all([TenantModel.deleteMany({}), UserModel.deleteMany({})]);
    const tenant = await TenantModel.create({
      name: "Acme Corp",
      slug: "acme-corp",
      status: "active",
      plan: "free",
    });
    tenantId = tenant.id;
  });

  /** Minimal event envelope (audiences ride under metadata.recipients). */
  function eventWith(metadata: unknown, actorId?: string): NotificationEvent {
    return { type: "document_uploaded", metadata, ...(actorId ? { actorId } : {}) };
  }

  /** Seed one ACTIVE user in the current tenant; return its string id. */
  async function seedUser(overrides: Record<string, unknown> = {}): Promise<string> {
    const user = await UserModel.create({
      tenantId,
      name: "Seed User",
      email: `${new mongoose.Types.ObjectId().toString()}@example.test`,
      passwordHash: "test",
      role: "EMPLOYEE",
      status: "active",
      emailVerified: true,
      ...overrides,
    });
    return user._id.toString();
  }

  describe("baseline — explicit-ids resolution (pre-T25 behavior)", () => {
    it("returns envelope recipientUserIds as-is and excludes the actor", async () => {
      const resolver = new RecipientResolver();
      const event = {
        ...eventWith({}, "actor-1"),
        recipientUserIds: ["u1", "u2"],
      } as NotificationEvent;

      const { userIds, excludedActors } = await resolver.resolveRecipients(tenantId, event);

      expect(userIds).toEqual(["u1", "u2"]);
      expect(excludedActors).toEqual(["actor-1"]);
    });

    it("falls back to metadata.recipients.userIds when no envelope ids exist", async () => {
      const resolver = new RecipientResolver();
      const event = eventWith({ recipients: { userIds: ["u3", "u4"] } }, "actor-2");

      const { userIds } = await resolver.resolveRecipients(tenantId, event);

      expect(userIds).toEqual(["u3", "u4"]);
    });

    it("resolves to an empty list when the event carries no recipient information", async () => {
      const resolver = new RecipientResolver();
      const event = eventWith({ documentId: "doc-1" });

      const { userIds, excludedActors } = await resolver.resolveRecipients(tenantId, event);

      expect(userIds).toEqual([]);
      expect(excludedActors).toEqual([]);
    });
  });

  describe("T25 audiences — department / role / tenantMembers", () => {
    it("department audience resolves users whose employeeProfile.department matches", async () => {
      const eng = await seedUser({ employeeProfile: { department: "Engineering" } });
      const hr = await seedUser({ employeeProfile: { department: "HR" } });
      await seedUser(); // no employeeProfile → never matches
      await UserModel.create({
        tenantId: new mongoose.Types.ObjectId(), // other tenant — must not leak
        name: "Other Tenant",
        email: `${new mongoose.Types.ObjectId().toString()}@example.test`,
        passwordHash: "test",
        role: "EMPLOYEE",
        status: "active",
        emailVerified: true,
        employeeProfile: { department: "Engineering" },
      });

      const resolver = new RecipientResolver();
      const { userIds } = await resolver.resolveRecipients(
        tenantId,
        eventWith({ recipients: { departments: ["Engineering"] } }),
      );

      expect(userIds.sort()).toEqual([eng].sort());
      expect(userIds).not.toContain(hr);
    });

    it("department audience excludes non-active users", async () => {
      const active = await seedUser({ employeeProfile: { department: "Engineering" } });
      await seedUser({ employeeProfile: { department: "Engineering" }, status: "pending_email_verification" });
      await seedUser({ employeeProfile: { department: "Engineering" }, status: "disabled" });

      const resolver = new RecipientResolver();
      const { userIds } = await resolver.resolveRecipients(
        tenantId,
        eventWith({ recipients: { departments: ["Engineering"] } }),
      );

      expect(userIds).toEqual([active]);
    });

    it("role audience resolves users whose customRoleId matches", async () => {
      const roleA = new mongoose.Types.ObjectId();
      const roleB = new mongoose.Types.ObjectId();
      const a1 = await seedUser({ customRoleId: roleA });
      const a2 = await seedUser({ customRoleId: roleA });
      await seedUser({ customRoleId: roleB });

      const resolver = new RecipientResolver();
      const { userIds } = await resolver.resolveRecipients(
        tenantId,
        eventWith({ recipients: { roles: [roleA.toString()] } }),
      );

      expect(userIds.sort()).toEqual([a1, a2].sort());
    });

    it("tenantMembers resolves all ACTIVE users of the tenant, nothing else", async () => {
      const u1 = await seedUser();
      const u2 = await seedUser({ role: "COMPANY_ADMIN" });
      await seedUser({ status: "pending_email_verification" });
      await seedUser({ status: "disabled" });
      await UserModel.create({
        tenantId: new mongoose.Types.ObjectId(), // other tenant — must not leak
        name: "Other Tenant",
        email: `${new mongoose.Types.ObjectId().toString()}@example.test`,
        passwordHash: "test",
        role: "EMPLOYEE",
        status: "active",
        emailVerified: true,
      });

      const resolver = new RecipientResolver();
      const { userIds } = await resolver.resolveRecipients(
        tenantId,
        eventWith({ recipients: { tenantMembers: true } }),
      );

      expect(userIds.sort()).toEqual([u1, u2].sort());
    });

    it("explicit envelope recipientUserIds take precedence over audiences", async () => {
      const deptUser = await seedUser({ employeeProfile: { department: "Engineering" } });
      const resolver = new RecipientResolver();
      const event = {
        ...eventWith({ recipients: { departments: ["Engineering"] } }),
        recipientUserIds: ["explicit-1"],
      } as NotificationEvent;

      const { userIds } = await resolver.resolveRecipients(tenantId, event);

      expect(userIds).toEqual(["explicit-1"]);
      expect(userIds).not.toContain(deptUser);
    });

    it("metadata.recipients.userIds win over audience selectors on the same object", async () => {
      await seedUser({ employeeProfile: { department: "Engineering" } });
      const resolver = new RecipientResolver();

      const { userIds } = await resolver.resolveRecipients(
        tenantId,
        eventWith({ recipients: { userIds: ["explicit-2"], departments: ["Engineering"] } }),
      );

      expect(userIds).toEqual(["explicit-2"]);
    });

    it("dedupes a user matched by multiple audiences", async () => {
      const roleA = new mongoose.Types.ObjectId();
      const shared = await seedUser({
        employeeProfile: { department: "Engineering" },
        customRoleId: roleA,
      });
      await seedUser({ employeeProfile: { department: "Engineering" } });

      const resolver = new RecipientResolver();
      const { userIds } = await resolver.resolveRecipients(
        tenantId,
        eventWith({ recipients: { departments: ["Engineering"], roles: [roleA.toString()] } }),
      );

      expect(userIds).toHaveLength(2);
      expect(userIds.filter((id) => id === shared)).toHaveLength(1);
    });

    it("unknown / empty / malformed audiences resolve to an empty list without crashing", async () => {
      const resolver = new RecipientResolver();
      const cases: unknown[] = [
        { recipients: { departments: ["NoSuchDepartment"] } },
        { recipients: { departments: [], roles: [] } },
        { recipients: { tenantMembers: false } },
        { recipients: { departments: "Engineering" } }, // not an array
        { recipients: { roles: ["not-an-object-id"] } }, // invalid ObjectId
        { recipients: {} }, // no selectors at all
      ];

      for (const metadata of cases) {
        const { userIds } = await resolver.resolveRecipients(tenantId, eventWith(metadata));
        expect(userIds).toEqual([]);
      }
    });
  });
});
