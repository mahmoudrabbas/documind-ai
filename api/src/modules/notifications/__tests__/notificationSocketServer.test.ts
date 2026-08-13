/**
 * T15 — Notification socket server acceptance (real socket.io server +
 * socket.io-client, MongoMemoryReplSet).
 *
 * Boots a REAL socket.io server attached to a bare node:http server on an
 * ephemeral port (0), then connects real socket.io-client sockets against it.
 * The user handshake mirrors authenticate.middleware.ts (verifyJwt +
 * type/sub/tenantId/isBaseRole/sessionVersion vs UserModel), so a real
 * UserModel row in MongoMemoryReplSet is required for the user paths.
 *
 * Runs under vitest (imports from "vitest"); skips gracefully when run
 * without MONGODB_URI. Every client/server is torn down in teardown hooks.
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  afterEach,
  beforeEach,
} from "vitest";
import mongoose from "mongoose";
import { createServer as createHttpServer } from "node:http";
import type { Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { io as ioClient, type Socket as ClientSocket } from "socket.io-client";
import TenantModel from "../../../db/models/tenant.model.js";
import UserModel from "../../../db/models/user.model.js";
import NotificationModel from "../../../db/models/notification.model.js";
import { config } from "../../../config/index.js";
import { signJwt } from "../../auth/jwtTokens.js";
import {
  createSocketServer,
  type NotificationSocketServerHandle,
} from "../socket/notificationSocketServer.js";

const hasMongo = Boolean(process.env.MONGODB_URI);

interface DeliverAck {
  ok: boolean;
  errorCategory?: string;
}

describe.skipIf(!hasMongo)("notificationSocketServer (T15)", () => {
  let httpServer: HttpServer;
  let socketServer: NotificationSocketServerHandle;
  let port: number;
  let connectedByThisFile = false;

  let tenantId = "";
  let userId = "";
  const clients: ClientSocket[] = [];

  function userToken(
    overrides: Record<string, unknown> = {},
    expiresIn = "15m",
  ): string {
    return signJwt(
      { sub: userId, tenantId, type: "access", role: "EMPLOYEE", ...overrides },
      config.JWT_SECRET,
      expiresIn,
    );
  }

  function connectSocket(token: string): ClientSocket {
    const socket = ioClient(`http://127.0.0.1:${port}`, {
      auth: { token },
      transports: ["websocket"],
      reconnection: false,
      forceNew: true,
      timeout: 3000,
    });
    clients.push(socket);
    return socket;
  }

  async function onConnected(socket: ClientSocket): Promise<void> {
    if (socket.connected) return;
    await new Promise<void>((resolve, reject) => {
      socket.once("connect", () => resolve());
      socket.once("connect_error", (err: Error) => reject(err));
    });
  }

  async function onConnectError(socket: ClientSocket): Promise<Error> {
    return new Promise<Error>((resolve, reject) => {
      socket.once("connect_error", (err: Error) => resolve(err));
      socket.once("connect", () =>
        reject(new Error("Expected handshake to be rejected but it succeeded")),
      );
    });
  }

  function waitForEvent<T = unknown>(
    socket: ClientSocket,
    event: string,
    timeoutMs = 3000,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Timed out waiting for event "${event}"`)),
        timeoutMs,
      );
      socket.once(event, (payload: T) => {
        clearTimeout(timer);
        resolve(payload);
      });
    });
  }

  async function expectNoEvent(
    socket: ClientSocket,
    event: string,
    waitMs = 250,
  ): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        socket.off(event, onEvent);
        resolve();
      }, waitMs);
      const onEvent = () => {
        clearTimeout(timer);
        reject(new Error(`Unexpectedly received "${event}"`));
      };
      socket.once(event, onEvent);
    });
  }

  function emitDeliver(
    socket: ClientSocket,
    payload: unknown,
  ): Promise<DeliverAck> {
    return new Promise<DeliverAck>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Timed out waiting for notification:deliver ack")),
        3000,
      );
      socket.emit("notification:deliver", payload, (ack: DeliverAck) => {
        clearTimeout(timer);
        resolve(ack);
      });
    });
  }

  function validDeliveryInput(overrides: Record<string, unknown> = {}) {
    return {
      notificationId: "507f1f77bcf86cd799439011",
      tenantId,
      userId,
      type: "processing_complete",
      priority: "normal",
      title: "Document processed",
      body: "Your document is ready.",
      actions: [],
      createdAt: new Date(),
      ...overrides,
    };
  }

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_URI as string, {
        dbName: "notifications-socket-test",
      });
      connectedByThisFile = true;
    }
    await Promise.all([
      TenantModel.init(),
      UserModel.init(),
      NotificationModel.init(),
    ]);

    httpServer = createHttpServer();
    socketServer = createSocketServer(httpServer);
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    port = (httpServer.address() as AddressInfo).port;
  });

  afterAll(async () => {
    for (const client of clients) {
      client.removeAllListeners();
      client.close();
    }
    clients.length = 0;
    socketServer.close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    if (connectedByThisFile) await mongoose.disconnect();
  });

  afterEach(() => {
    for (const client of clients) {
      client.removeAllListeners();
      client.close();
    }
    clients.length = 0;
  });

  beforeEach(async () => {
    await Promise.all([
      TenantModel.deleteMany({}),
      UserModel.deleteMany({}),
      NotificationModel.deleteMany({}),
    ]);
    const tenant = await TenantModel.create({
      name: "Socket Tenant",
      slug: "socket-tenant",
      status: "active",
      plan: "free",
    });
    tenantId = tenant.id;
    const user = await UserModel.create({
      tenantId,
      name: "Socket User",
      email: "socket-user@example.com",
      passwordHash: "not-used",
      role: "EMPLOYEE",
      status: "active",
      emailVerified: true,
      emailVerifiedAt: new Date(),
    });
    userId = user.id;
  });

  // ── user handshake ────────────────────────────────────────────────────────

  it("accepts a valid access JWT and joins the user:{tenantId}:{userId} room", async () => {
    const socket = connectSocket(userToken());
    await onConnected(socket);
    expect(socket.connected).toBe(true);

    const createdPromise = waitForEvent<Record<string, unknown>>(
      socket,
      "notification:created",
    );
    socketServer.emitToUser(tenantId, userId, "notification:created", {
      id: "n-1",
      type: "processing_failed",
    });
    const payload = await createdPromise;
    expect(payload.id).toBe("n-1");
  });

  it("accepts a JWT whose sessionVersion matches the user; rejects a stale one", async () => {
    await UserModel.updateOne({ _id: userId }, { $set: { sessionVersion: 2 } });

    const okSocket = connectSocket(userToken({ sessionVersion: 2 }));
    await onConnected(okSocket);
    expect(okSocket.connected).toBe(true);

    const staleSocket = connectSocket(userToken({ sessionVersion: 1 }));
    const err = await onConnectError(staleSocket);
    expect(err.message).toBe("unauthorized");
  });

  it("rejects an already-issued user token after its tenant is suspended", async () => {
    const token = userToken();
    await TenantModel.updateOne(
      { _id: tenantId },
      { $set: { status: "suspended" } },
    );

    const socket = connectSocket(token);
    const err = await onConnectError(socket);
    expect(err.message).toBe("unauthorized");
  });

  it("rejects a JWT with a non-access type claim", async () => {
    const socket = connectSocket(userToken({ type: "refresh" }));
    const err = await onConnectError(socket);
    expect(err.message).toBe("unauthorized");
  });

  it("rejects an expired JWT", async () => {
    const socket = connectSocket(userToken({}, "0s"));
    const err = await onConnectError(socket);
    expect(err.message).toBe("unauthorized");
  });

  it("rejects a JWT signed with the wrong secret", async () => {
    const token = signJwt(
      { sub: userId, tenantId, type: "access", role: "EMPLOYEE" },
      "wrong-secret-value",
      "15m",
    );
    const socket = connectSocket(token);
    const err = await onConnectError(socket);
    expect(err.message).toBe("unauthorized");
  });

  it("rejects a missing token", async () => {
    const socket = connectSocket("");
    const err = await onConnectError(socket);
    expect(err.message).toBe("unauthorized");
  });

  // ── emitToUser ────────────────────────────────────────────────────────────

  it("delivers notification:updated to the target room", async () => {
    const socket = connectSocket(userToken());
    await onConnected(socket);

    const updatedPromise = waitForEvent<{
      notificationId: string;
      changes: Record<string, unknown>;
    }>(socket, "notification:updated");
    socketServer.emitToUser(tenantId, userId, "notification:updated", {
      notificationId: "n-1",
      changes: { isRead: true },
    });
    const payload = await updatedPromise;
    expect(payload.notificationId).toBe("n-1");
    expect(payload.changes).toEqual({ isRead: true });
  });

  it("emitToUser delivers only to the target room", async () => {
    const target = connectSocket(userToken());
    await onConnected(target);

    const otherUser = await UserModel.create({
      tenantId,
      name: "Other User",
      email: "other-user@example.com",
      passwordHash: "not-used",
      role: "EMPLOYEE",
      status: "active",
      emailVerified: true,
      emailVerifiedAt: new Date(),
    });
    const other = connectSocket(userToken({ sub: otherUser.id }));
    await onConnected(other);

    const anotherTenant = await TenantModel.create({
      name: "Other Tenant",
      slug: "other-tenant",
      status: "active",
      plan: "free",
    });
    const crossTenantUser = await UserModel.create({
      tenantId: anotherTenant.id,
      name: "Cross Tenant User",
      email: "cross-tenant@example.com",
      passwordHash: "not-used",
      role: "EMPLOYEE",
      status: "active",
      emailVerified: true,
      emailVerifiedAt: new Date(),
    });
    const crossTenant = connectSocket(
      signJwt(
        {
          sub: crossTenantUser.id,
          tenantId: anotherTenant.id,
          type: "access",
          role: "EMPLOYEE",
        },
        config.JWT_SECRET,
        "15m",
      ),
    );
    await onConnected(crossTenant);

    const targetPromise = waitForEvent<Record<string, unknown>>(
      target,
      "notification:created",
    );
    socketServer.emitToUser(tenantId, userId, "notification:created", {
      id: "only-for-target",
    });
    const received = await targetPromise;
    expect(received.id).toBe("only-for-target");

    await Promise.all([
      expectNoEvent(other, "notification:created"),
      expectNoEvent(crossTenant, "notification:created"),
    ]);
  });

  // ── worker handshake + notification:deliver ───────────────────────────────

  it("rejects a wrong service token (machine auth is not a user JWT)", async () => {
    const socket = connectSocket("not-the-service-token");
    const err = await onConnectError(socket);
    expect(err.message).toBe("unauthorized");
  });

  it("worker with valid service token delivers notification:created and acks {ok:true}", async () => {
    const user = connectSocket(userToken());
    await onConnected(user);
    const worker = connectSocket(config.NOTIFICATION_SOCKET_SERVICE_TOKEN);
    await onConnected(worker);

    const createdPromise = waitForEvent<Record<string, unknown>>(
      user,
      "notification:created",
    );
    const ack = await emitDeliver(worker, validDeliveryInput());

    expect(ack).toEqual({ ok: true });
    const received = await createdPromise;
    expect(received.id).toBe("507f1f77bcf86cd799439011");
    expect(received.type).toBe("processing_complete");
    expect(received.priority).toBe("normal");
    expect(received.title).toBe("Document processed");
    expect(received.body).toBe("Your document is ready.");
    expect(received.isRead).toBe(false);
    expect(received.isSeen).toBe(false);
    expect(received.isArchived).toBe(false);
    expect(received.lifecycleState).toBe("VISIBLE");
    expect(received.version).toBe(1);
    expect(received.collapsedCount).toBe(0);
    expect(received.createdAt).toBeDefined();
    expect(received.updatedAt).toBeDefined();
  });

  it("worker deliver with an invalid payload acks {ok:false, errorCategory:'permanent'}", async () => {
    const worker = connectSocket(config.NOTIFICATION_SOCKET_SERVICE_TOKEN);
    await onConnected(worker);

    const ack = await emitDeliver(worker, validDeliveryInput({ type: "nope" }));
    expect(ack.ok).toBe(false);
    expect(ack.errorCategory).toBe("permanent");
  });

  it("acks {ok:true} even when the target user is offline (best-effort push)", async () => {
    const worker = connectSocket(config.NOTIFICATION_SOCKET_SERVICE_TOKEN);
    await onConnected(worker);

    const ack = await emitDeliver(worker, validDeliveryInput());
    expect(ack).toEqual({ ok: true });
  });

  it("a user socket cannot emit notification:deliver (no machine fan-out via user JWT)", async () => {
    const bystander = connectSocket(userToken());
    await onConnected(bystander);
    const userSocket = connectSocket(userToken());
    await onConnected(userSocket);

    const race = await Promise.race([
      emitDeliver(userSocket, validDeliveryInput()).catch(() => "acked"),
      new Promise<string>((resolve) => setTimeout(() => resolve("timeout"), 300)),
    ]);
    expect(race).toBe("timeout");
    await expectNoEvent(bystander, "notification:created");
  });
});
