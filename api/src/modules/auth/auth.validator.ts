import { z } from "zod";
import { AppError } from "../../common/errors/AppError.js";
import { VALIDATION_ERROR } from "../../common/errors/errorCodes.js";
import type {
  RegisterInput,
  LoginInput,
  SuperAdminLoginInput,
  ResendVerificationEmailInput,
  VerifyEmailInput,
} from "./auth.types.js";

const registerSchema = z
  .object({
    companyName: z
      .string()
      .trim()
      .min(2, "companyName must be at least 2 characters")
      .max(120, "companyName must be at most 120 characters")
      .regex(/^[\p{L}\p{N}\s'&.()-]+$/u, "companyName contains invalid characters"),
    companySlug: z.string().trim().max(80).optional(),
    adminName: z
      .string()
      .trim()
      .min(2, "adminName must be at least 2 characters")
      .max(120, "adminName must be at most 120 characters"),
    email: z.string().trim().toLowerCase().email("email must be a valid address"),
    password: z
      .string()
      .min(8, "password must be at least 8 characters")
      .max(128, "password must be at most 128 characters")
      .regex(/^(?=.*[A-Za-z])(?=.*\d).+$/, "password must contain at least one letter and one number"),
  })
  .strict();

const verifyEmailSchema = z
  .object({
    token: z.string().trim().min(1, "token is required"),
  })
  .strict();

const resendVerificationEmailSchema = z
  .object({
    email: z.string().trim().toLowerCase().email("email must be a valid address"),
  })
  .strict();

const loginSchema = z
  .object({
    companySlug: z.string().trim().toLowerCase().min(1, "companySlug is required").max(80),
    email: z.string().trim().toLowerCase().email("email must be a valid address"),
    password: z.string().min(1, "password is required").max(128, "password must be at most 128 characters"),
  })
  .strict();
const superAdminLoginSchema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(128) }).strict();

export function validateRegisterInput(input: unknown): RegisterInput {
  const result = registerSchema.safeParse(input);

  if (!result.success) {
    throw new AppError(400, VALIDATION_ERROR, "Validation failed", groupValidationIssues(result.error.issues));
  }

  return result.data;
}

export function validateVerifyEmailInput(input: unknown): VerifyEmailInput {
  return parseAuthInput(verifyEmailSchema, input);
}

export function validateLoginInput(input: unknown): LoginInput {
  return parseAuthInput(loginSchema, input);
}
export function validateSuperAdminLoginInput(input: unknown): SuperAdminLoginInput { return parseAuthInput(superAdminLoginSchema, input); }

export function validateResendVerificationEmailInput(input: unknown): ResendVerificationEmailInput {
  return parseAuthInput(resendVerificationEmailSchema, input);
}

function parseAuthInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);

  if (!result.success) {
    throw new AppError(400, VALIDATION_ERROR, "Validation failed", groupValidationIssues(result.error.issues));
  }

  return result.data;
}

function groupValidationIssues(issues: z.core.$ZodIssue[]) {
  const groupedErrors = new Map<string, string[]>();

  for (const issue of issues) {
    const field = issue.path.join(".") || "body";

    if (!groupedErrors.has(field)) {
      groupedErrors.set(field, []);
    }

    groupedErrors.get(field)?.push(issue.message);
  }

  return Array.from(groupedErrors.entries()).map(([field, messages]) => ({
    field,
    message: formatGroupedMessage(field, messages),
  }));
}

function formatGroupedMessage(field: string, messages: string[]) {
  const [firstMessage, ...remainingMessages] = messages;

  if (firstMessage === undefined) {
    return "";
  }

  const deduplicatedMessages = remainingMessages.map((message) => removeRepeatedFieldPrefix(field, message));

  return [firstMessage, ...deduplicatedMessages].join(" and ");
}

function removeRepeatedFieldPrefix(field: string, message: string) {
  const mustPrefix = `${field} must `;
  const fieldPrefix = `${field} `;

  if (message.startsWith(mustPrefix)) {
    return message.slice(mustPrefix.length);
  }

  if (message.startsWith(fieldPrefix)) {
    return message.slice(fieldPrefix.length);
  }

  return message;
}
