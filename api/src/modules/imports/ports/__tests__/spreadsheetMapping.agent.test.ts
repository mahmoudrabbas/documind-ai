import { describe, it, expect } from "vitest";
import { SpreadsheetMappingLLMAgent } from "../spreadsheetMapping.agent.js";
import { EMPLOYEE_IMPORT_FIELDS } from "../spreadsheetMappingAgent.port.js";
import type { ModelAdapter } from "../../../agents/agents.types.js";

const EXISTING_ROLES = [
  { id: "role-1", name: "Employee" },
  { id: "role-2", name: "Manager" },
  { id: "role-3", name: "Admin" },
];

const EXISTING_DEPARTMENTS = [
  { id: "dept-1", name: "Engineering" },
  { id: "dept-2", name: "Human Resources" },
  { id: "dept-3", name: "Finance" },
];

class FakeSpreadsheetModel {
  readonly providerKey = "fake";
  private readonly responseText: string;

  constructor(responseText: string) {
    this.responseText = responseText;
  }

  async complete() {
    return {
      id: "fake-1",
      provider: "fake",
      model: "fake-model",
      choices: [
        {
          index: 0,
          message: { role: "assistant" as const, content: this.responseText },
          finishReason: "stop",
        },
      ],
      usage: { promptTokens: 150, completionTokens: 100, totalTokens: 250 },
      latencyMs: 10,
      estimatedCost: 0,
    };
  }
}

describe("SpreadsheetMappingLLMAgent", () => {
  it("maps headers to fields from LLM response", async () => {
    const fakeResponse = JSON.stringify({
      columnMappings: [
        { excelHeader: "First Name", targetField: "firstName", confidence: "high", alternatives: [] },
        { excelHeader: "Last Name", targetField: "lastName", confidence: "high", alternatives: [] },
        { excelHeader: "Email Address", targetField: "email", confidence: "high", alternatives: [] },
        { excelHeader: "Dept", targetField: "department", confidence: "medium", alternatives: ["department"] },
        { excelHeader: "Unknown Column", targetField: null, confidence: "low", alternatives: ["employeeId", "phone"] },
      ],
      unmappedHeaders: ["Unknown Column"],
      suggestedRoleId: "role-1",
      suggestedDepartmentId: "dept-2",
    });

    const agent = new SpreadsheetMappingLLMAgent(
      new FakeSpreadsheetModel(fakeResponse) as unknown as ModelAdapter,
    );
    const result = await agent.proposeMapping({
      tenantId: "tenant-1",
      headers: ["First Name", "Last Name", "Email Address", "Dept", "Unknown Column"],
      sampleRows: [
        { "First Name": "John", "Last Name": "Doe", "Email Address": "john@example.com", "Dept": "Human Resources", "Unknown Column": "x" },
      ],
      availableFields: EMPLOYEE_IMPORT_FIELDS,
      existingRoles: EXISTING_ROLES,
      existingDepartments: EXISTING_DEPARTMENTS,
    });

    expect(result.columnMappings.length).toBe(5);
    const firstName = result.columnMappings.find((m) => m.excelHeader === "First Name");
    expect(firstName).toBeDefined();
    expect(firstName?.targetField).toBe("firstName");
    expect(firstName?.confidence).toBe("high");

    const unknown = result.columnMappings.find((m) => m.excelHeader === "Unknown Column");
    expect(unknown?.targetField).toBeNull();
    expect(unknown?.confidence).toBe("low");

    expect(result.unmappedHeaders).toEqual(["Unknown Column"]);
    expect(result.suggestedRoleId).toBe("role-1");
    expect(result.suggestedDepartmentId).toBe("dept-2");
  });

  it("returns unmapped for all headers on LLM failure", async () => {
    const failingModel = {
      providerKey: "fake",
      async complete() {
        throw new Error("LLM unavailable");
      },
    };
    const agent = new SpreadsheetMappingLLMAgent(failingModel as unknown as ModelAdapter);
    const result = await agent.proposeMapping({
      tenantId: "tenant-1",
      headers: ["First Name", "Email"],
      sampleRows: [],
      availableFields: EMPLOYEE_IMPORT_FIELDS,
      existingRoles: [],
      existingDepartments: [],
    });

    expect(result.columnMappings.length).toBe(2);
    expect(result.columnMappings.every((m) => m.targetField === null)).toBe(true);
    expect(result.unmappedHeaders.length).toBe(2);
  });

  it("returns fallback on parse failure", async () => {
    const agent = new SpreadsheetMappingLLMAgent(
      new FakeSpreadsheetModel("not valid json") as unknown as ModelAdapter,
    );
    const result = await agent.proposeMapping({
      tenantId: "tenant-1",
      headers: ["Name"],
      sampleRows: [],
      availableFields: EMPLOYEE_IMPORT_FIELDS,
      existingRoles: [],
      existingDepartments: [],
    });

    expect(result.columnMappings.length).toBe(1);
    expect(result.columnMappings[0].targetField).toBeNull();
  });
});
