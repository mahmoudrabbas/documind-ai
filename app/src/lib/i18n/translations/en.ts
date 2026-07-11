/**
 * English translation dictionary.
 *
 * Keys are dot-namespaced (`namespace.key`) so they stay flat and
 * grep-friendly. Values may contain `{{param}}` placeholders for
 * runtime interpolation.
 */

import type { TranslationDictionary } from "../i18n.types";

const en: TranslationDictionary = {
  /* ── common ────────────────────────────────────────────── */
  "common.loading": "Loading…",
  "common.error": "Something went wrong",
  "common.retry": "Retry",
  "common.cancel": "Cancel",
  "common.save": "Save",
  "common.delete": "Delete",
  "common.confirm": "Confirm",
  "common.back": "Back",
  "common.next": "Next",
  "common.close": "Close",
  "common.search": "Search",
  "common.noResults": "No results found",
  "common.welcome": "Welcome, {{name}}!",

  /* ── auth ──────────────────────────────────────────────── */
  "auth.signIn": "Sign in",
  "auth.signOut": "Sign out",
  "auth.signingIn": "Signing in…",
  "auth.secureSignIn": "Secure sign in",
  "auth.accessWorkspace": "Access your company workspace.",
  "auth.companySlug": "Company slug",
  "auth.companySlugPlaceholder": "acme-consulting",
  "auth.companySlugHelp": "Use your company workspace slug.",
  "auth.companySlugRequired": "Company slug is required.",
  "auth.email": "Email address",
  "auth.emailPlaceholder": "admin@company.com",
  "auth.emailRequired": "Email is required.",
  "auth.emailInvalid": "Enter a valid email address.",
  "auth.password": "Password",
  "auth.passwordPlaceholder": "••••••••",
  "auth.passwordRequired": "Password is required.",
  "auth.sessionNote":
    "Your session uses an in-memory access token and a secure httpOnly refresh cookie.",
  "auth.errorGeneric": "Could not sign in. Please try again.",
  "auth.errorEmailNotVerified":
    "Please verify your email before signing in.",
  "auth.errorInvalidCredentials": "Invalid company, email, or password.",
  "auth.errorAccountNotActive": "Account is not active.",
  "auth.errorTenantNotActive": "Tenant is not active.",

  /* ── nav ───────────────────────────────────────────────── */
  "nav.home": "Home",
  "nav.chat": "Chat",
  "nav.documents": "Documents",
  "nav.settings": "Settings",
  "nav.language": "Language",

  /* ── landing ───────────────────────────────────────────── */
  "landing.appName": "DocuMind AI",
  "landing.tagline": "Private AI Workspace",
  "landing.badge": "Secure company knowledge",
  "landing.heroTitle":
    "Sign in to your private company knowledge assistant.",
  "landing.heroDescription":
    "Access tenant-isolated documents, review cited answers, and work with verified internal knowledge through a secure AI workspace.",
  "landing.verifiedRetrieval": "Verified retrieval",
  "landing.answersFromApprovedFiles": "Answers from approved files",
  "landing.protected": "Protected",
  "landing.queryLabel": "Query",
  "landing.queryExample":
    "\u201CFind the latest leave carry-over policy.\u201D",
  "landing.sourceFile": "HR_Policy_2024.pdf",
  "landing.sourceDescription":
    "Verified answer returned with source citation.",
  "landing.sourcePage": "Page 14",
  "landing.trustTenantTitle": "Tenant isolated",
  "landing.trustTenantDesc":
    "Every workspace is separated by company boundary.",
  "landing.trustVerifiedTitle": "Verified access",
  "landing.trustVerifiedDesc":
    "Only activated users can access company knowledge.",
  "landing.trustPrivateTitle": "Private answers",
  "landing.trustPrivateDesc":
    "Responses are grounded in approved internal documents.",

  /* ── auth/register ─────────────────────────────────────── */
  "auth.signUp": "Sign up",
  "auth.createAccount": "Create an account",
  "auth.registerTitle": "Register your company and boot up your secure workspace.",
  "auth.registerDescription": "Establish your tenant isolation boundaries, configure your organization details, and prepare your private workspace for natural-language document retrieval.",
  "auth.registerSuccess": "Tenant and company admin created successfully. Please verify your email to activate the account.",
  "auth.registering": "Registering...",
  "auth.register": "Register",
  "auth.alreadyHaveAccount": "Already have an account? Sign in",
  "auth.adminName": "Administrator Name",
  "auth.adminNamePlaceholder": "Sarah Ahmed",
  "auth.adminNameRequired": "Administrator name is required.",
  "auth.adminNameInvalid": "Name must be at least 2 characters.",
  "auth.companyName": "Company Name",
  "auth.companyNamePlaceholder": "Acme Consulting",
  "auth.companyNameRequired": "Company name is required.",
  "auth.companyNameInvalid": "Company name must be at least 2 characters and contain only letters, numbers, spaces, and '&.()-.",
  "auth.companySlugInvalid": "Company slug must contain only lowercase letters, numbers, and hyphens.",
  "auth.passwordInvalid": "Password must be at least 8 characters and contain at least one letter and one number.",
  "auth.confirmPassword": "Confirm Password",
  "auth.confirmPasswordPlaceholder": "••••••••",
  "auth.confirmPasswordRequired": "Please confirm your password.",
  "auth.passwordsMustMatch": "Passwords must match.",
  "auth.backToLogin": "Back to Sign In",
  "auth.secureRegistration": "Secure registration",
  "auth.tenantIsolationTitle": "Tenant isolated",
  "auth.tenantIsolationDesc": "Every workspace is separated by company boundary.",
  "auth.verifiedAccessTitle": "Verified access",
  "auth.verifiedAccessDesc": "Only activated users can access company knowledge.",
  "auth.privateAnswersTitle": "Private answers",
  "auth.privateAnswersDesc": "Responses are grounded in approved internal documents.",
  "auth.registerNow": "Register now",

  /* ── auth/forgot-password ───────────────────────────────── */
  "auth.forgotPassword": "Forgot password?",
  "auth.forgotPasswordTitle": "Reset your password",
  "auth.forgotPasswordDescription": "Enter your email address and we'll send you a link to reset your password.",
  "auth.forgotPasswordEmailSent": "If an account with that email exists, a password reset link has been sent.",
  "auth.forgotPasswordSubmit": "Send reset link",
  "auth.forgotPasswordSending": "Sending…",
  "auth.forgotPasswordSuccess": "Check your email",

  /* ── auth/reset-password ────────────────────────────────── */
  "auth.resetPassword": "Set new password",
  "auth.resetPasswordTitle": "Set your new password",
  "auth.resetPasswordSecure": "Secure password reset",
  "auth.resetPasswordSuccess": "Password has been reset successfully. You can now sign in.",
  "auth.resettingPassword": "Resetting…",
  "auth.resetPasswordSubmit": "Reset password",

  /* ── documents ──────────────────────────────────────────── */
  "documents.title": "Documents",
  "documents.subtitle": "Upload and manage your company documents.",
  "documents.upload": "Upload document",
  "documents.uploading": "Uploading…",
  "documents.uploadSuccess": "Document uploaded successfully.",
  "documents.uploadError": "Could not upload document. Please try again.",
  "documents.dragDropText": "Drag and drop your file here, or",
  "documents.dragDropActive": "Drop your file here",
  "documents.browseFiles": "browse files",
  "documents.fileRequirements": "PDF, DOCX, TXT or MD — max 50 MB",
  "documents.fileTooLarge": "File is too large. Maximum size is 50 MB.",
  "documents.fileTypeNotSupported": "File type is not supported.",
  "documents.fileRequired": "Please select a file.",
  "documents.metadataTitle": "Document title",
  "documents.metadataTitlePlaceholder": "Enter a descriptive title",
  "documents.metadataTitleRequired": "Title is required (min 2 characters).",
  "documents.metadataDescription": "Description",
  "documents.metadataDescriptionPlaceholder": "Brief description of the document",
  "documents.metadataTags": "Tags",
  "documents.metadataTagsPlaceholder": "e.g. policy, HR, 2024",
  "documents.metadataTagsHint": "Comma-separated tags (max 10).",
  "documents.noDocuments": "No documents yet",
  "documents.noDocumentsHint": "Upload your first document to get started.",
  "documents.tableName": "Name",
  "documents.tableSize": "Size",
  "documents.tableType": "Type",
  "documents.tableStatus": "Status",
  "documents.tableDate": "Uploaded",
  "documents.tableActions": "Actions",
  "documents.deleteConfirm": "Are you sure you want to delete this document?",
  "documents.deleteSuccess": "Document deleted successfully.",
  "documents.statusUploaded": "Uploaded",
  "documents.statusProcessing": "Processing",
  "documents.statusProcessed": "Ready",
  "documents.statusFailed": "Failed",
};


export default en;
