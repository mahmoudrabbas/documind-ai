export const Permission = {
  USERS_READ: "users:read",
  USERS_CREATE: "users:create",
  USERS_UPDATE: "users:update",
  USERS_DELETE: "users:delete",
  USERS_ASSIGN_ROLE: "users:assign-role",

  ROLES_READ: "roles:read",
  ROLES_CREATE: "roles:create",
  ROLES_UPDATE: "roles:update",
  ROLES_DELETE: "roles:delete",

  DOCUMENTS_READ: "documents:read",
  DOCUMENTS_CREATE: "documents:create",
  DOCUMENTS_UPDATE: "documents:update",
  DOCUMENTS_DELETE: "documents:delete",

  CHAT_READ: "chat:read",
  CHAT_CREATE: "chat:create",
  CHAT_DELETE: "chat:delete",

  ANALYTICS_READ: "analytics:read",
  ANALYTICS_EXPORT: "analytics:export",

  KNOWLEDGE_GAPS_READ: "knowledge-gaps:read",
  KNOWLEDGE_GAPS_UPDATE: "knowledge-gaps:update",

  COMPANY_SETTINGS_READ: "company-settings:read",
  COMPANY_SETTINGS_UPDATE: "company-settings:update",

  BILLING_READ: "billing:read",
  BILLING_MANAGE: "billing:manage",

  IMPORTS_CREATE: "imports:create",
  IMPORTS_READ: "imports:read",

  AUDIT_READ: "audit:read",
} as const;

export type PermissionValue =
  (typeof Permission)[keyof typeof Permission];

export const ALL_PERMISSIONS: readonly PermissionValue[] =
  Object.values(Permission) as PermissionValue[];

export function isSuperAdminOnlyPermission(
  permission: string,
): boolean {
  return !BASE_ROLE_DEFAULTS.COMPANY_ADMIN.includes(
    permission as PermissionValue,
  );
}

export const BASE_ROLE_DEFAULTS: Record<
  string,
  readonly PermissionValue[]
> = {
  SUPER_ADMIN: ALL_PERMISSIONS,
  COMPANY_ADMIN: [
    Permission.USERS_READ,
    Permission.USERS_CREATE,
    Permission.USERS_UPDATE,
    Permission.USERS_DELETE,
    Permission.USERS_ASSIGN_ROLE,
    Permission.ROLES_READ,
    Permission.ROLES_CREATE,
    Permission.ROLES_UPDATE,
    Permission.ROLES_DELETE,
    Permission.DOCUMENTS_READ,
    Permission.DOCUMENTS_CREATE,
    Permission.DOCUMENTS_UPDATE,
    Permission.DOCUMENTS_DELETE,
    Permission.CHAT_READ,
    Permission.CHAT_CREATE,
    Permission.CHAT_DELETE,
    Permission.ANALYTICS_READ,
    Permission.ANALYTICS_EXPORT,
    Permission.KNOWLEDGE_GAPS_READ,
    Permission.KNOWLEDGE_GAPS_UPDATE,
    Permission.COMPANY_SETTINGS_READ,
    Permission.COMPANY_SETTINGS_UPDATE,
    Permission.BILLING_READ,
    Permission.BILLING_MANAGE,
    Permission.IMPORTS_CREATE,
    Permission.IMPORTS_READ,
    Permission.AUDIT_READ,
  ],
  EMPLOYEE: [
    Permission.DOCUMENTS_READ,
    Permission.DOCUMENTS_CREATE,
    Permission.CHAT_READ,
    Permission.CHAT_CREATE,
    Permission.KNOWLEDGE_GAPS_READ,
  ],
};

export const PERMISSION_CATALOG_GROUPS = [
  {
    group: "users",
    label: "User Management",
    permissions: [
      Permission.USERS_READ,
      Permission.USERS_CREATE,
      Permission.USERS_UPDATE,
      Permission.USERS_DELETE,
      Permission.USERS_ASSIGN_ROLE,
    ],
  },
  {
    group: "roles",
    label: "Role Management",
    permissions: [
      Permission.ROLES_READ,
      Permission.ROLES_CREATE,
      Permission.ROLES_UPDATE,
      Permission.ROLES_DELETE,
    ],
  },
  {
    group: "documents",
    label: "Documents",
    permissions: [
      Permission.DOCUMENTS_READ,
      Permission.DOCUMENTS_CREATE,
      Permission.DOCUMENTS_UPDATE,
      Permission.DOCUMENTS_DELETE,
    ],
  },
  {
    group: "chat",
    label: "Chat",
    permissions: [
      Permission.CHAT_READ,
      Permission.CHAT_CREATE,
      Permission.CHAT_DELETE,
    ],
  },
  {
    group: "analytics",
    label: "Analytics",
    permissions: [
      Permission.ANALYTICS_READ,
      Permission.ANALYTICS_EXPORT,
    ],
  },
  {
    group: "knowledge-gaps",
    label: "Knowledge Gaps",
    permissions: [
      Permission.KNOWLEDGE_GAPS_READ,
      Permission.KNOWLEDGE_GAPS_UPDATE,
    ],
  },
  {
    group: "company-settings",
    label: "Company Settings",
    permissions: [
      Permission.COMPANY_SETTINGS_READ,
      Permission.COMPANY_SETTINGS_UPDATE,
    ],
  },
  {
    group: "billing",
    label: "Billing",
    permissions: [
      Permission.BILLING_READ,
      Permission.BILLING_MANAGE,
    ],
  },
  {
    group: "imports",
    label: "Imports",
    permissions: [
      Permission.IMPORTS_CREATE,
      Permission.IMPORTS_READ,
    ],
  },
  {
    group: "audit",
    label: "Audit",
    permissions: [Permission.AUDIT_READ],
  },
] as const;

