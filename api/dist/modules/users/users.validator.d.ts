import { z } from "zod";
import type { InviteUserInput, ListUsersInput, UpdateUserInput } from "./users.types.js";
declare const setPasswordFromInviteSchema: z.ZodObject<{
    token: z.ZodString;
    password: z.ZodString;
}, z.core.$strict>;
export declare function validateInviteUserInput(input: unknown): InviteUserInput;
export declare function validateUpdateUserInput(input: unknown): UpdateUserInput;
export declare function validateListUsersInput(input: unknown): ListUsersInput;
export declare function validateSetPasswordFromInviteInput(input: unknown): typeof setPasswordFromInviteSchema extends z.ZodType<infer T> ? T : never;
export {};
//# sourceMappingURL=users.validator.d.ts.map