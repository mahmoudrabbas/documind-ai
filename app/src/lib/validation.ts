const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const passwordPattern = /^(?=.*[A-Za-z])(?=.*\d).+$/;
const companyNamePattern = /^[\p{L}\p{N}\s'&.()-]+$/u;
const companySlugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const reservedCompanySlugs = new Set([
  "__documind_platform__",
  "documind-ai",
  "documind.ai",
]);

export function validateCompanyName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) {
    return "auth.companyNameRequired";
  }
  if (trimmed.length < 2 || trimmed.length > 120) {
    return "auth.companyNameInvalid";
  }
  if (!companyNamePattern.test(trimmed)) {
    return "auth.companyNameInvalid";
  }
  return null;
}

export function validateCompanySlug(slug: string): string | null {
  const trimmed = slug.trim();
  const normalized = trimmed.toLowerCase();
  if (!trimmed) {
    return "auth.companySlugRequired";
  }
  if (reservedCompanySlugs.has(normalized)) {
    return "auth.companySlugReserved";
  }
  if (trimmed.length > 80) {
    return "auth.companySlugInvalid";
  }
  if (!companySlugPattern.test(trimmed)) {
    return "auth.companySlugInvalid";
  }
  return null;
}

export function validateAdminName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) {
    return "auth.adminNameRequired";
  }
  if (trimmed.length < 2 || trimmed.length > 120) {
    return "auth.adminNameInvalid";
  }
  return null;
}

export function validateEmail(email: string): string | null {
  const trimmed = email.trim();
  if (!trimmed) {
    return "auth.emailRequired";
  }
  if (!emailPattern.test(trimmed)) {
    return "auth.emailInvalid";
  }
  return null;
}

export function validatePassword(password: string): string | null {
  if (!password) {
    return "auth.passwordRequired";
  }
  if (password.length < 8 || password.length > 128) {
    return "auth.passwordInvalid";
  }
  if (!passwordPattern.test(password)) {
    return "auth.passwordInvalid";
  }
  return null;
}

export function validateConfirmPassword(password: string, confirm: string): string | null {
  if (!confirm) {
    return "auth.confirmPasswordRequired";
  }
  if (password !== confirm) {
    return "auth.passwordsMustMatch";
  }
  return null;
}

/**
 * Automatically format a company name into a clean URL-friendly slug.
 * Replaces non-alphanumeric chars with hyphens, collapses hyphens, and trims.
 */
const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "text/plain",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

const DOCUMENT_MIME_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  txt: "text/plain",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

const DOCUMENT_ALLOWED_FILE_EXTENSIONS = Object.keys(DOCUMENT_MIME_BY_EXTENSION).map(
  (extension) => `.${extension}`,
);

export { ALLOWED_MIME_TYPES, MAX_FILE_SIZE_BYTES, DOCUMENT_ALLOWED_FILE_EXTENSIONS };

export function validateDocumentTitle(title: string): string | null {
  const trimmed = title.trim();
  if (!trimmed) {
    return "documents.metadataTitleRequired";
  }
  if (trimmed.length < 2 || trimmed.length > 200) {
    return "documents.metadataTitleRequired";
  }
  return null;
}

export function validateDocumentDescription(description: string): string | null {
  if (description && description.trim().length > 1000) {
    return "documents.metadataDescription";
  }
  return null;
}

export function validateFileType(
  file: File,
  allowedMimeTypes: readonly string[] = ALLOWED_MIME_TYPES,
): string | null {
  if (!allowedMimeTypes.includes(file.type)) {
    return "documents.fileTypeNotSupported";
  }
  return null;
}

export function validateFileSize(
  file: File,
  maxSizeBytes: number = MAX_FILE_SIZE_BYTES,
): string | null {
  if (file.size > maxSizeBytes) {
    return "documents.fileTooLarge";
  }
  return null;
}

/** Lower-cased file extension without the leading dot. */
export function getFileExtension(fileName: string): string {
  const lastDot = fileName.lastIndexOf(".");
  if (lastDot <= 0) return "";
  return fileName.slice(lastDot + 1).toLowerCase();
}

export interface ValidateDocumentFileOptions {
  maxSizeBytes?: number;
  allowedMimeTypes?: readonly string[];
  fileExtensions?: readonly string[];
}

/**
 * Client-side document file validation that mirrors the server's authoritative
 * `validateDocumentFile` check (size, extension allowlist, MIME-vs-extension
 * match). The server still re-validates every upload and performs the
 * content-signature checks; this helper only gives early, localized feedback.
 *
 * Returns a translation key, or `null` when the file is acceptable.
 */
export function validateDocumentFile(
  file: File,
  {
    maxSizeBytes = MAX_FILE_SIZE_BYTES,
    allowedMimeTypes = ALLOWED_MIME_TYPES,
    fileExtensions = DOCUMENT_ALLOWED_FILE_EXTENSIONS,
  }: ValidateDocumentFileOptions = {},
): string | null {
  if (file.size === 0) {
    return "documents.fileEmpty";
  }
  if (file.size > maxSizeBytes) {
    return "documents.fileTooLarge";
  }

  const extension = getFileExtension(file.name);
  const normalizedExtensions = fileExtensions.map((ext) =>
    ext.startsWith(".") ? ext : `.${ext}`,
  );
  if (!normalizedExtensions.includes(`.${extension}`)) {
    return "documents.fileTypeNotSupported";
  }

  const declaredMimeType = file.type.trim().toLowerCase();
  if (declaredMimeType) {
    if (!allowedMimeTypes.includes(declaredMimeType)) {
      return "documents.fileTypeNotSupported";
    }
    const expectedMimeType = DOCUMENT_MIME_BY_EXTENSION[extension];
    if (expectedMimeType && declaredMimeType !== expectedMimeType) {
      return "documents.fileContentsMismatch";
    }
  }

  return null;
}

export function getFileSizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Split a byte count into its numeric part and a translation key for the
 * unit, so the unit can be localized.
 *
 * The thresholds and rounding are identical to {@link getFileSizeLabel};
 * only the unit moves into the dictionary. Callers render
 * `` `${value} ${t(unitKey)}` ``.
 */
export function getFileSizeParts(bytes: number): {
  value: string;
  unitKey: string;
} {
  if (bytes < 1024) return { value: String(bytes), unitKey: "common.unitBytes" };
  if (bytes < 1024 * 1024) {
    return { value: (bytes / 1024).toFixed(1), unitKey: "common.unitKB" };
  }

  return {
    value: (bytes / (1024 * 1024)).toFixed(1),
    unitKey: "common.unitMB",
  };
}

export function generateCompanySlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "") // Remove everything except unicode letters/numbers, spaces, hyphens
    .replace(/[\s_]+/g, "-")           // Replace spaces and underscores with hyphens
    .replace(/-+/g, "-")               // Collapse consecutive hyphens
    .replace(/^-+|-+$/g, "");          // Trim hyphens from ends
}
