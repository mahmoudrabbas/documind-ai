import { z } from "zod";
export declare const packageBodySchema: z.ZodObject<{
    name: z.ZodString;
    code: z.ZodString;
    description: z.ZodDefault<z.ZodString>;
    monthlyPrice: z.ZodNumber;
    currency: z.ZodDefault<z.ZodString>;
    limits: z.ZodObject<{
        users: z.ZodNumber;
        documents: z.ZodNumber;
        questionsPerMonth: z.ZodNumber;
        storageMb: z.ZodNumber;
    }, z.core.$strip>;
}, z.core.$strict>;
export declare const packageUpdateSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodString>;
    monthlyPrice: z.ZodOptional<z.ZodNumber>;
    currency: z.ZodOptional<z.ZodString>;
    limits: z.ZodOptional<z.ZodObject<{
        users: z.ZodNumber;
        documents: z.ZodNumber;
        questionsPerMonth: z.ZodNumber;
        storageMb: z.ZodNumber;
    }, z.core.$strip>>;
    active: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strict>;
export declare const subscriptionUpdateSchema: z.ZodObject<{
    packageId: z.ZodString;
    status: z.ZodEnum<{
        active: "active";
        trialing: "trialing";
        past_due: "past_due";
        cancelled: "cancelled";
    }>;
    renewsAt: z.ZodOptional<z.ZodNullable<z.ZodISODateTime>>;
}, z.core.$strict>;
export declare const settingsBodySchema: z.ZodRecord<z.ZodString, z.ZodUnion<readonly [z.ZodString, z.ZodNumber, z.ZodBoolean, z.ZodNull]>>;
export declare const idSchema: z.ZodObject<{
    id: z.ZodString;
}, z.core.$strict>;
export declare const tenantIdSchema: z.ZodObject<{
    tenantId: z.ZodString;
}, z.core.$strict>;
export declare const listSchema: z.ZodObject<{
    search: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodString>;
    page: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    pageSize: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
}, z.core.$strict>;
export declare function parse<T>(schema: z.ZodType<T>, input: unknown): T;
//# sourceMappingURL=platform.validator.d.ts.map