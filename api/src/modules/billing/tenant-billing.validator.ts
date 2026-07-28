import { z } from "zod";

export const portalSessionSchema = z.object({ flow: z.enum(["general", "payment_method_update"]) }).strict();
export const invoiceIdSchema = z.object({ invoiceId: z.string().regex(/^[a-f0-9]{24}$/i) });
export const invoiceListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  status: z.enum(["draft", "open", "paid", "void", "uncollectible"]).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  subscriptionId: z.string().regex(/^[a-f0-9]{24}$/i).optional(),
}).strict().refine((value) => !value.from || !value.to || value.from <= value.to, { message: "Invalid invoice date range" });

export function parseBilling<T>(schema: z.ZodType<T>, value: unknown): T { return schema.parse(value); }
