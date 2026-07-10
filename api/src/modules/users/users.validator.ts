import { z } from "zod";
import { AppError } from "../../common/errors/AppError.js";
import { VALIDATION_ERROR } from "../../common/errors/errorCodes.js";
import type { InviteUserInput } from "./users.types.js";

const inviteUserSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "name must be at least 2 characters")
      .max(120, "name must be at most 120 characters")
      .regex(/^[\p{L}\p{N}\s'&.()-]+$/u, "name contains invalid characters"),
    email: z.string().trim().toLowerCase().email("email must be a valid address"),
    role: z
      .enum(["COMPANY_ADMIN", "EMPLOYEE"])
      .default("EMPLOYEE"),
  })
  .strict();

export function validateInviteUserInput(input: unknown): InviteUserInput {
  const result = inviteUserSchema.safeParse(input);

  if (!result.success) {
    throw new AppError(400, VALIDATION_ERROR, "Validation failed", groupValidationIssues(result.error.issues));
  }

  return result.data;
}

function groupValidationIssues(issues: z.ZodIssue[]) {
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

  if (!firstMessage) {
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