export const PERMISSION_LABELS: Record<string, string> = {
  [Permission.USERS_READ]: "View Users",
  [Permission.USERS_CREATE]: "Invite Users",
  [Permission.USERS_UPDATE]: "Edit Users",
  [Permission.USERS_DELETE]: "Remove Users",
  [Permission.USERS_ASSIGN_ROLE]: "Assign Roles to Users",
  [Permission.ROLES_READ]: "View Roles",
  [Permission.ROLES_CREATE]: "Create Roles",
  [Permission.ROLES_UPDATE]: "Edit Roles",
  [Permission.ROLES_DELETE]: "Delete Roles",
  [Permission.DOCUMENTS_READ]: "View Documents",
  [Permission.DOCUMENTS_CREATE]: "Upload Documents",
  [Permission.DOCUMENTS_UPDATE]: "Edit Documents",
  [Permission.DOCUMENTS_DELETE]: "Delete Documents",
  [Permission.CHAT_READ]: "View Conversations",
  [Permission.CHAT_CREATE]: "Create Conversations",
  [Permission.CHAT_DELETE]: "Delete Conversations",
  [Permission.ANALYTICS_READ]: "View Analytics",
  [Permission.ANALYTICS_EXPORT]: "Export Analytics",
  [Permission.KNOWLEDGE_GAPS_READ]: "View Knowledge Gaps",
  [Permission.KNOWLEDGE_GAPS_UPDATE]: "Resolve Knowledge Gaps",
  [Permission.COMPANY_SETTINGS_READ]: "View Company Settings",
  [Permission.COMPANY_SETTINGS_UPDATE]: "Edit Company Settings",
  [Permission.BILLING_READ]: "View Billing",
  [Permission.BILLING_MANAGE]: "Manage Billing",
  [Permission.IMPORTS_CREATE]: "Create Imports",
  [Permission.IMPORTS_READ]: "View Imports",
  [Permission.AUDIT_READ]: "View Audit Logs",
};

export const PERMISSION_DESCRIPTIONS: Record<string, string> = {
  [Permission.USERS_READ]:
    "List and view user profiles within the tenant",
  [Permission.USERS_CREATE]:
    "Send invitations to new users",
  [Permission.USERS_UPDATE]:
    "Edit user details, status, and role assignments",
  [Permission.USERS_DELETE]:
    "Remove or disable user accounts",
  [Permission.USERS_ASSIGN_ROLE]:
    "Assign and revoke custom roles for users",
  [Permission.ROLES_READ]:
    "View roles and their assigned permissions",
  [Permission.ROLES_CREATE]:
    "Create new custom roles with selected permissions",
  [Permission.ROLES_UPDATE]:
    "Modify role names, permissions, and scopes",
  [Permission.ROLES_DELETE]:
    "Delete or archive roles that are not in use",
  [Permission.DOCUMENTS_READ]:
    "View all documents uploaded by any tenant member",
  [Permission.DOCUMENTS_CREATE]:
    "Upload new documents to the tenant",
  [Permission.DOCUMENTS_UPDATE]:
    "Edit document metadata such as title, description, and tags",
  [Permission.DOCUMENTS_DELETE]:
    "Permanently remove documents and their stored files",
  [Permission.CHAT_READ]:
    "View AI chat conversations",
  [Permission.CHAT_CREATE]:
    "Start new AI chat conversations",
  [Permission.CHAT_DELETE]:
    "Delete AI chat conversations",
  [Permission.ANALYTICS_READ]:
    "View usage analytics and dashboards",
  [Permission.ANALYTICS_EXPORT]:
    "Export analytics data to external formats",
  [Permission.KNOWLEDGE_GAPS_READ]:
    "View identified knowledge gaps",
  [Permission.KNOWLEDGE_GAPS_UPDATE]:
    "Mark knowledge gaps as resolved or update their status",
  [Permission.COMPANY_SETTINGS_READ]:
    "View company profile and configuration",
  [Permission.COMPANY_SETTINGS_UPDATE]:
    "Edit company profile and configuration",
  [Permission.BILLING_READ]:
    "View subscription plans and billing history",
  [Permission.BILLING_MANAGE]:
    "Manage subscription plans and payment methods",
  [Permission.IMPORTS_CREATE]:
    "Start new data import jobs",
  [Permission.IMPORTS_READ]:
    "View import job status and history",
  [Permission.AUDIT_READ]:
    "View the tenant audit log",
};

export const VALID_PERMISSIONS = new Set<string>(ALL_PERMISSIONS);
