import { Permission } from "../../permissions/permissions.catalog.js";

/**
 * Single source of truth for the copilot action tool catalog.
 *
 * Every tool the copilot can propose is described here exactly once: its risk,
 * approval needs, permission gate, the data its handler requires (used for
 * prompt guidance and draft questions), the deterministic fallback keywords
 * (EN + AR), and few-shot example utterances used to train the classifier.
 *
 * The classifier prompt, the fallback keyword matcher, the action agent's risk
 * catalog / summaries, and (via the API surface) the frontend chips all derive
 * from this module — no parallel copies.
 */

export type ToolRisk = "low" | "reversible" | "destructive";

export interface ToolInputFieldProfile {
  field: string;
  kind: "text" | "email" | "enum" | "document" | "user" | "settings" | "grants";
  /** Plain-language hint of the data the tool needs (prompt guidance). */
  hint: string;
}

export interface ToolProfile {
  name: string;
  description: string;
  risk: ToolRisk;
  approvalRequired: boolean;
  requiredPermission: string;
  /** Fallback keywords; array order defines match precedence across tools. */
  keywords: { en: string[]; ar: string[] };
  /** Few-shot utterances for the classifier prompt. */
  examples: { en: string[]; ar: string[] };
  /** Data the tool needs to run (draft questions + prompt guidance). */
  inputFields: ToolInputFieldProfile[];
}

