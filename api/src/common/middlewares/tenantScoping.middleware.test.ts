import test from "node:test";
import assert from "node:assert";
import type { Request, Response } from "express";
import { tenantScoping } from "./tenantScoping.middleware.js";
import { AppError } from "../errors/AppError.js";

interface MockNext {
  (error?: unknown): void;
  mock: { calls: unknown[][] };
}

test("tenantScoping middleware", async (t) => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: MockNext;

  const createMocks = () => {
    mockReq = {
      auth: undefined,
      log: undefined,
      tenantId: undefined,
    };
    mockRes = {};
    const mockNextImpl: MockNext = function (error?: unknown) {
      mockNextImpl.mock.calls.push([error]);
    };
    mockNextImpl.mock = { calls: [] };
    mockNext = mockNextImpl;
  };

  await t.test("successful cases", async (tc) => {
    await tc.test(
      "should extract tenantId and call next() when auth and tenantId present",
      () => {
        createMocks();
        const testTenantId = "tenant-123";
        mockReq.auth = {
          userId: "user-456",
          tenantId: testTenantId,
          role: "admin",
          email: "user@example.com",
        };

        tenantScoping(mockReq as Request, mockRes as Response, mockNext);

        assert.strictEqual(mockReq.tenantId, testTenantId);
        assert.strictEqual(mockNext.mock.calls.length, 1);
        assert.strictEqual(mockNext.mock.calls[0][0], undefined);
      }
    );

    await tc.test(
      "should work with minimal auth object (tenantId only)",
      () => {
        createMocks();
        const testTenantId = "tenant-999";
        mockReq.auth = {
          userId: "user-123",
          tenantId: testTenantId,
        };

        tenantScoping(mockReq as Request, mockRes as Response, mockNext);

        assert.strictEqual(mockReq.tenantId, testTenantId);
        assert.strictEqual(mockNext.mock.calls.length, 1);
      }
    );

    await tc.test(
      "should enhance request logging with tenantId",
      () => {
        createMocks();
        const testTenantId = "tenant-555";
        const childCalls: unknown[] = [];
        mockReq.auth = {
          userId: "user-123",
          tenantId: testTenantId,
        };
        mockReq.log = {
          child: (obj: Record<string, unknown>) => {
            childCalls.push(obj);
            return {};
          },
        } as unknown;

        tenantScoping(mockReq as Request, mockRes as Response, mockNext);

        assert.strictEqual(childCalls.length, 1);
        assert.deepStrictEqual(childCalls[0], { tenantId: testTenantId });
        assert.strictEqual(mockNext.mock.calls.length, 1);
      }
    );

    await tc.test("should work when req.log is undefined", () => {
      createMocks();
      const testTenantId = "tenant-aaa";
      mockReq.auth = {
        userId: "user-123",
        tenantId: testTenantId,
      };
      mockReq.log = undefined;

      tenantScoping(mockReq as Request, mockRes as Response, mockNext);

      assert.strictEqual(mockReq.tenantId, testTenantId);
      assert.strictEqual(mockNext.mock.calls.length, 1);
    });
  });

  await t.test("error cases - missing auth", async (tc) => {
    await tc.test("should throw 401 when req.auth is undefined", () => {
      createMocks();
      mockReq.auth = undefined;

      tenantScoping(mockReq as Request, mockRes as Response, mockNext);

      assert.strictEqual(mockNext.mock.calls.length, 1);
      const error = mockNext.mock.calls[0][0];
      assert(error instanceof AppError);
      assert.strictEqual(error.statusCode, 401);
      assert.strictEqual(error.code, "UNAUTHORIZED");
    });

    await tc.test("should throw 401 when req.auth is null", () => {
      createMocks();
      (mockReq.auth as unknown) = null;

      tenantScoping(mockReq as Request, mockRes as Response, mockNext);

      assert.strictEqual(mockNext.mock.calls.length, 1);
      const error = mockNext.mock.calls[0][0];
      assert(error instanceof AppError);
      assert.strictEqual(error.statusCode, 401);
    });
  });

  await t.test("error cases - missing tenantId", async (tc) => {
    await tc.test("should throw 401 when tenantId is missing from auth", () => {
      createMocks();
      const invalidAuth: unknown = {
        userId: "user-123",
        tenantId: undefined,
        role: "admin",
        email: "user@example.com",
      };
      mockReq.auth = invalidAuth as typeof mockReq.auth;

      tenantScoping(mockReq as Request, mockRes as Response, mockNext);

      assert.strictEqual(mockNext.mock.calls.length, 1);
      const error = mockNext.mock.calls[0][0];
      assert(error instanceof AppError);
      assert.strictEqual(error.statusCode, 401);
      assert.strictEqual(error.code, "UNAUTHORIZED");
      assert(error.message.includes("Tenant context required"));
    });

    await tc.test("should throw 401 when tenantId is empty string", () => {
      createMocks();
      const invalidAuth: unknown = {
        userId: "user-123",
        tenantId: "",
        role: "admin",
      };
      mockReq.auth = invalidAuth as typeof mockReq.auth;

      tenantScoping(mockReq as Request, mockRes as Response, mockNext);

      assert.strictEqual(mockNext.mock.calls.length, 1);
      const error = mockNext.mock.calls[0][0];
      assert(error instanceof AppError);
      assert.strictEqual(error.statusCode, 401);
    });

    await tc.test("should throw 401 when tenantId is null", () => {
      createMocks();
      const invalidAuth: unknown = {
        userId: "user-123",
        tenantId: null,
        role: "admin",
      };
      mockReq.auth = invalidAuth as typeof mockReq.auth;

      tenantScoping(mockReq as Request, mockRes as Response, mockNext);

      assert.strictEqual(mockNext.mock.calls.length, 1);
      const error = mockNext.mock.calls[0][0];
      assert(error instanceof AppError);
      assert.strictEqual(error.statusCode, 401);
    });

    await tc.test("should throw 401 when tenantId is undefined", () => {
      createMocks();
      const invalidAuth: unknown = {
        userId: "user-123",
        tenantId: undefined,
      };
      mockReq.auth = invalidAuth as typeof mockReq.auth;

      tenantScoping(mockReq as Request, mockRes as Response, mockNext);

      assert.strictEqual(mockNext.mock.calls.length, 1);
      const error = mockNext.mock.calls[0][0];
      assert(error instanceof AppError);
      assert.strictEqual(error.statusCode, 401);
    });
  });

  await t.test("error cases - various tenantId formats", async (tc) => {
    await tc.test("should accept UUID format tenantId", () => {
      createMocks();
      const uuidTenantId = "550e8400-e29b-41d4-a716-446655440000";
      mockReq.auth = {
        userId: "user-123",
        tenantId: uuidTenantId,
      };

      tenantScoping(mockReq as Request, mockRes as Response, mockNext);

      assert.strictEqual(mockReq.tenantId, uuidTenantId);
      assert.strictEqual(mockNext.mock.calls.length, 1);
    });

    await tc.test("should accept MongoDB ObjectId format tenantId", () => {
      createMocks();
      const mongoIdTenantId = "507f1f77bcf86cd799439011";
      mockReq.auth = {
        userId: "user-123",
        tenantId: mongoIdTenantId,
      };

      tenantScoping(mockReq as Request, mockRes as Response, mockNext);

      assert.strictEqual(mockReq.tenantId, mongoIdTenantId);
      assert.strictEqual(mockNext.mock.calls.length, 1);
    });

    await tc.test("should accept slug format tenantId", () => {
      createMocks();
      const slugTenantId = "my-company-tenant";
      mockReq.auth = {
        userId: "user-123",
        tenantId: slugTenantId,
      };

      tenantScoping(mockReq as Request, mockRes as Response, mockNext);

      assert.strictEqual(mockReq.tenantId, slugTenantId);
      assert.strictEqual(mockNext.mock.calls.length, 1);
    });
  });

  await t.test("error handling", async (tc) => {
    await tc.test(
      "should pass errors through next() for error handling middleware",
      () => {
        createMocks();
        mockReq.auth = undefined;

        tenantScoping(mockReq as Request, mockRes as Response, mockNext);

        assert.strictEqual(mockNext.mock.calls.length, 1);
        assert(mockNext.mock.calls[0][0] instanceof AppError);
      }
    );

    await tc.test("should not throw synchronously, always call next()", () => {
      createMocks();
      const invalidAuth: unknown = { userId: "user-123", tenantId: undefined };
      mockReq.auth = invalidAuth as typeof mockReq.auth;

      assert.doesNotThrow(() => {
        tenantScoping(mockReq as Request, mockRes as Response, mockNext);
      });

      assert(mockNext.mock.calls.length > 0);
    });
  });

  await t.test("integration with authenticate middleware flow", async (tc) => {
    await tc.test(
      "should work in typical authenticate -> tenantScoping flow",
      () => {
        createMocks();
        mockReq.auth = {
          userId: "user-123",
          tenantId: "tenant-abc",
          role: "user",
          email: "user@example.com",
        };

        tenantScoping(mockReq as Request, mockRes as Response, mockNext);

        assert.strictEqual(mockReq.tenantId, "tenant-abc");
        assert.strictEqual(mockReq.auth?.userId, "user-123");
        assert.strictEqual(mockNext.mock.calls.length, 1);
      }
    );

    await tc.test(
      "should reject tokens from authenticate that lack tenantId",
      () => {
        createMocks();
        mockReq.auth = {
          userId: "user-123",
          tenantId: undefined,
          role: "user",
          email: "user@example.com",
        } as unknown as Record<string, unknown>;

        tenantScoping(mockReq as Request, mockRes as Response, mockNext);

        assert.strictEqual(mockNext.mock.calls.length, 1);
        assert(mockNext.mock.calls[0][0] instanceof AppError);
      }
    );
  });
});
