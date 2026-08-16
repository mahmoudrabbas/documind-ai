import test from "node:test";
import assert from "node:assert/strict";
import type { Request, Response } from "express";
import {
  INVITE_RESEND_MESSAGE,
  INVITE_RESEND_MAX,
  INVITE_RESEND_STORE_PREFIX,
  INVITE_SET_PASSWORD_MESSAGE,
  INVITE_SET_PASSWORD_MAX,
  INVITE_SET_PASSWORD_STORE_PREFIX,
  INVITE_VALIDATE_MESSAGE,
  INVITE_VALIDATE_MAX,
  INVITE_VALIDATE_STORE_PREFIX,
  buildInviteRateLimitRedisKey,
  createInviteRateLimiters,
  inviteResendKeyGenerator,
  inviteTokenKeyGenerator,
} from "./users.inviteRateLimit.js";
import type { InviteRateLimiters } from "./users.inviteRateLimit.js";

// ---------------------------------------------------------------------------
// Invitation rate limiter separation
//
// Regression tests for the bug where a single shared limiter made
// /users/validate-invite (an automatic, low-risk read) consume the same quota
// as /users/set-password-from-invite and /users/:id/resend-invitation.
// ---------------------------------------------------------------------------

type InvokeResult = {
  status?: number;
  body?: {
    success?: boolean;
    error?: string;
    message?: string;
    retryAfterSeconds?: number;
  };
  nextCalls: number;
};

function createMockResponse() {
  let statusCode: number | undefined;
  let body: unknown;
  const listeners = new Map<string, ((...args: unknown[]) => void)[]>();
  const headers = new Map<string, string>();
  const fakeRes: Partial<Response> = {
    status(code: number) {
      statusCode = code;
      return fakeRes as Response;
    },
    json(payload: unknown) {
      body = payload;
      const finishListeners = listeners.get("finish") ?? [];
      finishListeners.forEach((listener) => listener());
      return fakeRes as Response;
    },
    setHeader(name: string, value: string | number | string[]) {
      headers.set(name, String(value));
      return fakeRes as Response;
    },
    getHeader(name: string) {
      return headers.get(name);
    },
    header() {
      return fakeRes as Response;
    },
    once(event: string, callback: (...args: unknown[]) => void) {
      const existing = listeners.get(event) ?? [];
      listeners.set(event, [...existing, callback]);
      return fakeRes as Response;
    },
    on(event: string, callback: (...args: unknown[]) => void) {
      const existing = listeners.get(event) ?? [];
      listeners.set(event, [...existing, callback]);
      return fakeRes as Response;
    },
    emit(event: string, ...args: unknown[]) {
      const eventListeners = listeners.get(event) ?? [];
      eventListeners.forEach((listener) => listener(...args));
      return true;
    },
    send(payload: unknown) {
      body = payload;
      const finishListeners = listeners.get("finish") ?? [];
      finishListeners.forEach((listener) => listener());
      return fakeRes as Response;
    },
  };
  return {
    res: fakeRes as Response,
    getStatusCode: () => statusCode,
    getBody: () => body,
    getHeader: (name: string) => headers.get(name),
  };
}

function createTokenRequest(ip: string, token: string) {
  return {
    ip,
    headers: {},
    params: {},
    body: { token },
    app: { get: () => false, settings: {} } as unknown,
  } as Partial<Request> as Request;
}

function createResendRequest(
  ip: string,
  userId: string,
  tenantId: string,
) {
  return {
    ip,
    headers: {},
    params: { id: userId },
    body: {},
    tenantId,
    app: { get: () => false, settings: {} } as unknown,
  } as Partial<Request> as Request;
}

async function invokeLimiter(
  limiter: InviteRateLimiters[keyof InviteRateLimiters],
  req: Request,
): Promise<InvokeResult> {
  return new Promise<InvokeResult>((resolve) => {
    const { res, getStatusCode, getBody } = createMockResponse();
    let nextCalls = 0;
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve({
        status: getStatusCode(),
        body: getBody() as InvokeResult["body"],
        nextCalls,
      });
    };
    res.on("finish", finish);
    void limiter(req, res, () => {
      nextCalls += 1;
      finish();
    });
  });
}

