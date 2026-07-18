import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ImportBatchState } from "../../../../db/models/employeeImportBatch.model.js";
import type { ImportRowState } from "../../../../db/models/employeeImportRow.model.js";

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const mockSession = vi.hoisted(() => ({
  withTransaction: vi.fn(),
  endSession: vi.fn(),
}));

/**
 * Returns a lightweight ObjectId-like object.  Must be a simple function so
 * the Proxy can intercept both `new ObjectId(...)` and `ObjectId(...)` calls
 * and return an object (the `construct` / `apply` trap requires `object`).
 */
function objectIdFactory(id?: string) {
  return { toString: () => id ?? "mock-object-id", _id: id ?? "mock-object-id" } as never;
}

const mockMongoose = vi.hoisted(() => ({
  startSession: vi.fn().mockResolvedValue(mockSession),
  Types: {
    ObjectId: new Proxy(objectIdFactory, {
      construct(_target, args: string[]) {
        return { toString: () => args[0] ?? "mock-object-id", _id: args[0] ?? "mock-object-id" } as never;
      },
      apply(_target, _thisArg, args: string[]) {
        return { toString: () => args[0] ?? "mock-object-id", _id: args[0] ?? "mock-object-id" } as never;
      },
    }) as unknown as { new (id?: string): ReturnType<typeof objectIdFactory>; (id?: string): ReturnType<typeof objectIdFactory> },
  },
}));

const mockBatchModel = vi.hoisted(() => ({
  create: vi.fn(),
  findById: vi.fn(),
  findByIdAndUpdate: vi.fn(),
  findOneAndUpdate: vi.fn(),
  find: vi.fn(),
  countDocuments: vi.fn(),
}));

const mockRowModel = vi.hoisted(() => ({
  insertMany: vi.fn(),
  findOneAndUpdate: vi.fn(),
}));

const mockJobDispatcher = vi.hoisted(() => ({
  enqueue: vi.fn(),
}));

const mockAuditWriter = vi.hoisted(() => ({
  write: vi.fn().mockResolvedValue(true),
}));

vi.mock("mongoose", () => ({ default: mockMongoose, ...mockMongoose }));

vi.mock("../../../../db/models/employeeImportBatch.model.js", () => ({
  default: mockBatchModel,
}));

vi.mock("../../../../db/models/employeeImportRow.model.js", () => ({
  default: mockRowModel,
}));

vi.mock("../../../jobs/jobDispatcher.js", () => ({
  getApiJobDispatcher: vi.fn(() => mockJobDispatcher),
}));

vi.mock("../../../../common/observability/index.js", () => ({
  getAuditWriter: vi.fn(() => mockAuditWriter),
}));

// ─── Imports under test ───────────────────────────────────────────────────────

import { ImportBatchService, validateTransition } from "../importBatch.service.js";
import { AppError } from "../../../../common/errors/AppError.js";

// ─── Helpers ───────────────────────────────────────────────────────────────────

const TENANT_ID = "507f1f77bcf86cd799439011";
const BATCH_ID = "507f1f77bcf86cd799439012";
const USER_ID = "507f1f77bcf86cd799439013";

interface BatchDoc {
  _id: string;
  id: string;
  tenantId: string;
  createdBy: string;
  originalFileName: string;
  fileChecksum: string;
  fileSizeBytes?: number;
  totalRows: number;
  state: ImportBatchState;
  mapping: {
    columnMapping: Record<string, string>;
    unmappedColumns: string[];
    confidence: "high" | "medium" | "low";
  };
  summary: {
    valid: number;
    warning: number;
    invalid: number;
    skipped: number;
    created: number;
    failed: number;
  };
  idempotencyKey: string;
  processingStartedAt?: Date;
  completedAt?: Date;
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
  toString: () => string;
  toJSON: () => Record<string, unknown>;
}

