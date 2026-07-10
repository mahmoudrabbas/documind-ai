import test from "node:test";
import assert from "node:assert";
import { authorize } from "./authorize.middleware.js";
import { AppError } from "../errors/AppError.js";
import { FORBIDDEN, UNAUTHORIZED } from "../errors/errorCodes.js";
test("authorize middleware", async (t) => {
    let mockReq;
    let mockRes;
    let mockNext;
    const createMocks = () => {
        mockReq = { auth: undefined };
        mockRes = {};
        const mockNextImpl = function (error) {
            mockNextImpl.mock.calls.push([error]);
        };
        mockNextImpl.mock = { calls: [] };
        mockNext = mockNextImpl;
    };
    await t.test("throws when no allowed roles are provided", () => {
        assert.throws(() => {
            authorize();
        }, {
            name: "Error",
            message: "authorize middleware requires at least one role",
        });
    });
    await t.test("allows requests when the user role matches a permitted role", () => {
        createMocks();
        mockReq.auth = { role: "COMPANY_ADMIN", userId: "user-1", tenantId: "tenant-1" };
        const middleware = authorize("COMPANY_ADMIN", "SUPER_ADMIN");
        middleware(mockReq, mockRes, mockNext);
        assert.strictEqual(mockNext.mock.calls.length, 1);
        assert.strictEqual(mockNext.mock.calls[0][0], undefined);
    });
    await t.test("allows requests when the user role matches one of several permitted roles", () => {
        createMocks();
        mockReq.auth = { role: "EMPLOYEE", userId: "user-2", tenantId: "tenant-2" };
        const middleware = authorize("COMPANY_ADMIN", "EMPLOYEE");
        middleware(mockReq, mockRes, mockNext);
        assert.strictEqual(mockNext.mock.calls.length, 1);
        assert.strictEqual(mockNext.mock.calls[0][0], undefined);
    });
    await t.test("rejects requests when authentication is missing", () => {
        createMocks();
        const middleware = authorize("COMPANY_ADMIN");
        middleware(mockReq, mockRes, mockNext);
        assert.strictEqual(mockNext.mock.calls.length, 1);
        const error = mockNext.mock.calls[0][0];
        assert(error instanceof AppError);
        assert.strictEqual(error.statusCode, 401);
        assert.strictEqual(error.code, UNAUTHORIZED);
    });
    await t.test("rejects requests when the user's role is missing", () => {
        createMocks();
        mockReq.auth = { userId: "user-3", tenantId: "tenant-3" };
        const middleware = authorize("COMPANY_ADMIN");
        middleware(mockReq, mockRes, mockNext);
        assert.strictEqual(mockNext.mock.calls.length, 1);
        const error = mockNext.mock.calls[0][0];
        assert(error instanceof AppError);
        assert.strictEqual(error.statusCode, 403);
        assert.strictEqual(error.code, FORBIDDEN);
        assert(error.message.includes("COMPANY_ADMIN"));
    });
    await t.test("rejects requests when the user role is not permitted", () => {
        createMocks();
        mockReq.auth = { role: "EMPLOYEE", userId: "user-4", tenantId: "tenant-4" };
        const middleware = authorize("SUPER_ADMIN", "COMPANY_ADMIN");
        middleware(mockReq, mockRes, mockNext);
        assert.strictEqual(mockNext.mock.calls.length, 1);
        const error = mockNext.mock.calls[0][0];
        assert(error instanceof AppError);
        assert.strictEqual(error.statusCode, 403);
        assert.strictEqual(error.code, FORBIDDEN);
    });
});
//# sourceMappingURL=authorize.middleware.test.js.map