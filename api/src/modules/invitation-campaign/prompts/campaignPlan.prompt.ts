export const CAMPAIGN_AGENT_PROMPT_VERSION = "1.0.0";

export const CAMPAIGN_ANALYSIS_SYSTEM_PROMPT = `You are a campaign analysis assistant for an enterprise invitation system.

Given a spreadsheet of employees to invite, analyze the data and produce a campaign plan.

CORE RULES:
1. Based on the validation summary, determine if the campaign should proceed automatically.
2. Set autoConfirm=true only when: no invalid emails, no duplicates, no already-registered users, and no warnings.
3. Provide concise analysis of what the spreadsheet contains (1-2 sentences).
4. List actionable recommendations (e.g., "Correct 3 invalid emails before sending").
5. Never exceed 5 recommendations.
6. Respond with ONLY a JSON object matching the schema below.

OUTPUT SCHEMA:
{
  "analysis": "Brief analysis of the spreadsheet contents",
  "recommendations": ["Recommendation 1", "Recommendation 2"],
  "autoConfirm": false
}`;

export const PROGRESS_NARRATIVE_SYSTEM_PROMPT = `You are a campaign progress narrator.

Given the current campaign state and metrics, produce a concise 1-sentence human-readable status update.

Examples:
- "Preparing campaign — analyzing 150 employees..."
- "Sending invitations — 45 of 145 sent so far..."
- "Campaign complete — 142 of 145 invitations delivered successfully."

Keep it to ONE sentence, max 120 characters. Use present tense for active states, past tense for completion.`;

export const SUMMARY_SYSTEM_PROMPT = `You are a campaign summary writer.

Given the final campaign metrics, produce a concise 1-2 sentence natural language summary of the campaign outcome.

Examples:
- "Successfully invited 142 of 145 eligible employees. 3 failed due to SMTP bounces and will be retried automatically."
- "Campaign completed with 0 invitations sent — all 3 employees were already registered in the system."

Keep it to 1-2 sentences, max 250 characters. Be factual and concise. Mention retries if any occurred.`;

export function buildCampaignAnalysisUserPrompt(input: {
  originalFileName: string;
  headers: string[];
  sampleRows: Record<string, string>[];
  totalRows: number;
  validationSummary: {
    valid: number;
    warning: number;
    invalid: number;
    duplicates: number;
    alreadyRegistered: number;
    alreadyInvited: number;
  };
}): string {
  return [
    `FILE: ${input.originalFileName}`,
    `TOTAL ROWS: ${input.totalRows}`,
    `HEADERS: ${input.headers.join(", ")}`,
    `SAMPLE ROWS (first 3):`,
    ...input.sampleRows.slice(0, 3).map(
      (r, i) => `  Row ${i + 1}: ${JSON.stringify(r)}`,
    ),
    `VALIDATION SUMMARY:`,
    `  Valid: ${input.validationSummary.valid}`,
    `  Warnings: ${input.validationSummary.warning}`,
    `  Invalid: ${input.validationSummary.invalid}`,
    `  Duplicate emails in file: ${input.validationSummary.duplicates}`,
    `  Already registered users: ${input.validationSummary.alreadyRegistered}`,
    `  Already pending invitations: ${input.validationSummary.alreadyInvited}`,
    "",
    "Analyze this spreadsheet and produce a campaign plan.",
  ].join("\n");
}

export function buildProgressNarrativeUserPrompt(input: {
  state: string;
  metrics: {
    totalRows: number;
    created: number;
    failed: number;
    sent: number;
    failedSends: number;
  };
}): string {
  return [
    `STATE: ${input.state}`,
    `METRICS:`,
    `  Total rows: ${input.metrics.totalRows}`,
    `  Users created: ${input.metrics.created}`,
    `  Users failed: ${input.metrics.failed}`,
    `  Emails sent: ${input.metrics.sent}`,
    `  Emails failed: ${input.metrics.failedSends}`,
    "",
    "Generate a 1-sentence progress narrative.",
  ].join("\n");
}

export function buildCampaignSummaryUserPrompt(input: {
  metrics: {
    totalRows: number;
    valid: number;
    warning: number;
    invalid: number;
    duplicates: number;
    alreadyRegistered: number;
    alreadyInvited: number;
    created: number;
    failed: number;
    sent: number;
    failedSends: number;
    retryCount: number;
    durationMs: number;
  };
}): string {
  const durationSec = (input.metrics.durationMs / 1000).toFixed(1);
  return [
    `FINAL METRICS:`,
    `  Total rows in file: ${input.metrics.totalRows}`,
    `  Valid rows: ${input.metrics.valid}`,
    `  Warnings: ${input.metrics.warning}`,
    `  Invalid rows: ${input.metrics.invalid}`,
    `  Duplicate rows: ${input.metrics.duplicates}`,
    `  Already registered: ${input.metrics.alreadyRegistered}`,
    `  Already invited: ${input.metrics.alreadyInvited}`,
    `  Users created: ${input.metrics.created}`,
    `  User creation failures: ${input.metrics.failed}`,
    `  Invitation emails sent: ${input.metrics.sent}`,
    `  Email send failures: ${input.metrics.failedSends}`,
    `  Retry count: ${input.metrics.retryCount}`,
    `  Duration: ${durationSec}s`,
    "",
    "Generate a 1-2 sentence campaign summary.",
  ].join("\n");
}
