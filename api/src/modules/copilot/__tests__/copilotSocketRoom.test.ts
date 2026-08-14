/**
 * Copilot lifecycle socket room (guider.md §15).
 *
 * Real socket.io server + socket.io-client against an ephemeral port, with a
 * MongoMemoryReplSet-backed UserModel for the handshake (same pattern as
 * notificationSocketServer.test.ts). Verifies the additive `copilot:<runId>`
 * room: joining receives lifecycle events, non-joined run ids do not, and
 * leaving stops delivery.
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
import { config } from "../../../config/index.js";
import { signJwt } from "../../auth/jwtTokens.js";
import {
  createSocketServer,
  type NotificationSocketServerHandle,
} from "../../notifications/socket/notificationSocketServer.js";

const hasMongo = Boolean(process.env.MONGODB_URI);

describe.skipIf(!hasMongo)("copilotSocketRoom (T§15)", () => {
  let httpServer: HttpServer;
  let socketServer: NotificationSocketServerHandle;
  let port: number;
  let connectedByThisFile = false;

  let tenantId = "";
  let userId = "";
  const clients: ClientSocket[] = [];

  function userToken(overrides: Record<string, unknown> = {}): string {
    return signJwt(
      { sub: userId, tenantId, type: "access", role: "EMPLOYEE", ...overrides },
      config.JWT_SECRET,
      "15m",
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

  function emitJoin(socket: ClientSocket, runId: unknown): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Timed out waiting for copilot:join ack")),
        3000,
      );
      socket.emit("copilot:join", { runId }, (ok: boolean) => {
        clearTimeout(timer);
        resolve(ok);
      });
    });
  }

  function emitLeave(socket: ClientSocket, runId: string): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Timed out waiting for copilot:leave ack")),
        3000,
      );
      socket.emit("copilot:leave", { runId }, (ok: boolean) => {
        clearTimeout(timer);
        resolve(ok);
      });
    });
  }

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_URI as string, {
        dbName: "copilot-socket-test",
      });
      connectedByThisFile = true;
    }
    await Promise.all([TenantModel.init(), UserModel.init()]);

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
    await Promise.all([TenantModel.deleteMany({}), UserModel.deleteMany({})]);
    const tenant = await TenantModel.create({
      name: "Copilot Tenant",
      slug: "copilot-tenant",
      status: "active",
      plan: "free",
    });
    tenantId = tenant.id;
    const user = await UserModel.create({
      tenantId,
      name: "Copilot User",
      email: "copilot-user@example.com",
      passwordHash: "not-used",
      role: "EMPLOYEE",
      status: "active",
      emailVerified: true,
      emailVerifiedAt: new Date(),
    });
    userId = user.id;
  });

  it("delivers lifecycle events to a socket that joined copilot:<runId>", async () => {
    const runId = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
    const socket = connectSocket(userToken());
    await onConnected(socket);
    await expect(emitJoin(socket, runId)).resolves.toBe(true);

    const executedPromise = waitForEvent<{ runId: string; status: string }>(
      socket,
      "action.executed",
    );
    socketServer.emitToCopilotRun(runId, "action.executed", {
      runId,
      status: "completed",
    });
    const payload = await executedPromise;
    expect(payload.runId).toBe(runId);
    expect(payload.status).toBe("completed");
  });

  it("does not deliver to a socket that did not join the run room", async () => {
    const runId = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
    const otherRunId = "6ba7b810-9dad-11d1-80b4-00c04fd430c9";
    const socket = connectSocket(userToken());
    await onConnected(socket);
    await emitJoin(socket, runId);

    const noEvent = expectNoEvent(socket, "action.executed");
    socketServer.emitToCopilotRun(otherRunId, "action.executed", {
      runId: otherRunId,
      status: "completed",
    });
    await noEvent;
  });

  it("stops delivering after copilot:leave", async () => {
    const runId = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
    const socket = connectSocket(userToken());
    await onConnected(socket);
    await emitJoin(socket, runId);

    const firstPromise = waitForEvent<{ runId: string }>(socket, "action.executed");
    socketServer.emitToCopilotRun(runId, "action.executed", { runId });
    await firstPromise;

    await expect(emitLeave(socket, runId)).resolves.toBe(true);
    const noEvent = expectNoEvent(socket, "action.executed");
    socketServer.emitToCopilotRun(runId, "action.executed", { runId });
    await noEvent;
  });

  it("ignores malformed join/leave run ids and invalid emit run ids", async () => {
    const socket = connectSocket(userToken());
    await onConnected(socket);

    // Malformed join payloads must not throw or join.
    await expect(emitJoin(socket, 123)).resolves.toBe(false);
    await expect(emitJoin(socket, { runId: 123 })).resolves.toBe(false);
    await expect(emitJoin(socket, "")).resolves.toBe(false);
    socket.emit("copilot:join", {});
    await expect(emitLeave(socket, "")).resolves.toBe(false);

    // Malformed emit run ids are silent no-ops.
    expect(() => {
      socketServer.emitToCopilotRun("", "action.executed", {});
      socketServer.emitToCopilotRun(
        "x".repeat(129),
        "action.executed",
        {},
      );
    }).not.toThrow();
    expect(socket.connected).toBe(true);
  });
});
