import { describe, it, expect } from "vitest";
import {
  validateCompanyName,
  validateCompanySlug,
  validateAdminName,
  validateEmail,
  validatePassword,
  validateConfirmPassword,
  generateCompanySlug,
} from "../validation";

describe("validation helpers", () => {
  describe("validateCompanyName", () => {
    it("returns null for valid company names", () => {
      expect(validateCompanyName("Acme Consulting")).toBeNull();
      expect(validateCompanyName("A & B Co. (Cairo)")).toBeNull();
      expect(validateCompanyName("شركة دكيومند")).toBeNull();
    });

    it("returns error key for empty or whitespace-only names", () => {
      expect(validateCompanyName("")).toBe("auth.companyNameRequired");
      expect(validateCompanyName("   ")).toBe("auth.companyNameRequired");
    });

    it("returns error key for too short names", () => {
      expect(validateCompanyName("A")).toBe("auth.companyNameInvalid");
    });

    it("returns error key for names exceeding 120 chars", () => {
      expect(validateCompanyName("A".repeat(121))).toBe("auth.companyNameInvalid");
    });

    it("returns error key for forbidden characters", () => {
      expect(validateCompanyName("Acme @ Consulting")).toBe("auth.companyNameInvalid");
      expect(validateCompanyName("Acme #1")).toBe("auth.companyNameInvalid");
    });
  });

  describe("validateCompanySlug", () => {
    it("returns null for valid slugs", () => {
      expect(validateCompanySlug("acme-consulting")).toBeNull();
      expect(validateCompanySlug("cairo-office-2")).toBeNull();
      expect(validateCompanySlug("123-abc")).toBeNull();
    });

    it("returns error key for empty slugs", () => {
      expect(validateCompanySlug("")).toBe("auth.companySlugRequired");
      expect(validateCompanySlug("  ")).toBe("auth.companySlugRequired");
    });

    it("returns error key for slugs exceeding 80 chars", () => {
      expect(validateCompanySlug("a".repeat(81))).toBe("auth.companySlugInvalid");
    });

    it("returns error key for invalid characters or structure", () => {
      expect(validateCompanySlug("Acme-Consulting")).toBe("auth.companySlugInvalid"); // uppercase
      expect(validateCompanySlug("acme_consulting")).toBe("auth.companySlugInvalid"); // underscore
      expect(validateCompanySlug("-acme")).toBe("auth.companySlugInvalid"); // leading hyphen
      expect(validateCompanySlug("acme-")).toBe("auth.companySlugInvalid"); // trailing hyphen
      expect(validateCompanySlug("acme--consulting")).toBe("auth.companySlugInvalid"); // double hyphen
    });
  });

  describe("validateAdminName", () => {
    it("returns null for valid names", () => {
      expect(validateAdminName("Sarah Ahmed")).toBeNull();
      expect(validateAdminName("John Doe")).toBeNull();
    });

    it("returns error key for empty names", () => {
      expect(validateAdminName("")).toBe("auth.adminNameRequired");
    });

    it("returns error key for too short names", () => {
      expect(validateAdminName("A")).toBe("auth.adminNameInvalid");
    });
  });

  describe("validateEmail", () => {
    it("returns null for valid emails", () => {
      expect(validateEmail("admin@company.com")).toBeNull();
      expect(validateEmail("test.user+tag@domain.co.uk")).toBeNull();
    });

    it("returns error key for empty emails", () => {
      expect(validateEmail("")).toBe("auth.emailRequired");
    });

    it("returns error key for invalid format", () => {
      expect(validateEmail("admin")).toBe("auth.emailInvalid");
      expect(validateEmail("admin@")).toBe("auth.emailInvalid");
      expect(validateEmail("admin@company")).toBe("auth.emailInvalid");
    });
  });

  describe("validatePassword", () => {
    it("returns null for valid passwords", () => {
      expect(validatePassword("password123")).toBeNull();
      expect(validatePassword("SecurePass99")).toBeNull();
    });

    it("returns error key for empty password", () => {
      expect(validatePassword("")).toBe("auth.passwordRequired");
    });

    it("returns error key for short password", () => {
      expect(validatePassword("pass1")).toBe("auth.passwordInvalid");
    });

    it("returns error key for missing letter or number", () => {
      expect(validatePassword("password")).toBe("auth.passwordInvalid");
      expect(validatePassword("12345678")).toBe("auth.passwordInvalid");
    });
  });

  describe("validateConfirmPassword", () => {
    it("returns null when matching", () => {
      expect(validateConfirmPassword("pass123", "pass123")).toBeNull();
    });

    it("returns error key when empty", () => {
      expect(validateConfirmPassword("pass123", "")).toBe("auth.confirmPasswordRequired");
    });

    it("returns error key when mismatch", () => {
      expect(validateConfirmPassword("pass123", "pass124")).toBe("auth.passwordsMustMatch");
    });
  });

  describe("generateCompanySlug", () => {
    it("converts spaces/special characters into hyphens", () => {
      expect(generateCompanySlug("Acme Consulting")).toBe("acme-consulting");
      expect(generateCompanySlug("A & B Co. (Cairo)")).toBe("a-b-co-cairo");
      expect(generateCompanySlug("---Acme---")).toBe("acme");
    });

    it("handles Arabic/unicode characters", () => {
      expect(generateCompanySlug("شركة دكيومند")).toBe("شركة-دكيومند");
    });
  });
});
