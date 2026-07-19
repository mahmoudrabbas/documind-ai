import { describe, it, expect } from "vitest";
import type { SpreadsheetMappingAgent } from "../spreadsheetMappingAgent.port.js";
import { FakeSpreadsheetMappingAgent } from "../fakeSpreadsheetMappingAgent.js";
import { EMPLOYEE_IMPORT_FIELDS } from "../spreadsheetMappingAgent.port.js";

// ---------------------------------------------------------------------------
// Contract test suite — any SpreadsheetMappingAgent adapter must pass these.
// ---------------------------------------------------------------------------

export function runMappingAgentContractTests(
  label: string,
  createAgent: () => SpreadsheetMappingAgent,
) {
  describe(`SpreadsheetMappingAgent contract [${label}]`, () => {
    const agent = createAgent();
    const baseFields = EMPLOYEE_IMPORT_FIELDS;
    const baseRoles = [{ id: "role1", name: "HR Manager" }];
    const baseDepartments = [{ id: "dept1", name: "Engineering" }];

    // Get a predictable tenantId
    const tenantId = "000000000000000000000001";

    it("maps exact-match headers with high confidence", async () => {
      const result = await agent.proposeMapping({
        tenantId,
        headers: ["First Name", "Email", "Department"],
        sampleRows: [{
          "First Name": "John",
          "Email": "john@co.com",
          "Department": "Engineering",
        }],
        availableFields: baseFields,
        existingRoles: baseRoles,
        existingDepartments: baseDepartments,
      });

      const firstNameMap = result.columnMappings.find(
        (m) => m.excelHeader === "First Name",
      );
      expect(firstNameMap).toBeDefined();
      expect(firstNameMap!.targetField).toBe("firstName");
      expect(firstNameMap!.confidence).toBe("high");

      const emailMap = result.columnMappings.find(
        (m) => m.excelHeader === "Email",
      );
      expect(emailMap).toBeDefined();
      expect(emailMap!.targetField).toBe("email");
      expect(emailMap!.confidence).toBe("high");
    });

    it("maps fuzzy-match headers with medium confidence", async () => {
      const result = await agent.proposeMapping({
        tenantId,
        headers: ["Frst Name", "Emial", "Deprtmnt"],
        sampleRows: [],
        availableFields: baseFields,
        existingRoles: [],
        existingDepartments: [],
      });

      const firstNameMap = result.columnMappings.find(
        (m) => m.excelHeader === "Frst Name",
      );
      expect(firstNameMap).toBeDefined();
      expect(firstNameMap!.confidence).toBe("medium");

      const emailMap = result.columnMappings.find(
        (m) => m.excelHeader === "Emial",
      );
      expect(emailMap).toBeDefined();
      expect(emailMap!.confidence).toBe("medium");
    });

    it("maps unknown headers with low confidence and null target", async () => {
      const result = await agent.proposeMapping({
        tenantId,
        headers: ["Some Random Column", "Unknown"],
        sampleRows: [],
        availableFields: baseFields,
        existingRoles: [],
        existingDepartments: [],
      });

      for (const mapping of result.columnMappings) {
        expect(mapping.confidence).toBe("low");
        expect(mapping.targetField).toBeNull();
      }
      expect(result.unmappedHeaders.length).toBeGreaterThanOrEqual(2);
    });

    it("returns empty result for empty headers", async () => {
      const result = await agent.proposeMapping({
        tenantId,
        headers: [],
        sampleRows: [],
        availableFields: baseFields,
        existingRoles: [],
        existingDepartments: [],
      });

      expect(result.columnMappings).toEqual([]);
      expect(result.unmappedHeaders).toEqual([]);
    });

    it("handles Arabic headers with high confidence", async () => {
      const result = await agent.proposeMapping({
        tenantId,
        headers: ["الاسم الأول", "البريد الإلكتروني", "القسم"],
        sampleRows: [],
        availableFields: baseFields,
        existingRoles: [],
        existingDepartments: [],
      });

      const firstNameMap = result.columnMappings.find(
        (m) => m.excelHeader === "الاسم الأول",
      );
      expect(firstNameMap).toBeDefined();
      expect(firstNameMap!.targetField).toBe("firstName");
      expect(firstNameMap!.confidence).toBe("high");

      const emailMap = result.columnMappings.find(
        (m) => m.excelHeader === "البريد الإلكتروني",
      );
      expect(emailMap).toBeDefined();
      expect(emailMap!.targetField).toBe("email");
    });

    it("suggests role when customRole is mapped with high confidence", async () => {
      const result = await agent.proposeMapping({
        tenantId,
        headers: ["Custom Role", "Email"],
        sampleRows: [{ "Custom Role": "HR Manager", "Email": "h@r.com" }],
        availableFields: baseFields,
        existingRoles: baseRoles,
        existingDepartments: [],
      });

      expect(result.suggestedRoleId).toBe("role1");
    });

    it("remains deterministic (same input = same output)", async () => {
      const input = {
        tenantId,
        headers: ["First Name", "Email"],
        sampleRows: [{ "First Name": "Jane", "Email": "jane@co.com" }],
        availableFields: baseFields,
        existingRoles: [],
        existingDepartments: [],
      };

      const result1 = await agent.proposeMapping(input);
      const result2 = await agent.proposeMapping(input);
      expect(result1).toEqual(result2);
    });

    it("provides alternatives for unknown headers", async () => {
      const result = await agent.proposeMapping({
        tenantId,
        headers: ["Full Name"],
        sampleRows: [],
        availableFields: baseFields,
        existingRoles: [],
        existingDepartments: [],
      });

      const mapping = result.columnMappings.find(
        (m) => m.excelHeader === "Full Name",
      );
      expect(mapping).toBeDefined();
      // Should suggest firstName or lastName as alternatives
      expect(mapping!.alternatives.length).toBeGreaterThan(0);
    });
  });
}

// Run the contract against the fake adapter
runMappingAgentContractTests(
  "FakeSpreadsheetMappingAgent",
  () => new FakeSpreadsheetMappingAgent(),
);
