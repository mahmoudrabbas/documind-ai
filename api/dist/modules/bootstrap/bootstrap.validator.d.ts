import { z } from "zod";
declare const schema: z.ZodObject<{
    name: z.ZodString;
    email: z.ZodString;
    password: z.ZodString;
}, z.core.$strict>;
export type BootstrapInput = z.infer<typeof schema>;
export declare function validateBootstrapInput(input: unknown): BootstrapInput;
export {};
//# sourceMappingURL=bootstrap.validator.d.ts.map