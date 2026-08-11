import { describe, it, expect } from "vitest";
import {
  validateCompanyName,
  validateCompanySlug,
  validateAdminName,
  validateEmail,
  validatePassword,
  validateConfirmPassword,
  generateCompanySlug,
  validateDocumentTitle,
  validateFileType,
  validateFileSize,
  validateDocumentFile,
  getFileExtension,
  ALLOWED_MIME_TYPES,
  DOCUMENT_ALLOWED_FILE_EXTENSIONS,
  getFileSizeLabel,
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

    it("returns a reserved error key for platform tenant slugs", () => {
      expect(validateCompanySlug("documind.ai")).toBe("auth.companySlugReserved");
      expect(validateCompanySlug("documind-ai")).toBe("auth.companySlugReserved");
      expect(validateCompanySlug("__documind_platform__")).toBe("auth.companySlugReserved");
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

  describe("validateDocumentTitle", () => {
    it("rejects empty title", () => {
      expect(validateDocumentTitle("")).toBe("documents.metadataTitleRequired");
      expect(validateDocumentTitle("   ")).toBe("documents.metadataTitleRequired");
    });

    it("rejects title shorter than 2 characters", () => {
      expect(validateDocumentTitle("A")).toBe("documents.metadataTitleRequired");
    });

    it("rejects title longer than 200 characters", () => {
      expect(validateDocumentTitle("A".repeat(201))).toBe("documents.metadataTitleRequired");
    });

    it("accepts valid title", () => {
      expect(validateDocumentTitle("Annual Report 2024")).toBe(null);
      expect(validateDocumentTitle("AB")).toBe(null);
    });
  });

  describe("validateFileType", () => {
    function mockFile(type: string): File {
      return new File([""], "test", { type });
    }

    it("accepts PDF", () => {
      expect(validateFileType(mockFile("application/pdf"))).toBe(null);
    });

    it("accepts DOCX", () => {
      expect(validateFileType(mockFile("application/vnd.openxmlformats-officedocument.wordprocessingml.document"))).toBe(null);
    });

    it("rejects unsupported types", () => {
      expect(validateFileType(mockFile("image/png"))).toBe("documents.fileTypeNotSupported");
      expect(validateFileType(mockFile("video/mp4"))).toBe("documents.fileTypeNotSupported");
      expect(validateFileType(mockFile("text/markdown"))).toBe("documents.fileTypeNotSupported");
      expect(validateFileType(mockFile("application/msword"))).toBe("documents.fileTypeNotSupported");
    });
  });

  describe("getFileExtension", () => {
    it("extracts the lower-cased extension", () => {
      expect(getFileExtension("report.pdf")).toBe("pdf");
      expect(getFileExtension("REPORT.PDF")).toBe("pdf");
      expect(getFileExtension("a.b.c.docx")).toBe("docx");
    });

    it("returns empty for files without an extension", () => {
      expect(getFileExtension("archive")).toBe("");
      expect(getFileExtension(".hidden")).toBe("");
    });
  });

  describe("validateDocumentFile", () => {
    function mockFile(name: string, type: string, size = 1024): File {
      return new File([new ArrayBuffer(size)], name, { type });
    }

    it("exposes the narrowed PDF/DOCX/TXT allowlist", () => {
      expect(ALLOWED_MIME_TYPES).toEqual([
        "application/pdf",
        "text/plain",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ]);
      expect(DOCUMENT_ALLOWED_FILE_EXTENSIONS).toEqual([".pdf", ".txt", ".docx"]);
    });

    it("accepts PDF, TXT and DOCX by extension", () => {
      expect(validateDocumentFile(mockFile("report.pdf", "application/pdf"))).toBe(null);
      expect(validateDocumentFile(mockFile("notes.txt", "text/plain"))).toBe(null);
      expect(validateDocumentFile(mockFile("notes.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"))).toBe(null);
    });

    it("accepts a valid file when the client omits the MIME type", () => {
      expect(validateDocumentFile(mockFile("report.pdf", ""))).toBe(null);
    });

    it("rejects empty files", () => {
      expect(validateDocumentFile(new File([], "empty.pdf", { type: "application/pdf" }))).toBe("documents.fileEmpty");
    });

    it("rejects oversized files", () => {
      expect(validateDocumentFile(mockFile("big.pdf", "application/pdf", 512), { maxSizeBytes: 256 })).toBe("documents.fileTooLarge");
    });

    it("rejects unsupported extensions (.md and .doc)", () => {
      expect(validateDocumentFile(mockFile("README.md", "text/markdown"))).toBe("documents.fileTypeNotSupported");
      expect(validateDocumentFile(mockFile("legacy.doc", "application/msword"))).toBe("documents.fileTypeNotSupported");
      expect(validateDocumentFile(mockFile("script.exe", "application/octet-stream"))).toBe("documents.fileTypeNotSupported");
    });

    it("rejects a MIME type that is clearly not a document type", () => {
      expect(validateDocumentFile(mockFile("report.pdf", "image/png"))).toBe("documents.fileTypeNotSupported");
    });

    it("rejects a MIME type that does not match the extension", () => {
      expect(validateDocumentFile(mockFile("report.pdf", "text/plain"))).toBe("documents.fileContentsMismatch");
    });

    it("honors allowedMimeTypes and fileExtensions overrides", () => {
      expect(validateDocumentFile(mockFile("report.pdf", "application/pdf"), { allowedMimeTypes: ["text/plain"], fileExtensions: [".pdf"] })).toBe("documents.fileTypeNotSupported");
    });
  });

  describe("validateFileSize", () => {
    function mockFile(size: number): File {
      return new File([new ArrayBuffer(size)], "test.pdf", { type: "application/pdf" });
    }

    it("accepts files under the limit", () => {
      expect(validateFileSize(mockFile(1024))).toBe(null);
      expect(validateFileSize(mockFile(50 * 1024 * 1024))).toBe(null);
    });

    it("rejects files over the limit", () => {
      expect(validateFileSize(mockFile(50 * 1024 * 1024 + 1))).toBe("documents.fileTooLarge");
    });
  });

  describe("getFileSizeLabel", () => {
    it("formats bytes", () => {
      expect(getFileSizeLabel(500)).toBe("500 B");
    });

    it("formats kilobytes", () => {
      expect(getFileSizeLabel(2048)).toBe("2.0 KB");
    });

    it("formats megabytes", () => {
      expect(getFileSizeLabel(5 * 1024 * 1024)).toBe("5.0 MB");
    });
  });
});