test("invitation rate limits use independent buckets per operation", async (t) => {
  const IP = "203.0.113.7";
  const TOKEN = "example-invite-token";

  await t.test(
    "exhausting validate-invite does NOT block resend-invitation",
    async () => {
      const limiters = createInviteRateLimiters();
      const validateReq = createTokenRequest(IP, TOKEN);

      for (let i = 0; i < INVITE_VALIDATE_MAX; i += 1) {
        const result = await invokeLimiter(limiters.validateInvite, validateReq);
        assert.equal(result.status, undefined);
        assert.equal(result.nextCalls, 1);
      }

      const exhausted = await invokeLimiter(
        limiters.validateInvite,
        validateReq,
      );
      assert.equal(exhausted.status, 429);

      const resend = await invokeLimiter(
        limiters.resendInvitation,
        createResendRequest(IP, "user-1", "tenant-1"),
      );
      assert.equal(resend.status, undefined);
      assert.equal(resend.nextCalls, 1);
    },
  );

  await t.test(
    "exhausting validate-invite does NOT block set-password-from-invite",
    async () => {
      const limiters = createInviteRateLimiters();
      const validateReq = createTokenRequest(IP, TOKEN);

      for (let i = 0; i < INVITE_VALIDATE_MAX; i += 1) {
        await invokeLimiter(limiters.validateInvite, validateReq);
      }
      assert.equal(
        (await invokeLimiter(limiters.validateInvite, validateReq)).status,
        429,
      );

      const setPassword = await invokeLimiter(
        limiters.setPasswordFromInvite,
        createTokenRequest(IP, TOKEN),
      );
      assert.equal(setPassword.status, undefined);
      assert.equal(setPassword.nextCalls, 1);
    },
  );

  await t.test(
    "exhausting resend-invitation does NOT block validate-invite",
    async () => {
      const limiters = createInviteRateLimiters();
      const resendRequest = createResendRequest(IP, "user-1", "tenant-1");

      for (let i = 0; i < INVITE_RESEND_MAX; i += 1) {
        const result = await invokeLimiter(
          limiters.resendInvitation,
          resendRequest,
        );
        assert.equal(result.status, undefined);
      }
      assert.equal(
        (await invokeLimiter(limiters.resendInvitation, resendRequest)).status,
        429,
      );

      const validate = await invokeLimiter(
        limiters.validateInvite,
        createTokenRequest(IP, TOKEN),
      );
      assert.equal(validate.status, undefined);
      assert.equal(validate.nextCalls, 1);
    },
  );

  await t.test(
    "exhausting set-password-from-invite does NOT block validate-invite",
    async () => {
      const limiters = createInviteRateLimiters();
      const setPasswordRequest = createTokenRequest(IP, TOKEN);

      for (let i = 0; i < INVITE_SET_PASSWORD_MAX; i += 1) {
        const result = await invokeLimiter(
          limiters.setPasswordFromInvite,
          setPasswordRequest,
        );
        assert.equal(result.status, undefined);
      }
      assert.equal(
        (
          await invokeLimiter(
            limiters.setPasswordFromInvite,
            setPasswordRequest,
          )
        ).status,
        429,
      );

      const validate = await invokeLimiter(
        limiters.validateInvite,
        createTokenRequest(IP, TOKEN),
      );
      assert.equal(validate.status, undefined);
      assert.equal(validate.nextCalls, 1);
    },
  );
});

test("each invitation endpoint is independently rate limited", async (t) => {
  const IP = "203.0.113.8";

  await t.test("validate-invite returns 429 when its own limit is exceeded", async () => {
    const limiters = createInviteRateLimiters();
    const request = createTokenRequest(IP, "validate-token");
    let blocked: InvokeResult | undefined;

    for (let i = 0; i <= INVITE_VALIDATE_MAX; i += 1) {
      const result = await invokeLimiter(limiters.validateInvite, request);
      if (result.status === 429) blocked = result;
    }

    assert.ok(blocked, "validate-invite should eventually return 429");
    assert.equal(blocked?.body?.success, false);
    assert.equal(blocked?.body?.error, "RATE_LIMITED");
    assert.equal(blocked?.body?.message, INVITE_VALIDATE_MESSAGE);
    assert.ok((blocked?.body?.retryAfterSeconds ?? 0) > 0);
  });

  await t.test(
    "set-password-from-invite returns 429 when its own limit is exceeded",
    async () => {
      const limiters = createInviteRateLimiters();
      const request = createTokenRequest(IP, "set-password-token");
      let blocked: InvokeResult | undefined;

      for (let i = 0; i <= INVITE_SET_PASSWORD_MAX; i += 1) {
        const result = await invokeLimiter(
          limiters.setPasswordFromInvite,
          request,
        );
        if (result.status === 429) blocked = result;
      }

      assert.ok(blocked, "set-password-from-invite should eventually return 429");
      assert.equal(blocked?.body?.success, false);
      assert.equal(blocked?.body?.error, "RATE_LIMITED");
      assert.equal(blocked?.body?.message, INVITE_SET_PASSWORD_MESSAGE);
      assert.ok((blocked?.body?.retryAfterSeconds ?? 0) > 0);
    },
  );

  await t.test(
    "resend-invitation returns 429 when its own limit is exceeded",
    async () => {
      const limiters = createInviteRateLimiters();
      const request = createResendRequest(IP, "user-2", "tenant-2");
      let blocked: InvokeResult | undefined;

      for (let i = 0; i <= INVITE_RESEND_MAX; i += 1) {
        const result = await invokeLimiter(limiters.resendInvitation, request);
        if (result.status === 429) blocked = result;
      }

      assert.ok(blocked, "resend-invitation should eventually return 429");
      assert.equal(blocked?.body?.success, false);
      assert.equal(blocked?.body?.error, "RATE_LIMITED");
      assert.equal(blocked?.body?.message, INVITE_RESEND_MESSAGE);
      assert.ok((blocked?.body?.retryAfterSeconds ?? 0) > 0);
    },
  );
});

