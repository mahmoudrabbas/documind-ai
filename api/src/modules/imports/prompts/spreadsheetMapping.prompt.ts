export const SPREADSHEET_MAPPING_PROMPT_VERSION = "1.0.0";

export const SPREADSHEET_MAPPING_SYSTEM_PROMPT = `You are DocuMind AI, a spreadsheet column mapping specialist for employee data imports.

CORE RULES:
1. Map each Excel header to the most appropriate target field.
2. If a header doesn't match any field, set targetField to null.
3. Assign confidence: "high" for clear matches, "medium" for plausible matches, "low" for uncertain.
4. Provide alternative field suggestions when the match is uncertain.
5. Suggest role and department IDs from existing records when sample data provides clear matches.

AVAILABLE FIELDS:
- firstName (string, required): Employee's first name
- lastName (string, required): Employee's last name
- email (email, required): Employee's email address
- department (string, optional): Department name
- jobTitle (string, optional): Employee's job title
- customRole (string, optional): Custom role name to assign
- language (enum: en/ar, optional): Preferred language
- managerEmail (email, optional): Email of the employee's manager
- employeeId (string, optional): Internal employee identifier
- phone (string, optional): Phone number
- hireDate (date, optional): Employee's hire date

OUTPUT: Respond with ONLY a JSON object matching this schema:
{
  "columnMappings": [
    {
      "excelHeader": "First Name",
      "targetField": "firstName" | null,
      "confidence": "high" | "medium" | "low",
      "alternatives": ["lastName", "employeeId"]
    }
  ],
  "unmappedHeaders": ["Header that could not be mapped"],
  "suggestedRoleId": "optional role ID or null",
  "suggestedDepartmentId": "optional department ID or null"
}`;

export function buildSpreadsheetMappingUserPrompt(
  headers: string[],
  sampleRows: Record<string, unknown>[],
  availableFields: Array<{ name: string; label: string; type: string; required: boolean; enumValues?: string[]; description?: string }>,
  existingRoles: Array<{ id: string; name: string }>,
  existingDepartments: Array<{ id: string; name: string }>,
): string {
  let prompt = "";

  prompt += `EXCEL HEADERS:\n${JSON.stringify(headers, null, 2)}\n\n`;

  prompt += `SAMPLE ROWS (${Math.min(sampleRows.length, 5)} of ${sampleRows.length}):\n`;
  for (let i = 0; i < Math.min(sampleRows.length, 5); i++) {
    prompt += `Row ${i + 1}: ${JSON.stringify(sampleRows[i])}\n`;
  }

  prompt += `\nAVAILABLE FIELDS:\n`;
  for (const f of availableFields) {
    prompt += `- ${f.name} (${f.label}): ${f.type}${f.required ? ", required" : ", optional"}${f.enumValues ? `, values: ${f.enumValues.join("/")}` : ""}${f.description ? `, ${f.description}` : ""}\n`;
  }

  if (existingRoles.length > 0) {
    prompt += `\nEXISTING ROLES:\n`;
    for (const r of existingRoles) {
      prompt += `- ${r.id}: ${r.name}\n`;
    }
  }

  if (existingDepartments.length > 0) {
    prompt += `\nEXISTING DEPARTMENTS:\n`;
    for (const d of existingDepartments) {
      prompt += `- ${d.id}: ${d.name}\n`;
    }
  }

  prompt += `\nMap each Excel header to the best target field. Respond with ONLY the JSON object.`;

  return prompt;
}
