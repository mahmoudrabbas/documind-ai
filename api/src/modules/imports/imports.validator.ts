import { z } from "zod";

export const uploadMappingUpdateSchema = z.record(z.string(), z.string().nullable());

export const confirmImportSchema = z.object({
  idempotencyKey: z.string().min(1).max(256),
}).strict();

export const listBatchesQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  state: z.enum(["UPLOADED","PARSED","PREVIEW_READY","QUEUED","PROCESSING","COMPLETED","PARTIALLY_COMPLETED","FAILED","CANCELLED"]).optional(),
  fromDate: z.string().datetime().optional(),
  toDate: z.string().datetime().optional(),
}).strict();

export const retryRowsSchema = z.object({
  rowNumbers: z.array(z.number().int().positive()).optional(),
}).strict();

export const exportQuerySchema = z.object({
  format: z.enum(["csv", "xlsx"]).default("xlsx"),
  status: z.enum(["VALID","WARNING","INVALID","PENDING","CREATED","FAILED","SKIPPED"]).optional(),
}).strict();
