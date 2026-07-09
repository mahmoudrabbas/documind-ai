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
export function generateCompanySlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "") // Remove everything except unicode letters/numbers, spaces, hyphens
    .replace(/[\s_]+/g, "-")           // Replace spaces and underscores with hyphens
    .replace(/-+/g, "-")               // Collapse consecutive hyphens
    .replace(/^-+|-+$/g, "");          // Trim hyphens from ends
}