test("invitation rate limits use separate Redis store prefixes and hashed keys", async (t) => {
  const IP = "203.0.113.9";
  const TOKEN = "opaque-invite-token-that-must-never-leak";

  await t.test("store prefixes are distinct per operation", () => {
    assert.notEqual(INVITE_VALIDATE_STORE_PREFIX, INVITE_SET_PASSWORD_STORE_PREFIX);
    assert.notEqual(INVITE_VALIDATE_STORE_PREFIX, INVITE_RESEND_STORE_PREFIX);
    assert.notEqual(INVITE_SET_PASSWORD_STORE_PREFIX, INVITE_RESEND_STORE_PREFIX);
  });

  await t.test("effective Redis keys cannot collide across operations", () => {
    const validateKey = buildInviteRateLimitRedisKey(
      INVITE_VALIDATE_STORE_PREFIX,
      inviteTokenKeyGenerator,
      createTokenRequest(IP, TOKEN),
    );
    const setPasswordKey = buildInviteRateLimitRedisKey(
      INVITE_SET_PASSWORD_STORE_PREFIX,
      inviteTokenKeyGenerator,
      createTokenRequest(IP, TOKEN),
    );
    const resendKey = buildInviteRateLimitRedisKey(
      INVITE_RESEND_STORE_PREFIX,
      inviteResendKeyGenerator,
      createResendRequest(IP, "user-3", "tenant-3"),
    );

    assert.ok(validateKey.startsWith(INVITE_VALIDATE_STORE_PREFIX));
    assert.ok(setPasswordKey.startsWith(INVITE_SET_PASSWORD_STORE_PREFIX));
    assert.ok(resendKey.startsWith(INVITE_RESEND_STORE_PREFIX));

    assert.notEqual(validateKey, setPasswordKey);
    assert.notEqual(validateKey, resendKey);
    assert.notEqual(setPasswordKey, resendKey);
  });

  await t.test("raw tokens and identifiers are never present in keys or messages", () => {
    const validateKey = inviteTokenKeyGenerator(createTokenRequest(IP, TOKEN));
    const setPasswordKey = inviteTokenKeyGenerator(
      createTokenRequest(IP, TOKEN),
    );
    const resendKey = inviteResendKeyGenerator(
      createResendRequest(IP, "user-3", "tenant-3"),
    );

    for (const opaque of [
      TOKEN,
      "user-3",
      "tenant-3",
      "opaque-invite-token-that-must-never-leak",
    ]) {
      assert.ok(!validateKey.includes(opaque));
      assert.ok(!setPasswordKey.includes(opaque));
      assert.ok(!resendKey.includes(opaque));
    }

    assert.match(validateKey, /^[0-9a-f]{64}:[0-9a-f]{64}$/);
    assert.match(resendKey, /^[0-9a-f]{64}:[0-9a-f]{64}:[0-9a-f]{64}$/);

    const messages = [
      INVITE_VALIDATE_MESSAGE,
      INVITE_SET_PASSWORD_MESSAGE,
      INVITE_RESEND_MESSAGE,
    ];
    for (const message of messages) {
      assert.ok(!message.includes(TOKEN));
    }
  });
});