import { z } from "zod";

export const portalSessionSchema = z.object({ flow: z.enum(["general", "payment_method_update"]) }).strict();
export const invoiceIdSchema = z.object({ invoiceId: z.string().regex(/^[a-f0-9]{24}$/i) });
export const operationIdSchema = z.object({ operationId: z.string().regex(/^[a-f0-9]{24}$/i) });
export const invoiceListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  status: z.enum(["draft", "open", "paid", "void", "uncollectible"]).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  subscriptionId: z.string().regex(/^[a-f0-9]{24}$/i).optional(),
}).strict().refine((value) => !value.from || !value.to || value.from <= value.to, { message: "Invalid invoice date range" });
export const subscriptionChangePreviewSchema = z.object({
  targetPackageId: z.string().regex(/^[a-f0-9]{24}$/i),
  billingInterval: z.enum(["monthly", "annual"]),
}).strict();
export const subscriptionChangeSchema = z.object({
  previewId: z.string().regex(/^[a-f0-9]{24}$/i),
  idempotencyKey: z.string().trim().min(8).max(255),
}).strict();
export const cancellationSchema = z.object({
  cancellationType: z.enum(["PERIOD_END", "IMMEDIATE"]),
  idempotencyKey: z.string().trim().min(8).max(255),
}).strict();
export const reactivationSchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(255),
}).strict();
export const refundRequestSchema = z.object({
  invoiceId: z.string().regex(/^[a-f0-9]{24}$/i),
  mode: z.enum(["FULL", "PARTIAL"]),
  amountMinor: z.coerce.number().int().positive().optional(),
  reason: z.string().trim().min(3).max(100),
  idempotencyKey: z.string().trim().min(8).max(255),
}).strict().refine((value) => value.mode === "FULL" || value.amountMinor !== undefined, { message: "amountMinor is required for partial refunds" });
export const refundIdSchema = z.object({ refundId: z.string().regex(/^[a-f0-9]{24}$/i) });
export const refundListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
}).strict();
export const refundRejectSchema = z.object({
  reason: z.string().trim().min(3).max(500),
}).strict();
export const platformRefundListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  status: z.enum(["REQUESTED", "PROVIDER_PENDING", "SUCCEEDED", "FAILED", "REJECTED", "RETRY_PENDING"]).optional(),
  tenantId: z.string().regex(/^[a-f0-9]{24}$/i).optional(),
}).strict();

export function parseBilling<T>(schema: z.ZodType<T>, value: unknown): T { return schema.parse(value); }
