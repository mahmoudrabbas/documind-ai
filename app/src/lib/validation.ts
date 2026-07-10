const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const passwordPattern = /^(?=.*[A-Za-z])(?=.*\d).+$/;
const companyNamePattern = /^[\p{L}\p{N}\s'&.()-]+$/u;
const companySlugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

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
  if (!trimmed) {
    return "auth.companySlugRequired";
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
  "text/markdown",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
];

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

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

export function validateFileType(file: File): string | null {
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return "documents.fileTypeNotSupported";
  }
  return null;
}

export function validateFileSize(file: File): string | null {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return "documents.fileTooLarge";
  }
  return null;
}

export function getFileSizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function generateCompanySlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "") // Remove everything except unicode letters/numbers, spaces, hyphens
    .replace(/[\s_]+/g, "-")           // Replace spaces and underscores with hyphens
    .replace(/-+/g, "-")               // Collapse consecutive hyphens
    .replace(/^-+|-+$/g, "");          // Trim hyphens from ends
}
