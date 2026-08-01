import type { ConfirmationLevel } from "../copilot.types.js";

export interface ConfirmationRequest {
  stepIndex: number;
  toolName: string;
  parameters: Record<string, unknown>;
  confirmationLevel: ConfirmationLevel;
  description: string;
  impact: string;
}

export function buildConfirmationRequest(
  stepIndex: number,
  toolName: string | null,
  parameters: Record<string, unknown> | null,
  confirmationLevel: ConfirmationLevel,
  description: string,
): ConfirmationRequest | null {
  if (!toolName || confirmationLevel === "safe") return null;
  const impact = getImpactDescription(toolName, confirmationLevel);
  return {
    stepIndex,
    toolName,
    parameters: parameters ?? {},
    confirmationLevel,
    description,
    impact,
  };
}

function getImpactDescription(toolName: string, level: ConfirmationLevel): string {
  if (level === "high") {
    return "This action cannot be undone. It may permanently affect data or user access.";
  }
  if (level === "medium") {
    return "This action will modify data. It can be reviewed after execution.";
  }
  return "";
}

export function requiresConfirmation(level: ConfirmationLevel): boolean {
  return level === "medium" || level === "high";
}