export const TOOL_PROFILES: readonly ToolProfile[] = [
  {
    name: "document.permanentDelete",
    description: "Permanently delete a document (irreversible)",
    risk: "destructive",
    approvalRequired: true,
    requiredPermission: Permission.DOCUMENTS_DELETE,
    keywords: {
      en: [
        "permanently delete",
        "permanent delete",
        "delete forever",
        "delete permanently",
        "erase document",
      ],
      ar: ["حذف نهائي", "حذف دائم", "احذف نهائيًا", "امسح نهائيًا", "نهائيًا"],
    },
    examples: {
      en: [
        "permanently delete the contract.pdf document",
        "delete this document forever",
      ],
      ar: ["احذف مستند contract.pdf نهائيًا", "امسح هذا المستند نهائيًا"],
    },
    inputFields: [
      {
        field: "documentId",
        kind: "document",
        hint: "the name of the document to delete (it is moved to trash first if still active)",
      },
    ],
  },
  {
    name: "user.delete",
    description: "Delete a user (irreversible)",
    risk: "destructive",
    approvalRequired: true,
    requiredPermission: Permission.USERS_DELETE,
    keywords: {
      en: ["delete user", "remove user", "delete this user", "remove this user", "delete an employee"],
      ar: ["حذف مستخدم", "إزالة مستخدم", "احذف المستخدم", "أزل المستخدم", "حذف موظف"],
    },
    examples: {
      en: ["delete the user sara@company.com", "remove employee John Doe"],
      ar: ["احذف المستخدم sara@company.com", "أزل الموظف جون"],
    },
    inputFields: [
      {
        field: "targetUserId",
        kind: "user",
        hint: "the email or name of the user to delete",
      },
    ],
  },
  {
    name: "document.softDelete",
    description: "Move a document to trash (soft delete)",
    risk: "destructive",
    approvalRequired: true,
    requiredPermission: Permission.DOCUMENTS_DELETE,
    keywords: {
      en: ["soft delete", "delete document", "delete this document", "remove document", "move to trash", "delete"],
      ar: ["حذف المستند", "احذف المستند", "حذف ناعم", "إزالة المستند", "نقل إلى سلة المهملات", "حذف"],
    },
    examples: {
      en: ["delete the document rules.pdf", "move the file contract.pdf to trash"],
      ar: ["احذف مستند rules.pdf", "انقل ملف contract.pdf إلى سلة المهملات"],
    },
    inputFields: [
      {
        field: "documentId",
        kind: "document",
        hint: "the name of the document to move to trash",
      },
    ],
  },
  {
    name: "document.archive",
    description: "Archive a document (soft hide from active list)",
    risk: "reversible",
    approvalRequired: false,
    requiredPermission: Permission.DOCUMENTS_ARCHIVE,
    keywords: {
      en: ["archive document", "archive this document", "hide document", "archive"],
      ar: ["أرشف المستند", "أرشف", "إخفاء المستند", "أرشفة"],
    },
    examples: {
      en: ["archive the document report.pdf", "hide this document from the list"],
      ar: ["أرشف مستند report.pdf", "أخفِ هذا المستند من القائمة"],
    },
    inputFields: [
      {
        field: "documentId",
        kind: "document",
        hint: "the name of the document to archive",
      },
    ],
  },
  {
    name: "document.restore",
    description: "Restore an archived document to active list",
    risk: "reversible",
    approvalRequired: false,
    requiredPermission: Permission.DOCUMENTS_ARCHIVE,
    keywords: {
      en: ["restore document", "restore this document", "unarchive", "restore from archive", "restore"],
      ar: ["استعادة المستند", "استرجع المستند", "إلغاء الأرشفة", "استعادة"],
    },
    examples: {
      en: ["restore the archived document budget.pdf", "bring back the document from the archive"],
      ar: ["استرجع المستند المؤرشف budget.pdf", "أعد المستند من الأرشيف"],
    },
    inputFields: [
      {
        field: "documentId",
        kind: "document",
        hint: "the name of the archived document to restore",
      },
    ],
  },
  {
    name: "document.get",
    description: "Get document details",
    risk: "low",
    approvalRequired: false,
    requiredPermission: Permission.DOCUMENTS_READ,
    keywords: {
      en: ["get document", "document details", "show document", "view document", "details of"],
      ar: ["تفاصيل المستند", "عرض المستند", "اعرض المستند", "معلومات المستند", "تفاصيل مستند", "اعرض تفاصيل"],
    },
    examples: {
      en: ["show me the details of the document policy.pdf", "what is the status of contract.pdf"],
      ar: ["اعرض تفاصيل مستند policy.pdf", "ما حالة مستند contract.pdf"],
    },
    inputFields: [
      {
        field: "documentId",
        kind: "document",
        hint: "the name of the document whose details to show",
      },
    ],
  },
  {
    name: "document.search",
    description: "Search documents within the tenant",
    risk: "low",
    approvalRequired: false,
    requiredPermission: Permission.DOCUMENTS_READ,
    keywords: {
      en: ["search documents", "search for", "find document", "look for", "find", "search"],
      ar: ["ابحث عن مستند", "البحث عن مستند", "ابحث", "قائمة المستندات", "بحث"],
    },
    examples: {
      en: ["search documents about remote work", "find the document about the annex"],
      ar: ["ابحث عن مستندات عن العمل عن بعد", "ابحث عن مستند عن الملحق"],
    },
    inputFields: [
      {
        field: "search",
        kind: "text",
        hint: "a search phrase or document keyword",
      },
    ],
  },
  {
    name: "user.invite",
    description: "Invite a new user to the tenant",
    risk: "reversible",
    approvalRequired: false,
    requiredPermission: Permission.USERS_CREATE,
    keywords: {
      en: ["invite", "invite user", "invite employee", "add user", "new user", "invite a new user", "add team member", "invite team member"],
      ar: ["ادعُ", "ادعو", "دعوة", "دعوة مستخدم", "إضافة مستخدم", "مستخدم جديد", "أضف موظفًا"],
    },
    examples: {
      en: [
        "invite Sara Ali with sara@company.com as an employee",
        "invite a new user",
        "add john@company.com as company admin",
      ],
      ar: [
        "ادعُ سارة علي sara@company.com كموظفة",
        "ادعُ مستخدمًا جديدًا",
        "أضف john@company.com كمدير شركة",
      ],
    },
    inputFields: [
      { field: "name", kind: "text", hint: "the invited person's full name" },
      { field: "email", kind: "email", hint: "the invited person's email address" },
      {
        field: "role",
        kind: "enum",
        hint: "the role to assign: EMPLOYEE or COMPANY_ADMIN",
      },
    ],
  },
  {
    name: "user.resendInvitation",
    description: "Resend an invitation to a pending user",
    risk: "low",
    approvalRequired: false,
    requiredPermission: Permission.USERS_CREATE,
    keywords: {
      en: ["resend invitation", "resend invite", "resend the invitation", "re-send invitation", "resend"],
      ar: ["إعادة إرسال الدعوة", "أعد إرسال الدعوة", "أعد الإرسال", "إعادة الدعوة"],
    },
    examples: {
      en: ["resend the invitation to sara@company.com", "resend the invite to John"],
      ar: ["أعد إرسال الدعوة إلى sara@company.com", "أعد إرسال الدعوة إلى جون"],
    },
    inputFields: [
      {
        field: "targetUserId",
        kind: "user",
        hint: "the email or name of the pending user to re-invite",
      },
    ],
  },
  {
    name: "user.revokeInvitation",
    description: "Revoke a pending invitation",
    risk: "reversible",
    approvalRequired: false,
    requiredPermission: Permission.USERS_DELETE,
    keywords: {
      en: ["revoke invitation", "revoke invite", "cancel invitation", "cancel invite", "revoke"],
      ar: ["إلغاء الدعوة", "الغاء الدعوة", "ألغِ الدعوة", "ألغِ دعوة", "الغِ الدعوة", "إلغاء"],
    },
    examples: {
      en: ["revoke the invitation of sara@company.com", "cancel the invite I sent to John"],
      ar: ["ألغِ دعوة sara@company.com", "الغِ الدعوة التي أرسلتها لجون"],
    },
    inputFields: [
      {
        field: "targetUserId",
        kind: "user",
        hint: "the email or name of the user whose invitation to revoke",
      },
    ],
  },
  {
    name: "user.list",
    description: "List users in the tenant",
    risk: "low",
    approvalRequired: false,
    requiredPermission: Permission.USERS_READ,
    keywords: {
      en: ["list users", "who are the users", "show users", "list employees", "team members", "all users"],
      ar: ["قائمة المستخدمين", "من هم المستخدمون", "اعرض المستخدمين", "قائمة الموظفين", "كل المستخدمين", "اعرض قائمة", "قائمة بجميع"],
    },
    examples: {
      en: ["list all users in the company", "who are the employees in the team"],
      ar: ["اعرض قائمة بجميع مستخدمي الشركة", "من هم موظفو الفريق"],
    },
    inputFields: [],
  },
  {
    name: "settings.update",
    description: "Update tenant settings (profile, language, email branding, AI runtime preferences, notifications)",
    risk: "low",
    approvalRequired: false,
    requiredPermission: Permission.COMPANY_SETTINGS_UPDATE,
    keywords: {
      en: ["update settings", "change settings", "update company settings", "settings", "preferences", "change the settings", "edit settings"],
      ar: ["تحديث الإعدادات", "تغيير الإعدادات", "تحديث إعدادات الشركة", "إعدادات", "تفضيلات", "عدّل الإعدادات"],
    },
    examples: {
      en: [
        "update the company settings to change the language to Arabic",
        "turn off citations in the AI settings",
        "change the company name in settings",
      ],
      ar: [
        "حدّث إعدادات الشركة واجعل اللغة العربية",
        "أوقف الاستشهادات في إعدادات الذكاء الاصطناعي",
        "غيّر اسم الشركة في الإعدادات",
      ],
    },
    inputFields: [
      {
        field: "settings",
        kind: "settings",
        hint: "the settings change requested (e.g. language, company name, citations)",
      },
    ],
  },
  {
    name: "roles.create",
    description: "Create a new custom role",
    risk: "low",
    approvalRequired: false,
    requiredPermission: Permission.ROLES_CREATE,
    // Intentionally keyword-free: role creation stays a guided walkthrough in
    // chat ("create a role" → roles.create guide). The action is triggered
    // deterministically from the chip, which passes the explicit tool name.
    keywords: {
      en: [],
      ar: [],
    },
    examples: {
      en: [
        "create a role named HR Manager as an employee",
        "create a role called Auditor with company admin access",
      ],
      ar: [
        "أنشئ دورًا باسم HR Manager كموظف",
        "أنشئ دورًا يسمى Auditor بصلاحيات مدير الشركة",
      ],
    },
    inputFields: [
      {
        field: "name",
        kind: "text",
        hint: "the role name (2-50 characters, letters/numbers/spaces/&.'()-)",
      },
      {
        field: "baseRole",
        kind: "enum",
        hint: "the base role: EMPLOYEE or COMPANY_ADMIN",
      },
      {
        field: "grants",
        kind: "grants",
        hint: "the permission grants: {permission, scopes?} objects in plain language, scopes may carry selfOnly, departmentIds, documentCategories, documentClassifications",
      },
    ],
  },
  {
    name: "document.updateMetadata",
    description: "Update document metadata (title, description, tags, category, classification)",
    risk: "low",
    approvalRequired: false,
    requiredPermission: Permission.DOCUMENTS_UPDATE,
    keywords: {
      en: ["update metadata", "rename document", "change the title", "edit document", "update document", "change the description", "add tags", "update title", "change document", "rename", "update"],
      ar: ["تحديث بيانات المستند", "إعادة تسمية المستند", "غيّر العنوان", "تعديل المستند", "حدّث المستند", "أضف وسومًا", "إعادة تسمية", "حدّث", "غيّر"],
    },
    examples: {
      en: [
        "rename the document policy.pdf to updated-policy.pdf",
        "change the description of contract.pdf",
        "add tags to the document report.pdf",
      ],
      ar: [
        "أعد تسمية مستند policy.pdf إلى updated-policy.pdf",
        "غيّر وصف مستند contract.pdf",
        "أضف وسومًا إلى مستند report.pdf",
      ],
    },
    inputFields: [
      {
        field: "documentId",
        kind: "document",
        hint: "the name of the document whose metadata to update",
      },
      {
        field: "changes",
        kind: "text",
        hint: "what to change, e.g. \"title: New title\" or \"category: HR\"",
      },
    ],
  },
];

export function getToolProfile(name: string): ToolProfile | undefined {
  return TOOL_PROFILES.find((profile) => profile.name === name);
}

export function toolProfileNames(): readonly string[] {
  return TOOL_PROFILES.map((profile) => profile.name);
}

export function toolRiskFor(name: string): ToolRisk {
  return getToolProfile(name)?.risk ?? "low";
}

export function toolApprovalRequiredFor(name: string): boolean {
  return getToolProfile(name)?.approvalRequired ?? false;
}

/** Profiles the actor is permitted to use, filtered by resolved permissions. */
export function permittedToolProfiles(
  permissions: readonly string[],
): readonly ToolProfile[] {
  const allowed = new Set(permissions);
  return TOOL_PROFILES.filter((profile) => allowed.has(profile.requiredPermission));
}