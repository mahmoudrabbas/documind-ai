/**
 * Socket.io CORS regression for the notifications channel (T15) — todo 3 of
 * .omo/plans/socket-cors-fix.md.
 *
 * The notifications socket channel was CORS-blocked in the browser because
 * socket.io v4 does NOT attach Access-Control-Allow-* headers unless an
 * explicit `cors` option is passed to `new Server(httpServer, { cors })`.
 *
 * This suite exercises the REAL HTTP surface with RAW node:http requests
 * (NO socket.io-client, NO Mongo connection, NO skipIf guard):
 *
 *   GET     /socket.io/?EIO=4&transport=polling   (handshake / worker-style)
 *   OPTIONS /socket.io/?EIO=4&transport=polling   (browser preflight)
 *
 * The contract under test is the RESPONSE HEADERS; status codes are only
 * asserted where they pin down real behavior (200 for the sid-less open
 * handshake, 204 for the allowed preflight).
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterAll,
  afterEach,
  vi,
} from "vitest";
import {
  createServer as createHttpServer,
  request as httpRequest,
} from "node:http";
import type {
  IncomingHttpHeaders,
  Server as HttpServer,
} from "node:http";
import type { AddressInfo } from "node:net";
import {
  createSocketServer,
  type NotificationSocketServerHandle,
} from "../socket/notificationSocketServer.js";

// Env bootstrap, hoisted above the static imports (the socket server module
// statically imports `config`, whose Zod schema parses process.env at module
// load): NODE_ENV=development provides the localhost:3000 allowlist entry and
// skips the "controlled environment" secret checks, and a placeholder
// MONGODB_URI (never connected to) satisfies the required schema key. The CORS
// allowlist env vars are deleted so a dev .env cannot inject an origin that
// would defeat the evil.example assertion; the originals are captured here and
// restored by afterEach. Under scripts/run-api-tests.mjs the real memory-replset
// URI is already set and is left untouched.
const originalEnv = vi.hoisted(() => {
  const original = {
    NODE_ENV: process.env.NODE_ENV,
    CORS_ORIGIN: process.env.CORS_ORIGIN,
    APP_FRONTEND_URL: process.env.APP_FRONTEND_URL,
  };
  process.env.NODE_ENV = "development";
  delete process.env.CORS_ORIGIN;
  delete process.env.APP_FRONTEND_URL;
  if (!process.env.MONGODB_URI) {
    process.env.MONGODB_URI =
      "mongodb://127.0.0.1:27017/notification-socket-cors-test";
  }
  return original;
});

interface RawSocketResponse {
  statusCode: number;
  headers: IncomingHttpHeaders;
}

interface RawSocketOptions {
  method?: "GET" | "OPTIONS";
  origin?: string;
  extraHeaders?: Record<string, string>;
}

/** Raw engine.io HTTP request against /socket.io/?EIO=4&transport=polling, 3s max. */
function rawSocketRequest(
  port: number,
  options: RawSocketOptions = {},
): Promise<RawSocketResponse> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {
      Connection: "close",
      ...options.extraHeaders,
    };
    if (options.origin !== undefined) headers.Origin = options.origin;

    const method = options.method ?? "GET";
    let timer: NodeJS.Timeout;
    const req = httpRequest(
      {
        hostname: "127.0.0.1",
        port,
        path: "/socket.io/?EIO=4&transport=polling",
        method,
        headers,
      },
      (res) => {
        res.resume(); // drain the body so the request can finish
        res.on("end", () => {
          clearTimeout(timer);
          resolve({ statusCode: res.statusCode ?? 0, headers: res.headers });
        });
      },
    );

    timer = setTimeout(() => {
      req.destroy(
        new Error(
          `raw ${method} /socket.io timed out after 3s (origin=${options.origin ?? "<none>"})`,
        ),
      );
    }, 3000);

    req.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    req.end();
  });
}

describe("notificationSocketServer CORS (T15 regression)", () => {
  let httpServer: HttpServer;
  let socketServer: NotificationSocketServerHandle;
  let port: number;

  beforeAll(async () => {
    // The browser origin http://localhost:3000 is allowlisted when NODE_ENV is
    // not production (see api/src/common/cors/corsOrigins.ts).
    process.env.NODE_ENV = "development";

    httpServer = createHttpServer();
    socketServer = createSocketServer(httpServer);
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    port = (httpServer.address() as AddressInfo).port;
  });

  // The allowlist is computed per request from live env, so re-delete the CORS
  // vars before every test (afterEach restored them) and hand the originals
  // back to the environment after each test so no state leaks to other files
  // that share the vitest worker.
  beforeEach(() => {
    delete process.env.CORS_ORIGIN;
    delete process.env.APP_FRONTEND_URL;
  });

  afterEach(() => {
    if (originalEnv.CORS_ORIGIN === undefined) {
      delete process.env.CORS_ORIGIN;
    } else {
      process.env.CORS_ORIGIN = originalEnv.CORS_ORIGIN;
    }
    if (originalEnv.APP_FRONTEND_URL === undefined) {
      delete process.env.APP_FRONTEND_URL;
    } else {
      process.env.APP_FRONTEND_URL = originalEnv.APP_FRONTEND_URL;
    }
  });

  afterAll(async () => {
    socketServer.close();
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => resolve(), 3000);
      httpServer.close(() => {
        clearTimeout(timer);
        resolve();
      });
    });
    if (originalEnv.NODE_ENV === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalEnv.NODE_ENV;
    }
  });

  it(
    "allows an allowed browser origin: response carries ACAO + credentials headers",
    { timeout: 5000 },
    async () => {
      const { headers } = await rawSocketRequest(port, {
        origin: "http://localhost:3000",
      });
      expect(headers["access-control-allow-origin"]).toBe(
        "http://localhost:3000",
      );
      expect(headers["access-control-allow-credentials"]).toBe("true");
    },
  );

  it(
    "rejects a disallowed origin: no access-control-allow-origin header",
    { timeout: 5000 },
    async () => {
      const { headers } = await rawSocketRequest(port, {
        origin: "http://evil.example",
      });
      expect(headers["access-control-allow-origin"]).toBeUndefined();
    },
  );

  it(
    "allows a request with no Origin header (Node worker-style client)",
    { timeout: 5000 },
    async () => {
      // A sid-less GET is the engine.io open handshake: it must complete with
      // the open packet (200), not be rejected by CORS (absent origin → allow).
      const { statusCode } = await rawSocketRequest(port);
      expect(statusCode).toBe(200);
    },
  );

  it(
    "answers a preflight OPTIONS from an allowed origin with 204 + ACAO + credentials",
    { timeout: 5000 },
    async () => {
      const { statusCode, headers } = await rawSocketRequest(port, {
        method: "OPTIONS",
        origin: "http://localhost:3000",
        extraHeaders: { "Access-Control-Request-Method": "GET" },
      });
      expect(statusCode).toBe(204);
      expect(headers["access-control-allow-origin"]).toBe(
        "http://localhost:3000",
      );
      expect(headers["access-control-allow-credentials"]).toBe("true");
    },
  );
});
