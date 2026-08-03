import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Server } from "socket.io";
import { type Socket } from "socket.io-client";
import type {
  NotificationTransportPort,
  TransportDeliveryInput,
  TransportDeliveryResult,
} from "../contracts/notificationTransport.js";

// The config singleton (transitively imported by the adapter) parses env
// eagerly, so the fake Atlas URI and the socket env values must be set before
// any module that imports config is evaluated. Each node:test file runs in its
// own process, so these assignments are file-local.
process.env.MONGODB_URI =
  "mongodb+srv://test:test@mongo.test.invalid/documind-test";
process.env.NOTIFICATION_SOCKET_URL = "http://127.0.0.1:5999";
process.env.NOTIFICATION_SOCKET_SERVICE_TOKEN = "test-worker-socket-token";

const { SocketIoDelivery } = await import("./socketIoDelivery.js");

const SERVICE_TOKEN = "test-worker-service-token";

function makeInput(overrides: Partial<TransportDeliveryInput> = {}): TransportDeliveryInput {
  return {
    notificationId: "notif-socket-1",
    tenantId: "tenant-1",
    userId: "user-1",
    type: "processing_failed",
    priority: "high",
    title: "OCR processing failed",
    body: "The document could not be processed.",
    actions: [{ label: "Retry", url: "/documents/doc-1/ocr/retry" }],
    createdAt: new Date("2026-08-01T10:00:00.000Z"),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Fake socket for unit tests (no real TCP, no real socket.io client).
// ---------------------------------------------------------------------------

type Listener = (...args: unknown[]) => void;

class FakeSocket {
  connected = false;
  emitted: Array<{ event: string; args: unknown[] }> = [];
  private listeners = new Map<string, Listener[]>();
  private ackHandler:
    | ((input: unknown, ack: (result: unknown) => void) => void)
    | null = null;

  on(event: string, listener: Listener): this {
    const list = this.listeners.get(event) ?? [];
    list.push(listener);
    this.listeners.set(event, list);
    return this;
  }

  off(event: string, listener: Listener): this {
    const list = this.listeners.get(event) ?? [];
    this.listeners.set(
      event,
      list.filter((candidate) => candidate !== listener),
    );
    return this;
  }

  emit(event: string, ...args: unknown[]): boolean {
    this.emitted.push({ event, args });
    if (event === "notification:deliver" && this.ackHandler) {
      this.ackHandler(args[0], args[1] as (result: unknown) => void);
    }
    return true;
  }

  disconnect(): void {
    this.connected = false;
  }

  // Test helpers -----------------------------------------------------------
  connect(): void {
    this.connected = true;
    for (const listener of this.listeners.get("connect") ?? []) listener();
  }

  failConnect(error: Error): void {
    for (const listener of this.listeners.get("connect_error") ?? []) {
      listener(error);
    }
  }

  setAckHandler(
    handler: (input: unknown, ack: (result: unknown) => void) => void,
  ): void {
    this.ackHandler = handler;
  }
}

function makeFakeDelivery(overrides: { timeoutMs?: number } = {}) {
  const fake = new FakeSocket();
  const delivery = new SocketIoDelivery({
    url: "http://fake.invalid",
    token: SERVICE_TOKEN,
    timeoutMs: overrides.timeoutMs ?? 100,
    createSocket: () => fake as unknown as Socket,
  });
  return { delivery, fake };
}

// ---------------------------------------------------------------------------
// Unit tests with the fake socket.
// ---------------------------------------------------------------------------

test("SocketIoDelivery - happy path: acks {ok:true} and emits the full input over notification:deliver", async () => {
  const { delivery, fake } = makeFakeDelivery();
  fake.setAckHandler((_input, ack) => ack({ ok: true }));

  const input = makeInput();
  const resultPromise = delivery.deliver(input);
  fake.connect();

  const result = await resultPromise;
  assert.deepEqual(result, { ok: true });

  // The transport input is emitted verbatim on the wire event.
  assert.equal(fake.emitted.length, 1);
  assert.equal(fake.emitted[0].event, "notification:deliver");
  assert.deepEqual(fake.emitted[0].args[0], input);
});

test("SocketIoDelivery - permanent reject ack is mapped through unchanged", async () => {
  const { delivery, fake } = makeFakeDelivery();
  fake.setAckHandler((_input, ack) =>
    ack({ ok: false, errorCategory: "permanent", errorMessage: "invalid payload" }),
  );

  const resultPromise = delivery.deliver(makeInput());
  fake.connect();

  const result = await resultPromise;
  assert.deepEqual(result, {
    ok: false,
    errorCategory: "permanent",
    errorMessage: "invalid payload",
  });
});

test("SocketIoDelivery - temporary reject ack is mapped through unchanged", async () => {
  const { delivery, fake } = makeFakeDelivery();
  fake.setAckHandler((_input, ack) =>
    ack({ ok: false, errorCategory: "temporary", errorMessage: "server busy" }),
  );

  const resultPromise = delivery.deliver(makeInput());
  fake.connect();

  const result = await resultPromise;
  assert.deepEqual(result, {
    ok: false,
    errorCategory: "temporary",
    errorMessage: "server busy",
  });
});

test("SocketIoDelivery - ack timeout is classified temporary", async () => {
  const { delivery, fake } = makeFakeDelivery({ timeoutMs: 50 });
  fake.setAckHandler(() => {
    // Server never acks.
  });

  const resultPromise = delivery.deliver(makeInput());
  fake.connect();

  const result = await resultPromise;
  assert.equal(result.ok, false);
  assert.equal(result.errorCategory, "temporary");
});

test("SocketIoDelivery - connect failure (transport-level) is classified temporary", async () => {
  const { delivery, fake } = makeFakeDelivery();
  fake.setAckHandler((_input, ack) => ack({ ok: true }));

  const resultPromise = delivery.deliver(makeInput());
  fake.failConnect(new Error("xhr poll error"));

  const result = await resultPromise;
  assert.equal(result.ok, false);
  assert.equal(result.errorCategory, "temporary");
  assert.equal(result.errorMessage, "xhr poll error");
});

test("SocketIoDelivery - server reject during handshake is classified permanent", async () => {
  const { delivery, fake } = makeFakeDelivery();

  const resultPromise = delivery.deliver(makeInput());
  fake.failConnect(new Error("unauthorized"));

  const result = await resultPromise;
  assert.equal(result.ok, false);
  assert.equal(result.errorCategory, "permanent");
  assert.equal(result.errorMessage, "unauthorized");
});

test("SocketIoDelivery - lazily connects once and reuses the connected socket", async () => {
  const { delivery, fake } = makeFakeDelivery();
  fake.setAckHandler((_input, ack) => ack({ ok: true }));

  const first = delivery.deliver(makeInput());
  fake.connect();
  assert.deepEqual(await first, { ok: true });

  // Second deliver reuses the already-connected socket (no second createSocket).
  fake.setAckHandler((_input, ack) => ack({ ok: true }));
  assert.deepEqual(await delivery.deliver(makeInput()), { ok: true });
  assert.equal(fake.emitted.length, 2);
});

test("SocketIoDelivery - uses config NOTIFICATION_SOCKET_URL and NOTIFICATION_SOCKET_SERVICE_TOKEN when options are omitted", async () => {
  const fake = new FakeSocket();
  fake.setAckHandler((_input, ack) => ack({ ok: true }));

  let capturedUrl = "";
  let capturedToken: string | undefined = "unset";
  const delivery = new SocketIoDelivery({
    timeoutMs: 100,
    createSocket: (url, token) => {
      capturedUrl = url;
      capturedToken = token;
      return fake as unknown as Socket;
    },
  });

  const resultPromise = delivery.deliver(makeInput());
  fake.connect();
  assert.deepEqual(await resultPromise, { ok: true });

  assert.equal(capturedUrl, process.env.NOTIFICATION_SOCKET_URL);
  assert.equal(capturedToken, process.env.NOTIFICATION_SOCKET_SERVICE_TOKEN);
});

// Port substitutability (LSP): a failing adapter reporting the shared failure
// taxonomy must typecheck as a NotificationTransportPort. The worker (T11)
// maps errorCategory 'temporary' -> log-only (doc already delivered).
class TemporaryFailureAdapter implements NotificationTransportPort {
  async deliver(_input: TransportDeliveryInput): Promise<TransportDeliveryResult> {
    return {
      ok: false,
      errorCategory: "temporary",
      errorMessage: "socket unavailable",
    };
  }
}

test("TemporaryFailureAdapter - temporary-failure result typechecks as the port and honors the taxonomy", async () => {
  const adapter: NotificationTransportPort = new TemporaryFailureAdapter();
  const result = await adapter.deliver(makeInput());

  assert.equal(result.ok, false);
  assert.equal(result.errorCategory, "temporary");
  assert.equal(result.errorMessage, "socket unavailable");
});

// ---------------------------------------------------------------------------
// Integration tests against a REAL socket.io server on an ephemeral TCP port.
// ---------------------------------------------------------------------------

interface TestServer {
  port: number;
  received: Array<{ input: unknown }>;
  close(): Promise<void>;
}

async function startTestServer(options: {
  token?: string;
  ackHandler?: (input: unknown) => unknown;
} = {}): Promise<TestServer> {
  const expectedToken = options.token ?? SERVICE_TOKEN;
  const httpServer = createServer();
  const io = new Server(httpServer);

  io.use((socket, next) => {
    const token =
      typeof socket.handshake.auth?.token === "string"
        ? socket.handshake.auth.token
        : "";
    if (token === expectedToken) {
      next();
      return;
    }
    next(new Error("unauthorized"));
  });

  const received: TestServer["received"] = [];
  io.on("connection", (socket) => {
    socket.on("notification:deliver", (input: unknown, ack?: (result: unknown) => void) => {
      received.push({ input });
      const result = options.ackHandler
        ? options.ackHandler(input)
        : { ok: true };
      ack?.(result);
    });
  });

  await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const port = (httpServer.address() as AddressInfo).port;

  return {
    port,
    received,
    close: () =>
      new Promise<void>((resolve) => {
        io.close(() => resolve());
      }),
  };
}

/** Returns a port that is guaranteed to have nothing listening. */
async function getClosedPort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const port = (probe.address() as AddressInfo).port;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return port;
}

test("SocketIoDelivery - integration: happy-path ack over a real socket.io server", async (t) => {
  const server = await startTestServer();
  t.after(() => server.close());

  const delivery = new SocketIoDelivery({
    url: `http://127.0.0.1:${server.port}`,
    token: SERVICE_TOKEN,
    timeoutMs: 2_000,
  });
  t.after(() => delivery.close());

  const input = makeInput();
  const result = await delivery.deliver(input);

  assert.deepEqual(result, { ok: true });
  // The server must have received the exact transport input over the wire.
  assert.equal(server.received.length, 1);
  const received = server.received[0].input as Record<string, unknown>;
  assert.equal(received.notificationId, input.notificationId);
  assert.equal(received.tenantId, input.tenantId);
  assert.equal(received.userId, input.userId);
  assert.equal(received.type, input.type);
  assert.equal(received.priority, input.priority);
  assert.equal(received.title, input.title);
  assert.equal(received.body, input.body);
  assert.deepEqual(received.actions, input.actions);
});

test("SocketIoDelivery - integration: permanent reject ack from a real server", async (t) => {
  const server = await startTestServer({
    ackHandler: () => ({ ok: false, errorCategory: "permanent", errorMessage: "invalid payload" }),
  });
  t.after(() => server.close());

  const delivery = new SocketIoDelivery({
    url: `http://127.0.0.1:${server.port}`,
    token: SERVICE_TOKEN,
    timeoutMs: 2_000,
  });
  t.after(() => delivery.close());

  const result = await delivery.deliver(makeInput());
  assert.deepEqual(result, {
    ok: false,
    errorCategory: "permanent",
    errorMessage: "invalid payload",
  });
});

test("SocketIoDelivery - integration: server rejects the handshake with a permanent error", async (t) => {
  const server = await startTestServer(); // accepts only SERVICE_TOKEN
  t.after(() => server.close());

  const delivery = new SocketIoDelivery({
    url: `http://127.0.0.1:${server.port}`,
    token: "WRONG-TOKEN",
    timeoutMs: 2_000,
  });
  t.after(() => delivery.close());

  const result = await delivery.deliver(makeInput());
  assert.equal(result.ok, false);
  assert.equal(result.errorCategory, "permanent");
});

test("SocketIoDelivery - integration: FAILURE SCENARIO server unreachable -> temporary error surfaced", async (t) => {
  // Deterministic "nothing is listening" port: bound once, then released.
  const deadPort = await getClosedPort();

  const delivery = new SocketIoDelivery({
    url: `http://127.0.0.1:${deadPort}`,
    token: SERVICE_TOKEN,
    timeoutMs: 2_000,
  });
  t.after(() => delivery.close());

  const result = await delivery.deliver(makeInput());
  assert.equal(result.ok, false);
  assert.equal(result.errorCategory, "temporary");
  assert.ok(result.errorMessage && result.errorMessage.length > 0);
});