function importBatchFactory(overrides: Partial<BatchDoc> = {}): BatchDoc {
  const now = new Date();
  return {
    _id: BATCH_ID,
    id: BATCH_ID,
    tenantId: TENANT_ID,
    createdBy: USER_ID,
    originalFileName: "employees.xlsx",
    fileChecksum: "abc123checksum",
    fileSizeBytes: 1024,
    totalRows: 5,
    state: "UPLOADED",
    mapping: {
      columnMapping: {},
      unmappedColumns: [],
      confidence: "medium",
    },
    summary: {
      valid: 0,
      warning: 0,
      invalid: 0,
      skipped: 0,
      created: 0,
      failed: 0,
    },
    idempotencyKey: "test-idempotency-key",
    createdAt: now,
    updatedAt: now,
    toString() {
      return this._id;
    },
    toJSON() {
      return { ...this, _id: this._id, id: this._id };
    },
    ...overrides,
  };
}

function makeRowDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: "row-id",
    batchId: BATCH_ID,
    tenantId: TENANT_ID,
    rowNumber: 1,
    rawData: { Name: "Alice" },
    state: "PENDING",
    checksum: "row-checksum",
    idempotencyKey: "batch-ik:row:1",
    ...overrides,
  };
}

/**
 * Builds a thenable Mongoose-query-like chain that resolves to `result` when
 * awaited.  Each chaining method returns itself so `.sort().skip().limit()`
 * keeps the reference.
 */
function queryChain<T>(result: T) {
  const thenable = Promise.resolve(result);
  const q = {
    sort: vi.fn().mockReturnThis(),
    skip: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    then: thenable.then.bind(thenable),
    catch: thenable.catch.bind(thenable),
    finally: thenable.finally.bind(thenable),
    [Symbol.toStringTag]: "Query",
  };
  q.sort.mockReturnValue(q);
  q.skip.mockReturnValue(q);
  q.limit.mockReturnValue(q);
  return q as typeof q & PromiseLike<T>;
}

/**
 * Helper that invokes `fn` and returns the caught error, or throws if `fn`
 * didn't throw.  Useful when asserting error shape with `toMatchObject`.
 */
