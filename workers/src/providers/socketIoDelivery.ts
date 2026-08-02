import { io, type Socket } from "socket.io-client";
import type {
  NotificationTransportPort,
  TransportDeliveryInput,
  TransportDeliveryResult,
} from "../contracts/notificationTransport.js";
import { config } from "../config/index.js";

/**
 * Phase 2 socket delivery adapter (T16).
 *
 * Pushes notifications to the API's notification socket server (T15) over
 * socket.io so the user's browser is told in real time, instead of waiting for
 * the 30-second poll. The worker authenticates as a SERVICE with the shared
 * machine token and emits `notification:deliver`; the API acks
 * `{ok:true}` / `{ok:false, errorCategory}` (notificationSocketServer.ts).
 *
 * Adapters never throw for transient reasons — they report failure through the
 * `{ok, errorCategory}` taxonomy so the dispatch worker classifies it via
 * RetryableJobError / PermanentJobError:
 *   - connect failure / ack timeout           -> 'temporary'
 *   - server reject of the handshake or ack   -> 'permanent'
 */

export interface SocketIoDeliveryOptions {
  url?: string;
  token?: string;
  /** Connect + ack timeout in ms (tests use small values). */
  timeoutMs?: number;
  /** Socket factory override for unit tests (fake socket injection). */
  createSocket?: (url: string, token: string | undefined) => Socket;
}

/** Mirrors the zod env schema default (env.ts NOTIFICATION_SOCKET_URL). */
const DEFAULT_SOCKET_URL = "http://localhost:5000";
const DEFAULT_TIMEOUT_MS = 5_000;
const DELIVER_EVENT = "notification:deliver";
const CONNECT_TIMEOUT_CODE = "CONNECT_TIMEOUT";

/** Transport-level failure messages emitted by engine.io-client when the
 *  server is unreachable. Anything else on connect_error came from the
 *  server's handshake middleware (e.g. "unauthorized") — a reject. */
const TRANSPORT_FAILURE_PATTERN =
  /xhr poll error|websocket error|websocket close|polling error|connection refused|ECONNREFUSED|ECONNRESET|ENOTFOUND|EAI_AGAIN|getaddrinfo|socket hang up|ETIMEDOUT|network is down|network error/i;

function defaultCreateSocket(
  url: string,
  token: string | undefined,
): Socket {
  return io(url, {
    auth: { token },
    reconnection: false,
    timeout: DEFAULT_TIMEOUT_MS,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function connectErrorMessage(error: Error): string {
  const description = (error as Error & { description?: unknown }).description;
  return description === undefined
    ? error.message
    : `${error.message} ${String(description)}`;
}

function classifyConnectError(error: unknown): "permanent" | "temporary" {
  const err = error instanceof Error ? error : new Error(String(error));
  if ((err as Error & { code?: string }).code === CONNECT_TIMEOUT_CODE) {
    return "temporary";
  }
  return TRANSPORT_FAILURE_PATTERN.test(connectErrorMessage(err))
    ? "temporary"
    : "permanent";
}

function mapAck(ack: unknown): TransportDeliveryResult {
  if (!isRecord(ack) || typeof ack.ok !== "boolean") {
    return {
      ok: false,
      errorCategory: "temporary",
      errorMessage: "invalid ack from notification socket server",
    };
  }
  if (ack.ok) {
    return { ok: true };
  }
  return {
    ok: false,
    errorCategory: ack.errorCategory === "permanent" ? "permanent" : "temporary",
    errorMessage: typeof ack.errorMessage === "string" ? ack.errorMessage : undefined,
  };
}

export class SocketIoDelivery implements NotificationTransportPort {
  private readonly url: string;
  private readonly token: string | undefined;
  private readonly timeoutMs: number;
  private readonly createSocket: (url: string, token: string | undefined) => Socket;

  private socket: Socket | null = null;
  private socketPromise: Promise<Socket> | null = null;

  constructor(options: SocketIoDeliveryOptions = {}) {
    this.url = options.url ?? config.NOTIFICATION_SOCKET_URL;
    this.token = options.token ?? config.NOTIFICATION_SOCKET_SERVICE_TOKEN;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.createSocket = options.createSocket ?? defaultCreateSocket;
  }

  async deliver(input: TransportDeliveryInput): Promise<TransportDeliveryResult> {
    let socket: Socket;
    try {
      socket = await this.getSocket();
    } catch (error) {
      return {
        ok: false,
        errorCategory: classifyConnectError(error),
        errorMessage: describeError(error),
      };
    }

    try {
      const ack = await this.emitWithAck(socket, input);
      return mapAck(ack);
    } catch (error) {
      return {
        ok: false,
        errorCategory: "temporary",
        errorMessage: describeError(error),
      };
    }
  }

  close(): void {
    if (this.socket) {
      try {
        this.socket.disconnect();
      } catch {
        // best-effort disconnect — nothing to leak if it already closed
      }
      this.socket = null;
    }
    this.socketPromise = null;
  }

  private getSocket(): Promise<Socket> {
    if (this.socket?.connected) {
      return Promise.resolve(this.socket);
    }
    if (!this.socketPromise) {
      this.socketPromise = this.connect().finally(() => {
        this.socketPromise = null;
      });
    }
    return this.socketPromise;
  }

  private connect(): Promise<Socket> {
    const socket = this.createSocket(this.url, this.token);

    return new Promise<Socket>((resolve, reject) => {
      let settled = false;

      const cleanup = (): void => {
        clearTimeout(timer);
        socket.off("connect", onConnect);
        socket.off("connect_error", onConnectError);
      };

      const rejectConnect = (error: Error): void => {
        if (settled) return;
        settled = true;
        cleanup();
        try {
          socket.disconnect();
        } catch {
          // already closed
        }
        reject(error);
      };

      const onConnect = (): void => {
        if (settled) return;
        settled = true;
        cleanup();
        this.socket = socket;
        resolve(socket);
      };

      const onConnectError = (error: Error): void => {
        rejectConnect(error);
      };

      const timer = setTimeout(() => {
        const error = new Error(
          `socket connect to ${this.url} timed out after ${this.timeoutMs}ms`,
        );
        (error as Error & { code?: string }).code = CONNECT_TIMEOUT_CODE;
        rejectConnect(error);
      }, this.timeoutMs);

      socket.on("connect", onConnect);
      socket.on("connect_error", onConnectError);
    });
  }

  private emitWithAck(
    socket: Socket,
    input: TransportDeliveryInput,
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`${DELIVER_EVENT} ack timed out after ${this.timeoutMs}ms`));
      }, this.timeoutMs);

      const onAck = (ack: unknown): void => {
        cleanup();
        resolve(ack);
      };

      const cleanup = (): void => {
        clearTimeout(timer);
      };

      socket.emit(DELIVER_EVENT, input, onAck);
    });
  }
}
