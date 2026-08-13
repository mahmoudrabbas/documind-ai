import test from "node:test";
import assert from "node:assert/strict";
import express, { type Express } from "express";
import { createServer, request } from "node:http";
import type { AddressInfo } from "node:net";
import {
  rejectForbiddenOrigin,
  requireWebhookSecret,
  safeStringEqual,
} from "../webhookAuth.js";

const TEST_SECRET = "webhook-secret-32-characters-minimum";

interface RawResponse {
  statusCode: number;
  body: string;
}

function rawPost(
  port: number,
  headers: Record<string, string> = {},
): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        hostname: "127.0.0.1",
        port,
        path: "/webhook",
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          clearTimeout(timer);
          resolve({ statusCode: res.statusCode ?? 0, body });
        });
      },
    );
    const timer = setTimeout(() => {
      req.destroy(new Error(`raw POST /webhook timed out after 3s`));
    }, 3000);
    req.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    req.end(JSON.stringify({ eventType: "delivered" }));
  });
}

async function startApp(): Promise<{ port: number; close: () => Promise<void> }> {
  const app: Express = express();
  app.post(
    "/webhook",
    rejectForbiddenOrigin(),
    requireWebhookSecret(() => TEST_SECRET),
    (_req, res) => {
      res.status(200).json({ ok: true });
    },
  );

  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    port,
    close: () =>
      new Promise<void>((resolve) => {
        const timer = setTimeout(() => resolve(), 3000);
        server.close(() => {
          clearTimeout(timer);
          resolve();
        });
      }),
  };
}

test("safeStringEqual is constant-time length-safe and exact", () => {
  assert.equal(safeStringEqual("abc", "abc"), true);
  assert.equal(safeStringEqual("abc", "abd"), false);
  assert.equal(safeStringEqual("abc", "abcd"), false);
  assert.equal(safeStringEqual("", ""), true);
});

test("requireWebhookSecret + rejectForbiddenOrigin over the wire", async (t) => {
  const saved: Record<string, string | undefined> = {
    NODE_ENV: process.env.NODE_ENV,
    CORS_ORIGIN: process.env.CORS_ORIGIN,
    APP_FRONTEND_URL: process.env.APP_FRONTEND_URL,
  };
  const restore = () => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  };
  process.env.NODE_ENV = "development";
  process.env.CORS_ORIGIN = "http://allowed.example";
  delete process.env.APP_FRONTEND_URL;

  const { port, close } = await startApp();

  try {
    await t.test(
      "rejects a request with no webhook secret (401)",
      async () => {
        const { statusCode } = await rawPost(port);
        assert.equal(statusCode, 401);
      },
    );

    await t.test(
      "rejects a request with the wrong webhook secret (401)",
      async () => {
        const { statusCode } = await rawPost(port, {
          "x-webhook-secret": "wrong-secret",
        });
        assert.equal(statusCode, 401);
      },
    );

    await t.test(
      "rejects a request from a disallowed Origin (403)",
      async () => {
        const { statusCode } = await rawPost(port, {
          "x-webhook-secret": TEST_SECRET,
          Origin: "http://evil.example",
        });
        assert.equal(statusCode, 403);
      },
    );

    await t.test(
      "accepts a request with the correct secret and no Origin header",
      async () => {
        const { statusCode, body } = await rawPost(port, {
          "x-webhook-secret": TEST_SECRET,
        });
        assert.equal(statusCode, 200);
        assert.deepEqual(JSON.parse(body), { ok: true });
      },
    );

    await t.test(
      "accepts a request with the correct secret and an allowed Origin",
      async () => {
        const { statusCode } = await rawPost(port, {
          "x-webhook-secret": TEST_SECRET,
          Origin: "http://allowed.example",
        });
        assert.equal(statusCode, 200);
      },
    );
  } finally {
    restore();
    await close();
  }
});