function catchError(fn: () => void): unknown {
  try {
    fn();
  } catch (e) {
    return e;
  }
  throw new Error("Expected function to throw but it did not");
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSession.withTransaction.mockImplementation(
    async <T>(fn: () => Promise<T>): Promise<T> => fn(),
  );
  mockSession.endSession.mockResolvedValue(undefined);
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("ImportBatchService", () => {
  describe("createBatch", () => {
    it("creates batch + rows, returns correct count", async () => {
      const batchDoc = importBatchFactory();
      mockBatchModel.create.mockResolvedValue([batchDoc]);
      mockRowModel.insertMany.mockResolvedValue([makeRowDoc()]);

      const result = await ImportBatchService.createBatch({
        tenantId: TENANT_ID,
        createdBy: USER_ID,
        originalFileName: "employees.xlsx",
        fileChecksum: "abc123checksum",
        fileSizeBytes: 1024,
        totalRows: 1,
        rows: [
          {
            rowNumber: 1,
            rawData: { Name: "Alice" },
            checksum: "row-checksum",
          },
        ],
      });

      expect(result.batch._id).toBe(BATCH_ID);
      expect(result.rowCount).toBe(1);
      expect(mockMongoose.startSession).toHaveBeenCalled();
      expect(mockSession.withTransaction).toHaveBeenCalled();
      expect(mockSession.endSession).toHaveBeenCalled();
      expect(mockAuditWriter.write).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "BATCH_CREATED",
          resourceType: "employeeImportBatch",
          resourceId: BATCH_ID,
          tenantId: TENANT_ID,
          actorId: USER_ID,
        }),
      );
    });

    it("generates expected idempotencyKey", async () => {
      mockBatchModel.create.mockImplementation(
        async (docs: Array<Record<string, unknown>>) => {
          expect(docs[0].idempotencyKey).toBeTruthy();
          expect(typeof docs[0].idempotencyKey).toBe("string");
          expect(docs[0].idempotencyKey).toHaveLength(64);
          return [{ ...importBatchFactory(), idempotencyKey: docs[0].idempotencyKey }];
        },
      );
      mockRowModel.insertMany.mockResolvedValue([makeRowDoc()]);

      const result = await ImportBatchService.createBatch({
        tenantId: TENANT_ID,
        createdBy: USER_ID,
        originalFileName: "employees.xlsx",
        fileChecksum: "abc123checksum",
        totalRows: 1,
        rows: [
          {
            rowNumber: 1,
            rawData: { Name: "Alice" },
            checksum: "row-checksum",
          },
        ],
      });

      expect(result.batch.idempotencyKey).toHaveLength(64);
    });

    it("wraps unknown errors in AppError", async () => {
      mockBatchModel.create.mockRejectedValue(new Error("DB connection error"));

      await expect(
        ImportBatchService.createBatch({
          tenantId: TENANT_ID,
          createdBy: USER_ID,
          originalFileName: "employees.xlsx",
          fileChecksum: "abc123checksum",
          totalRows: 0,
          rows: [],
        }),
      ).rejects.toMatchObject({
        statusCode: 500,
        code: "BATCH_CREATION_FAILED",
      });
    });
  });

  describe("updateMapping", () => {
    it("updates mapping and transitions to PARSED", async () => {
      const batchDoc = importBatchFactory({ state: "UPLOADED" });
      mockBatchModel.findById.mockResolvedValue(batchDoc);

      const updatedDoc = importBatchFactory({
        state: "PARSED",
        mapping: {
          columnMapping: { Name: "fullName", Email: "email" },
          unmappedColumns: ["Notes"],
          confidence: "high",
        },
      });
      mockBatchModel.findByIdAndUpdate.mockResolvedValue(updatedDoc);

      const result = await ImportBatchService.updateMapping(BATCH_ID, {
        columnMapping: { Name: "fullName", Email: "email" },
        unmappedColumns: ["Notes"],
        confidence: "high",
      });

      expect(result.state).toBe("PARSED");
      expect(result.mapping.confidence).toBe("high");
      expect(mockBatchModel.findByIdAndUpdate).toHaveBeenCalledWith(
        BATCH_ID,
        {
          $set: {
            mapping: {
              columnMapping: { Name: "fullName", Email: "email" },
              unmappedColumns: ["Notes"],
              confidence: "high",
            },
            state: "PARSED",
          },
        },
        { new: true },
      );
      expect(mockAuditWriter.write).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "BATCH_MAPPING_UPDATED",
        }),
      );
    });

    it("throws on non-existent batch (404)", async () => {
      mockBatchModel.findById.mockResolvedValue(null);

      await expect(
        ImportBatchService.updateMapping(BATCH_ID, {
          columnMapping: {},
          unmappedColumns: [],
          confidence: "high",
        }),
      ).rejects.toMatchObject({
        statusCode: 404,
        code: "NOT_FOUND",
      });
    });

    it("throws on invalid state transition", async () => {
      const batchDoc = importBatchFactory({ state: "QUEUED" });
      mockBatchModel.findById.mockResolvedValue(batchDoc);

      await expect(
        ImportBatchService.updateMapping(BATCH_ID, {
          columnMapping: {},
          unmappedColumns: [],
          confidence: "high",
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        code: "INVALID_STATE_TRANSITION",
      });
    });
  });

  describe("preparePreview", () => {
    it("updates summary and transitions to PREVIEW_READY", async () => {
      const batchDoc = importBatchFactory({ state: "PARSED" });
      mockBatchModel.findById.mockResolvedValue(batchDoc);

      const updatedDoc = importBatchFactory({
        state: "PREVIEW_READY",
        summary: { valid: 8, warning: 1, invalid: 1, skipped: 0, created: 0, failed: 0 },
      });
      mockBatchModel.findByIdAndUpdate.mockResolvedValue(updatedDoc);

      const result = await ImportBatchService.preparePreview(BATCH_ID, {
        valid: 8,
        warning: 1,
        invalid: 1,
      });

      expect(result.state).toBe("PREVIEW_READY");
      expect(result.summary.valid).toBe(8);
      expect(mockAuditWriter.write).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "BATCH_PREVIEW_READY",
        }),
      );
    });

    it("rejects when batch is in QUEUED state", async () => {
      const batchDoc = importBatchFactory({ state: "QUEUED" });
      mockBatchModel.findById.mockResolvedValue(batchDoc);

      await expect(
        ImportBatchService.preparePreview(BATCH_ID, {
          valid: 5,
          warning: 0,
          invalid: 0,
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        code: "INVALID_STATE_TRANSITION",
      });
    });
  });

  describe("confirmBatch", () => {
    it("atomically transitions to QUEUED and enqueues job", async () => {
      const updatedDoc = importBatchFactory({
        state: "QUEUED",
        idempotencyKey: "batch-ik-123",
      });
      mockBatchModel.findOneAndUpdate.mockResolvedValue(updatedDoc);

      const jobResult = {
        ok: true,
        jobId: "job-001",
        idempotencyKey: "batch-ik-123",
        deduplicated: false,
      };
      mockJobDispatcher.enqueue.mockResolvedValue(jobResult);

      const result = await ImportBatchService.confirmBatch(BATCH_ID, USER_ID);

      expect(result.batch.state).toBe("QUEUED");
      expect(result.jobResult).toEqual(jobResult);
      expect(mockBatchModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: expect.any(Object), state: "PREVIEW_READY" },
        { $set: { state: "QUEUED" } },
        { new: true },
      );
      expect(mockJobDispatcher.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          jobType: "import.employee.batch",
          idempotencyKey: "batch-ik-123",
          tenantId: TENANT_ID,
          actorId: USER_ID,
        }),
      );
      expect(mockAuditWriter.write).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "BATCH_CONFIRMED",
          metadata: expect.objectContaining({
            deduplicated: false,
          }),
        }),
      );
    });

    it("returns idempotent result when batch already confirmed", async () => {
      mockBatchModel.findOneAndUpdate.mockResolvedValue(null);
      mockBatchModel.findById.mockResolvedValue(
        importBatchFactory({ state: "QUEUED" }),
      );

      const result = await ImportBatchService.confirmBatch(BATCH_ID, USER_ID);

      expect(result.jobResult).toEqual({ ok: true, deduplicated: true });
      expect(result.batch.state).toBe("QUEUED");
    });

    it("throws 404 when batch does not exist", async () => {
      mockBatchModel.findOneAndUpdate.mockResolvedValue(null);
      mockBatchModel.findById.mockResolvedValue(null);

      await expect(
        ImportBatchService.confirmBatch(BATCH_ID, USER_ID),
      ).rejects.toMatchObject({
        statusCode: 404,
        code: "NOT_FOUND",
      });
    });

    it("throws 400 for invalid state transition", async () => {
      mockBatchModel.findOneAndUpdate.mockResolvedValue(null);
      mockBatchModel.findById.mockResolvedValue(
        importBatchFactory({ state: "UPLOADED" }),
      );

      await expect(
        ImportBatchService.confirmBatch(BATCH_ID, USER_ID),
      ).rejects.toMatchObject({
        statusCode: 400,
        code: "INVALID_STATE_TRANSITION",
      });
    });

    it("returns jobResult with error when job enqueue fails", async () => {
      mockBatchModel.findOneAndUpdate.mockResolvedValue(
        importBatchFactory({ state: "QUEUED" }),
      );
      mockJobDispatcher.enqueue.mockResolvedValue({
        ok: false,
        error: "Queue is full",
      });

      const result = await ImportBatchService.confirmBatch(BATCH_ID, USER_ID);

      expect(result.batch.state).toBe("QUEUED");
      expect(result.jobResult).toEqual({
        ok: false,
        error: "Queue is full",
      });
    });
  });

  describe("cancelBatch", () => {
    it("cancels from UPLOADED → CANCELLED", async () => {
      const batchDoc = importBatchFactory({ state: "UPLOADED" });
      mockBatchModel.findById.mockResolvedValue(batchDoc);

      const cancelledDoc = importBatchFactory({
        state: "CANCELLED",
        completedAt: new Date(),
      });
      mockBatchModel.findByIdAndUpdate.mockResolvedValue(cancelledDoc);

      const result = await ImportBatchService.cancelBatch(BATCH_ID, USER_ID);

      expect(result.state).toBe("CANCELLED");
      expect(result.completedAt).toBeInstanceOf(Date);
      expect(mockBatchModel.findByIdAndUpdate).toHaveBeenCalledWith(
        BATCH_ID,
        {
          $set: {
            state: "CANCELLED",
            completedAt: expect.any(Date),
          },
        },
        { new: true },
      );
      expect(mockAuditWriter.write).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "BATCH_CANCELLED",
        }),
      );
    });

    it("cancels from QUEUED → CANCELLED", async () => {
      const batchDoc = importBatchFactory({ state: "QUEUED" });
      mockBatchModel.findById.mockResolvedValue(batchDoc);
      mockBatchModel.findByIdAndUpdate.mockResolvedValue(
        importBatchFactory({ state: "CANCELLED", completedAt: new Date() }),
      );

      const result = await ImportBatchService.cancelBatch(BATCH_ID, USER_ID);
      expect(result.state).toBe("CANCELLED");
    });

    it("throws when processing (invalid transition)", async () => {
      const batchDoc = importBatchFactory({ state: "PROCESSING" });
      mockBatchModel.findById.mockResolvedValue(batchDoc);

      const err = await ImportBatchService.cancelBatch(BATCH_ID, USER_ID).catch(e => e);
      expect(err).toMatchObject({
        statusCode: 400,
        code: "INVALID_STATE_TRANSITION",
      });
    });

    it("throws when COMPLETED (invalid transition)", async () => {
      const batchDoc = importBatchFactory({ state: "COMPLETED" });
      mockBatchModel.findById.mockResolvedValue(batchDoc);

      await expect(
        ImportBatchService.cancelBatch(BATCH_ID, USER_ID),
      ).rejects.toMatchObject({
        statusCode: 400,
        code: "INVALID_STATE_TRANSITION",
      });
    });
  });

  describe("getBatch", () => {
    it("returns batch by ID", async () => {
      const batchDoc = importBatchFactory();
      mockBatchModel.findById.mockResolvedValue(batchDoc);

      const result = await ImportBatchService.getBatch(BATCH_ID);

      expect(result).not.toBeNull();
      expect(result!._id).toBe(BATCH_ID);
      expect(mockBatchModel.findById).toHaveBeenCalledWith(BATCH_ID);
    });

    it("returns null for non-existent batch", async () => {
      mockBatchModel.findById.mockResolvedValue(null);

      const result = await ImportBatchService.getBatch("nonexistent-id");
      expect(result).toBeNull();
    });
  });

  describe("listBatches", () => {
    it("returns paginated results with filters", async () => {
      const batchDocs = [importBatchFactory({ originalFileName: "file1.xlsx" })];
      const chain = queryChain(batchDocs);
      mockBatchModel.find.mockReturnValue(chain);
      mockBatchModel.countDocuments.mockResolvedValue(10);

      const result = await ImportBatchService.listBatches({
        tenantId: TENANT_ID,
        page: 2,
        pageSize: 5,
        state: "UPLOADED",
      });

      expect(result.batches).toHaveLength(1);
      expect(result.total).toBe(10);
      expect(result.page).toBe(2);
      expect(result.pageSize).toBe(5);

      expect(mockBatchModel.find).toHaveBeenCalledWith({
        tenantId: expect.any(Object),
        state: "UPLOADED",
      });
      expect(chain.sort).toHaveBeenCalledWith({ createdAt: -1 });
      expect(chain.skip).toHaveBeenCalledWith(5);
      expect(chain.limit).toHaveBeenCalledWith(5);
    });

    it("applies search filter on originalFileName", async () => {
      const batchDocs = [importBatchFactory({ originalFileName: "my-file.xlsx" })];
      const chain = queryChain(batchDocs);
      mockBatchModel.find.mockReturnValue(chain);
      mockBatchModel.countDocuments.mockResolvedValue(1);

      const result = await ImportBatchService.listBatches({
        tenantId: TENANT_ID,
        search: "my-file",
      });

      expect(result.batches).toHaveLength(1);
      expect(mockBatchModel.find).toHaveBeenCalledWith({
        tenantId: expect.any(Object),
        originalFileName: { $regex: "my-file", $options: "i" },
      });
    });

    it("uses defaults for page and pageSize", async () => {
      const batchDocs = [importBatchFactory()];
      const chain = queryChain(batchDocs);
      mockBatchModel.find.mockReturnValue(chain);
      mockBatchModel.countDocuments.mockResolvedValue(1);

      const result = await ImportBatchService.listBatches({
        tenantId: TENANT_ID,
      });

      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(20);
      expect(chain.skip).toHaveBeenCalledWith(0);
      expect(chain.limit).toHaveBeenCalledWith(20);
    });
  });

  describe("recordRowResult", () => {
    it("updates row state atomically", async () => {
      const updatedRow = makeRowDoc({
        state: "CREATED",
        createdUserId: "user-abc",
        processedAt: new Date(),
      });
      mockRowModel.findOneAndUpdate.mockResolvedValue(updatedRow);

      const result = await ImportBatchService.recordRowResult(
        BATCH_ID,
        1,
        "CREATED" as ImportRowState,
        USER_ID,
      );

      expect(result).not.toBeNull();
      expect(result!.state).toBe("CREATED");
      expect(mockRowModel.findOneAndUpdate).toHaveBeenCalledWith(
        { batchId: expect.any(Object), rowNumber: 1 },
        {
          $set: {
            state: "CREATED",
            processedAt: expect.any(Date),
            createdUserId: expect.any(Object),
          },
        },
        { new: true },
      );
    });

    it("returns null when row not found", async () => {
      mockRowModel.findOneAndUpdate.mockResolvedValue(null);

      const result = await ImportBatchService.recordRowResult(
        BATCH_ID,
        999,
        "FAILED" as ImportRowState,
      );

      expect(result).toBeNull();
    });

    it("includes errorMessage when provided", async () => {
      const updatedRow = makeRowDoc({
        state: "FAILED",
        errorMessage: "Invalid email format",
        processedAt: new Date(),
      });
      mockRowModel.findOneAndUpdate.mockResolvedValue(updatedRow);

      const result = await ImportBatchService.recordRowResult(
        BATCH_ID,
        1,
        "FAILED" as ImportRowState,
        undefined,
        "Invalid email format",
      );

      expect(result).not.toBeNull();
      expect(result!.errorMessage).toBe("Invalid email format");
      expect(mockRowModel.findOneAndUpdate).toHaveBeenCalledWith(
        { batchId: expect.any(Object), rowNumber: 1 },
        {
          $set: {
            state: "FAILED",
            processedAt: expect.any(Date),
            errorMessage: "Invalid email format",
          },
        },
        { new: true },
      );
    });
  });

  describe("validateTransition", () => {
    it("happy path UPLOADED→PARSED→PREVIEW_READY→QUEUED", () => {
      expect(() => validateTransition("UPLOADED", "PARSED")).not.toThrow();
      expect(() => validateTransition("PARSED", "PREVIEW_READY")).not.toThrow();
      expect(() => validateTransition("PREVIEW_READY", "QUEUED")).not.toThrow();
    });

    it("INVALID_STATE_TRANSITION for UPLOADED→QUEUED directly", () => {
      const err = catchError(() => validateTransition("UPLOADED", "QUEUED"));
      expect(err).toMatchObject({
        statusCode: 400,
        code: "INVALID_STATE_TRANSITION",
      });
    });

    it("PROCESSING→COMPLETED is valid", () => {
      expect(() =>
        validateTransition("PROCESSING", "COMPLETED"),
      ).not.toThrow();
    });

    it("PROCESSING→FAILED is valid", () => {
      expect(() => validateTransition("PROCESSING", "FAILED")).not.toThrow();
    });

    it("QUEUED→PROCESSING is valid", () => {
      expect(() => validateTransition("QUEUED", "PROCESSING")).not.toThrow();
    });

    it("COMPLETED→anything is invalid", () => {
      const err = catchError(() => validateTransition("COMPLETED", "UPLOADED"));
      expect(err).toBeInstanceOf(AppError);
      const err2 = catchError(() => validateTransition("COMPLETED", "PARSED"));
      expect(err2).toMatchObject({
        statusCode: 400,
        code: "INVALID_STATE_TRANSITION",
      });
    });

    it("CANCELLED→anything is invalid", () => {
      const err = catchError(() => validateTransition("CANCELLED", "UPLOADED"));
      expect(err).toBeInstanceOf(AppError);
    });

    it("CANCELLED from allowed states is valid", () => {
      expect(() => validateTransition("UPLOADED", "CANCELLED")).not.toThrow();
      expect(() => validateTransition("PARSED", "CANCELLED")).not.toThrow();
      expect(() => validateTransition("PREVIEW_READY", "CANCELLED")).not.toThrow();
      expect(() => validateTransition("QUEUED", "CANCELLED")).not.toThrow();
    });
  });
});
