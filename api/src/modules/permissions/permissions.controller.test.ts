import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { getMyPermissionsController } from "./permissions.controller.js";
import { setPermissionEvaluator } from "./permissions.evaluator.js";
import { InMemoryPermissionEvaluator } from "./permissions.evaluator.fake.js";
import { Permission } from "./permissions.catalog.js";

afterEach(() => {
  setPermissionEvaluator(null);
});

test("permissions/me disables conditional caching so the client receives the permission payload", async () => {
  const evaluator = new InMemoryPermissionEvaluator();
  const tenantId = "507f1f77bcf86cd799439011";
  const actorId = "507f191e810c19729de860ea";
  evaluator.addUser(actorId, tenantId, "EMPLOYEE");
  setPermissionEvaluator(evaluator);

  const headers = new Map<string, string>();
  let body: unknown;
  const response = {
    setHeader(name: string, value: string) {
      headers.set(name.toLowerCase(), value);
      return response;
    },
    status() {
      return response;
    },
    json(value: unknown) {
      body = value;
      return response;
    },
  } as never;

  const request = {
    auth: { userId: actorId, tenantId, role: "EMPLOYEE" },
    tenantId,
    headers: {
      "if-none-match": "W/\"stale-permissions\"",
      "if-modified-since": new Date(0).toUTCString(),
    } as Record<string, string | undefined>,
  };

  await getMyPermissionsController(
    request as never,
    response,
    (error?: unknown) => {
      if (error) throw error;
    },
  );

  assert.equal(headers.get("cache-control"), "no-store, no-cache, must-revalidate, proxy-revalidate");
  assert.equal(headers.get("pragma"), "no-cache");
  assert.equal(request.headers["if-none-match"], undefined);
  assert.equal(request.headers["if-modified-since"], undefined);
  assert.deepEqual((body as { data: { permissions: string[] } }).data.permissions.includes(Permission.KNOWLEDGE_GAPS_READ), true);
});
