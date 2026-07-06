import test from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";

process.env.NODE_ENV = "test";

import app from "./app.js";

function createServer() {
  return new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const srv = app.listen(0, () => resolve(srv));
  });
}

function closeServer(server: ReturnType<typeof app.listen>) {
  return new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

test("returns a standardized error envelope for handled errors", async () => {
  const server = await createServer();

  try {
    const address = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${address.port}/boom`);
    const body = (await response.json()) as {
      success: boolean;
      error: {
        code: string;
        message: string;
        details: { field: string; issue: string } | null;
        path: string;
        method: string;
        timestamp: string;
      };
    };

    assert.equal(response.status, 400);
    assert.equal(body.success, false);
    assert.equal(body.error.code, "BAD_REQUEST");
    assert.equal(body.error.message, "Bad request");
    assert.deepEqual(body.error.details, {
      field: "email",
      issue: "invalid format",
    });
    assert.equal(body.error.path, "/boom");
    assert.equal(body.error.method, "GET");
    assert.match(body.error.timestamp, /^\d{4}-\d{2}-\d{2}T/);
  } finally {
    await closeServer(server);
  }
});

test("returns a standardized 404 envelope for unknown routes", async () => {
  const server = await createServer();

  try {
    const address = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${address.port}/does-not-exist`);
    const body = (await response.json()) as {
      success: boolean;
      error: {
        code: string;
        message: string;
        details: null;
        path: string;
        method: string;
        timestamp: string;
      };
    };

    assert.equal(response.status, 404);
    assert.equal(body.success, false);
    assert.equal(body.error.code, "NOT_FOUND");
    assert.equal(body.error.message, "Route not found");
    assert.equal(body.error.details, null);
    assert.equal(body.error.path, "/does-not-exist");
    assert.equal(body.error.method, "GET");
    assert.match(body.error.timestamp, /^\d{4}-\d{2}-\d{2}T/);
  } finally {
    await closeServer(server);
  }
});

test("returns a standardized validation error envelope with a route-specific code", async () => {
  const server = await createServer();

  try {
    const address = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${address.port}/signup`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ email: "invalid" }),
    });
    const body = (await response.json()) as {
      success: boolean;
      error: {
        code: string;
        message: string;
        details: { errors: Array<{ field: string; issue: string }> } | null;
        path: string;
        method: string;
        timestamp: string;
      };
    };

    assert.equal(response.status, 400);
    assert.equal(body.success, false);
    assert.equal(body.error.code, "AUTH_SIGNUP_VALIDATION_ERROR");
    assert.equal(body.error.message, "Validation failed");
    assert.deepEqual(body.error.details, {
      errors: [{ field: "email", issue: "invalid format" }],
    });
    assert.equal(body.error.path, "/signup");
    assert.equal(body.error.method, "POST");
    assert.match(body.error.timestamp, /^\d{4}-\d{2}-\d{2}T/);
  } finally {
    await closeServer(server);
  }
});

test("returns a standardized 400 envelope for malformed JSON", async () => {
  const server = await createServer();

  try {
    const address = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${address.port}/signup`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: '{"brokenJson":',
    });
    const body = (await response.json()) as {
      success: boolean;
      error: {
        code: string;
        message: string;
        details: null;
        path: string;
        method: string;
        timestamp: string;
      };
    };

    assert.equal(response.status, 400);
    assert.equal(body.success, false);
    assert.equal(body.error.code, "BAD_REQUEST");
    assert.equal(body.error.message, "Invalid JSON payload");
    assert.equal(body.error.details, null);
    assert.equal(body.error.path, "/signup");
    assert.equal(body.error.method, "POST");
    assert.match(body.error.timestamp, /^\d{4}-\d{2}-\d{2}T/);
  } finally {
    await closeServer(server);
  }
});
