export interface FieldDefinition {
  name: string;
  label: string;
  type: "string" | "email" | "enum" | "date";
  required: boolean;
  enumValues?: string[];
  description?: string;
}

export interface RoleSummary {
  id: string;
  name: string;
}

export interface DepartmentSummary {
  id: string;
  name: string;
}

export interface ColumnMappingProposal {
  columnMappings: Array<{
    excelHeader: string;
    targetField: string | null;
    confidence: "high" | "medium" | "low";
    alternatives: string[];
  }>;
  unmappedHeaders: string[];
  suggestedRoleId?: string;
  suggestedDepartmentId?: string;
}

export interface SpreadsheetMappingAgent {
  proposeMapping(input: {
    tenantId: string;
    headers: string[];
    sampleRows: Record<string, unknown>[];
    availableFields: FieldDefinition[];
    existingRoles: RoleSummary[];
    existingDepartments: DepartmentSummary[];
  }): Promise<ColumnMappingProposal>;
}

export const EMPLOYEE_IMPORT_FIELDS: FieldDefinition[] = [
  { name: "firstName", label: "First Name", type: "string", required: true, description: "Employee's first name" },
  { name: "lastName", label: "Last Name", type: "string", required: true, description: "Employee's last name" },
  { name: "email", label: "Email", type: "email", required: true, description: "Employee's email address (must be unique within tenant)" },
  { name: "department", label: "Department", type: "string", required: false, description: "Department name" },
  { name: "jobTitle", label: "Job Title", type: "string", required: false, description: "Employee's job title" },
  { name: "customRole", label: "Custom Role", type: "string", required: false, description: "Custom role name to assign" },
  { name: "language", label: "Language", type: "enum", required: false, enumValues: ["en", "ar"], description: "Preferred language (en or ar)" },
  { name: "managerEmail", label: "Manager Email", type: "email", required: false, description: "Email of the employee's manager" },
  { name: "employeeId", label: "Employee ID", type: "string", required: false, description: "Internal employee identifier" },
  { name: "phone", label: "Phone", type: "string", required: false, description: "Phone number" },
  { name: "hireDate", label: "Hire Date", type: "date", required: false, description: "Employee's hire date" },
];
