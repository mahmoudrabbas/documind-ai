"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ApiError } from "@/lib/api-client";
import { useAuth } from "@/providers/auth-provider";
import {
  archiveRole,
  assignRole,
  cloneRole,
  createRole,
  deleteRole,
  getPermissionCatalog,
  getRole,
  getRoleUsage,
  listRoles,
  migrateRoleUsers,
  reactivateRole,
  removeRoleAssignment,
  updateRole,
} from "@/services/roles.service";
import type { PermissionCatalogGroup, PermissionGrant, RoleView } from "@/types/api/users.types";
import {
  DashboardPage,
  DashboardPageHeader,
  DashboardPanel,
} from "@/components/ui/DashboardPage";

type RoleWithUsers = RoleView & { effectiveUserCount?: number };

const BASE_ROLE_OPTIONS = [
  { value: "EMPLOYEE", label: "Employee" },
  { value: "COMPANY_ADMIN", label: "Company Admin" },
];

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "active", label: "Active" },
  { value: "archived", label: "Archived" },
];

export default function RolesPage() {
  const { user } = useAuth();
  const [roles, setRoles] = useState<RoleWithUsers[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [baseRoleFilter, setBaseRoleFilter] = useState<"all" | "COMPANY_ADMIN" | "EMPLOYEE">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "archived">("all");

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createBaseRole, setCreateBaseRole] = useState<"COMPANY_ADMIN" | "EMPLOYEE">("EMPLOYEE");
  const [createGrants, setCreateGrants] = useState<PermissionGrant[]>([]);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSubmitting, setCreateSubmitting] = useState(false);

  const [permissionCatalog, setPermissionCatalog] = useState<PermissionCatalogGroup[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const [selectedRole, setSelectedRole] = useState<RoleView | null>(null);
  const [roleDetailsLoading, setRoleDetailsLoading] = useState(false);
  const [roleDetailsError, setRoleDetailsError] = useState<string | null>(null);

  const [editingRole, setEditingRole] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editBaseRole, setEditBaseRole] = useState<"COMPANY_ADMIN" | "EMPLOYEE">("EMPLOYEE");
  const [editGrants, setEditGrants] = useState<PermissionGrant[]>([]);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSubmitting, setEditSubmitting] = useState(false);

  const [lifecycleAction, setLifecycleAction] = useState<{
    type: "clone" | "archive" | "reactivate" | "delete" | "migrate";
    role: RoleView;
  } | null>(null);
  const [lifecycleSubmitting, setLifecycleSubmitting] = useState(false);
  const [lifecycleError, setLifecycleError] = useState<string | null>(null);

  const [migrationDestination, setMigrationDestination] = useState<RoleView | null>(null);
  const [migrationResult, setMigrationResult] = useState<{
    affected: number;
    skipped: number;
    conflicted: number;
  } | null>(null);

  const [assignmentRole, setAssignmentRole] = useState<RoleView | null>(null);
  const [assignmentUsers, setAssignmentUsers] = useState<
    { id: string; name: string; email: string; role: string; status: string; customRoleId?: string }[]
  >([]);
  const [assignmentLoading, setAssignmentLoading] = useState(false);
  const [assignmentSearch, setAssignmentSearch] = useState("");
  const [assignmentSaving, setAssignmentSaving] = useState<Record<string, boolean>>({});
  const [assignmentError, setAssignmentError] = useState<string | null>(null);

  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadRoles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await listRoles();
      setRoles(response.data.roles);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to load roles");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const loadPermissionCatalog = useCallback(async () => {
    setCatalogLoading(true);
    setCatalogError(null);
    try {
      const response = await getPermissionCatalog();
      setPermissionCatalog(response.data.groups);
      return response.data.groups;
    } catch (err) {
      if (err instanceof ApiError) {
        setCatalogError(err.message);
      } else {
        setCatalogError("Failed to load permission catalog");
      }
      return [];
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  const loadCatalogOnce = useCallback(async () => {
    if (permissionCatalog.length === 0 && !catalogLoading) {
      await loadPermissionCatalog();
    }
  }, [permissionCatalog.length, catalogLoading, loadPermissionCatalog]);

  useEffect(() => {
    (async () => {
      await loadRoles();
      await loadPermissionCatalog();
    })();
  }, [loadRoles, loadPermissionCatalog]);

  const openRoleDetails = useCallback(
    async (roleId: string) => {
      setRoleDetailsLoading(true);
      setRoleDetailsError(null);
      try {
        const response = await getRole(roleId);
        setSelectedRole(response.data.role);
        setEditName(response.data.role.name);
        setEditBaseRole(response.data.role.baseRole);
        setEditGrants(response.data.role.grants);
      } catch (err) {
        if (err instanceof ApiError) {
          setRoleDetailsError(err.message);
        } else {
          setRoleDetailsError("Failed to load role details");
        }
      } finally {
        setRoleDetailsLoading(false);
      }
    },
    [],
  );

  const closeRoleDetails = () => {
    setSelectedRole(null);
    setRoleDetailsError(null);
    setEditingRole(null);
    setEditError(null);
  };

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedName = createName.trim();
    if (!normalizedName) {
      setCreateError("Please enter a role name.");
      return;
    }
    setCreateError(null);
    setCreateSubmitting(true);
    setSuccessMessage(null);
    try {
      const response = await createRole({
        name: normalizedName,
        baseRole: createBaseRole,
        grants: createGrants,
      });
      setSuccessMessage(`Role "${normalizedName}" created successfully`);
      setCreateName("");
      setCreateBaseRole("EMPLOYEE");
      setCreateGrants([]);
      setShowCreateForm(false);
      void loadRoles();
      if (!permissionCatalog.length) {
        await loadPermissionCatalog();
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setCreateError(err.message);
      } else {
        setCreateError("Failed to create role");
      }
    } finally {
      setCreateSubmitting(false);
    }
  }

  function startEdit(role: RoleView) {
    setEditingRole(role.id);
    setEditName(role.name);
    setEditBaseRole(role.baseRole);
    setEditGrants(role.grants);
    setEditError(null);
  }

  async function handleEdit(roleId: string) {
    setEditError(null);
    setEditSubmitting(true);
    setSuccessMessage(null);
    const currentRole = roles.find((role) => role.id === roleId);
    if (!currentRole) return;
    const payload: {
      name?: string;
      baseRole?: "COMPANY_ADMIN" | "EMPLOYEE";
      grants?: PermissionGrant[];
      version: number;
    } = { version: currentRole.version };
    if (editName.trim()) payload.name = editName.trim();
    if (editBaseRole) payload.baseRole = editBaseRole;
    payload.grants = editGrants;

    try {
      const response = await updateRole(roleId, payload);
      setSuccessMessage(`Role "${response.data.role.name}" updated successfully`);
      setEditingRole(null);
      void loadRoles();
      if (selectedRole?.id === roleId) {
        setSelectedRole(response.data.role);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "ROLE_VERSION_CONFLICT" || err.code === "STALE_ROLE_VERSION") {
          setEditError("Role was modified. Refreshing...");
          void openRoleDetails(roleId);
        } else {
          setEditError(err.message);
        }
      } else {
        setEditError("Failed to update role");
      }
    } finally {
      setEditSubmitting(false);
    }
  }

  async function handleLifecycle() {
    if (!lifecycleAction) return;
    setLifecycleSubmitting(true);
    setLifecycleError(null);
    setSuccessMessage(null);

    try {
      switch (lifecycleAction.type) {
        case "clone": {
          const response = await cloneRole(lifecycleAction.role.id, lifecycleAction.role.name, lifecycleAction.role.version);
          setSuccessMessage(`Role cloned to "${response.data.role.name}"`);
          break;
        }
        case "archive": {
          const response = await archiveRole(lifecycleAction.role.id, lifecycleAction.role.version);
          setSuccessMessage(`Role "${response.data.role.name}" archived`);
          if (selectedRole?.id === lifecycleAction.role.id) {
            setSelectedRole(response.data.role);
          }
          break;
        }
        case "reactivate": {
          const response = await reactivateRole(lifecycleAction.role.id, lifecycleAction.role.version);
          setSuccessMessage(`Role "${response.data.role.name}" reactivated`);
          if (selectedRole?.id === lifecycleAction.role.id) {
            setSelectedRole(response.data.role);
          }
          break;
        }
        case "migrate": {
          if (!migrationDestination) {
            setLifecycleError("Select a destination role");
            return;
          }
          const result = await migrateRoleUsers(
            lifecycleAction.role.id,
            migrationDestination.id,
            lifecycleAction.role.version,
            migrationDestination.version,
          );
          setMigrationResult({
            affected: result.data.affected,
            skipped: result.data.skipped,
            conflicted: result.data.conflicted,
          });
          setSuccessMessage(`Migrated ${result.data.affected} user(s)`);
          break;
        }
        case "delete": {
          const response = await deleteRole(lifecycleAction.role.id, lifecycleAction.role.version);
          setSuccessMessage(`Role "${lifecycleAction.role.name}" deleted successfully`);
          void loadRoles();
          break;
        }
      }
      void loadRoles();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "ROLE_IN_USE" && lifecycleAction.type === "delete") {
          setLifecycleError("Role has assigned users. Migration required before deletion.");
          return;
        }
        if (err.code === "ROLE_VERSION_CONFLICT" || err.code === "STALE_ROLE_VERSION") {
          setLifecycleError("Role was modified. Refreshing...");
          void openRoleDetails(lifecycleAction.role.id);
        } else {
          setLifecycleError(err.message);
        }
      } else {
        setLifecycleError("Operation failed");
      }
    } finally {
      setLifecycleSubmitting(false);
    }
  }

  const openUserAssignments = useCallback(async (role: RoleView) => {
    setAssignmentRole(role);
    setAssignmentLoading(true);
    setAssignmentError(null);
    setAssignmentUsers([]);
    try {
      const response = await (await import("@/services/users.service")).listAllUsers();
      setAssignmentUsers(response);
    } catch (err) {
      if (err instanceof ApiError) {
        setAssignmentError(err.message);
      } else {
        setAssignmentError("Failed to load users");
      }
    } finally {
      setAssignmentLoading(false);
    }
  }, []);

  async function handleAssignUser(userId: string) {
    if (!assignmentRole) return;
    setAssignmentError(null);
    setAssignmentSaving((prev) => ({ ...prev, [userId]: true }));
    try {
      const response = await assignRole(assignmentRole.id, userId, assignmentRole.version);
      if (response.data.changed) {
        setSuccessMessage("User assigned to role");
      } else {
        setSuccessMessage("User already had this role");
      }
      void loadRoles();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "ROLE_VERSION_CONFLICT" || err.code === "STALE_ROLE_VERSION") {
          setAssignmentError("Role was modified. Refreshing...");
          const refreshResponse = await getRole(assignmentRole.id);
          setAssignmentRole(refreshResponse.data.role);
        } else if (err.code === "ROLE_NOT_ASSIGNABLE") {
          setAssignmentError("Role is not assignable");
        } else if (err.code === "PERMISSION_REQUIRED") {
          setAssignmentError("Missing required permission");
        } else {
          setAssignmentError(err.message);
        }
      } else {
        setAssignmentError("Failed to assign role");
      }
    } finally {
      setAssignmentSaving((prev) => ({ ...prev, [userId]: false }));
    }
  }

  async function handleRemoveAssignment(userId: string) {
    if (!assignmentRole) return;
    setAssignmentError(null);
    setAssignmentSaving((prev) => ({ ...prev, [userId]: true }));
    try {
      const response = await removeRoleAssignment(assignmentRole.id, userId, assignmentRole.version);
      if (response.data.changed) {
        setSuccessMessage("Role assignment removed");
      } else {
        setSuccessMessage("User did not have this role");
      }
      void loadRoles();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "ROLE_VERSION_CONFLICT" || err.code === "STALE_ROLE_VERSION") {
          setAssignmentError("Role was modified. Refreshing...");
          const refreshResponse = await getRole(assignmentRole.id);
          setAssignmentRole(refreshResponse.data.role);
        } else {
          setAssignmentError(err.message);
        }
      } else {
        setAssignmentError("Failed to remove assignment");
      }
    } finally {
      setAssignmentSaving((prev) => ({ ...prev, [userId]: false }));
    }
  }

  const filteredRoles = roles.filter((role) => {
    if (baseRoleFilter !== "all" && role.baseRole !== baseRoleFilter) return false;
    if (statusFilter !== "all" && role.status !== statusFilter) return false;
    if (searchTerm && !role.name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

  const canCreate = user?.role === "COMPANY_ADMIN" || user?.role === "SUPER_ADMIN";
  const canUpdate = user?.role === "COMPANY_ADMIN" || user?.role === "SUPER_ADMIN";
  const canAssign = user?.role === "COMPANY_ADMIN" || user?.role === "SUPER_ADMIN";
  const canDelete = user?.role === "COMPANY_ADMIN" || user?.role === "SUPER_ADMIN";

  return (
    <DashboardPage>
      <DashboardPageHeader
        title="Custom Roles"
        description="Define custom roles that map to existing permission levels."
        actions={
          canCreate ? (
            <button
              type="button"
              className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-label-md font-bold text-on-primary shadow-sm transition-all hover:bg-secondary-container hover:text-on-secondary-container sm:w-auto"
              onClick={() => {
                setShowCreateForm(!showCreateForm);
                setCreateError(null);
                void loadCatalogOnce();
              }}
            >
              {showCreateForm ? (
                <>
                  <span className="material-symbols-outlined text-[18px]">close</span>
                  Cancel
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[18px]">add</span>
                  Create Role
                </>
              )}
            </button>
          ) : null
        }
      />

      {successMessage ? (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          {successMessage}
        </div>
      ) : null}

      {showCreateForm ? (
        <DashboardPanel className="mb-6">
          <div className="mb-4 flex flex-col gap-3 border-b border-outline-variant/30 pb-4">
            <div className="inline-flex w-fit items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-primary">
              <span className="material-symbols-outlined text-[16px]">shield_person</span>
              New access profile
            </div>
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="text-title-lg font-bold text-primary">
                  Create New Role
                </h2>
                <p className="mt-1 text-sm text-on-surface-variant">
                  Create a role with a clear name, base permission level, and optional explicit grants.
                </p>
              </div>
            </div>
          </div>

          <form className="space-y-4" onSubmit={(event) => void handleCreate(event)}>
            <div className="grid min-w-0 auto-rows-auto items-start gap-4 lg:grid-cols-[1.3fr_0.9fr]">
              <div className="space-y-5">
                <div>
                  <label className="mb-2 block text-label-md font-bold text-on-surface-variant">
                    Role name
                  </label>
                  <input
                    className="w-full rounded-lg border border-outline-variant bg-surface px-md py-sm transition-all outline-none focus:border-transparent focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
                    value={createName}
                    onChange={(e) => setCreateName(e.target.value)}
                    placeholder="e.g. HR, IT, Sales"
                    maxLength={50}
                    required
                  />
                  <p className="mt-2 text-sm text-on-surface-variant">
                    Use a short, descriptive name so teammates can recognize the role quickly.
                  </p>
                </div>

                <div>
                  <label className="mb-2 block text-label-md font-bold text-on-surface-variant">
                    Permission level
                  </label>
                  <select
                    className="w-full rounded-lg border border-outline-variant bg-surface px-md py-sm transition-all outline-none focus:border-transparent focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
                    value={createBaseRole}
                    onChange={(e) =>
                      setCreateBaseRole(e.target.value as "COMPANY_ADMIN" | "EMPLOYEE")
                    }
                  >
                    {BASE_ROLE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <p className="mt-2 text-sm text-on-surface-variant">
                    Company admins can manage settings, while employees have standard access.
                  </p>
                </div>

                <PermissionSelector
                  catalog={permissionCatalog}
                  selectedGrants={createGrants}
                  onChange={setCreateGrants}
                  disabled={catalogLoading}
                />
              </div>

              <RolePreview roleName={createName} baseRole={createBaseRole} />
            </div>

            {createError ? (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
                {createError}
              </div>
            ) : null}

            <div className="flex flex-col gap-3 border-t border-outline-variant/30 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-on-surface-variant">
                You can update this role later if access needs change.
              </p>
              <button
                type="submit"
                className="flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-label-md font-bold text-on-primary shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                disabled={createSubmitting || !createName.trim()}
              >
                {createSubmitting ? (
                  <span className="material-symbols-outlined animate-spin text-[18px]">
                    progress_activity
                  </span>
                ) : (
                  <span className="material-symbols-outlined text-[18px]">save</span>
                )}
                {createSubmitting ? "Creating..." : "Create Role"}
              </button>
            </div>
          </form>
        </DashboardPanel>
      ) : null}

      <RoleFilters
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        baseRoleFilter={baseRoleFilter}
        onBaseRoleFilterChange={setBaseRoleFilter}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
      />

      <DashboardPanel padding="none">
        {loading ? (
          <div className="flex items-center justify-center gap-2 p-6 text-sm text-on-surface-variant sm:p-8">
            <span className="material-symbols-outlined animate-spin">progress_activity</span>
            Loading roles...
          </div>
        ) : error ? (
          <div className="p-4 sm:p-6">
            <div className="rounded-xl bg-red-50 p-4 text-sm text-red-900 border border-red-200">
              {error}
              <button
                type="button"
                className="ml-3 underline"
                onClick={() => void loadRoles()}
              >
                Retry
              </button>
            </div>
          </div>
        ) : filteredRoles.length === 0 ? (
          <div className="p-6 text-center sm:p-10">
            <div className="w-16 h-16 bg-surface-container-low rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="material-symbols-outlined text-outline text-[32px]">shield_person</span>
            </div>
            <p className="text-title-md font-bold text-on-surface mb-2">
              {roles.length === 0 ? "No custom roles yet" : "No matching roles"}
            </p>
            <p className="text-body-sm text-on-surface-variant max-w-sm mx-auto">
              {roles.length === 0
                ? "Create your first custom role to fine-tune access for your teammates."
                : "Try adjusting your search or filter criteria."}
            </p>
            {roles.length > 0 && filteredRoles.length === 0 ? (
              <button
                type="button"
                className="mt-4 inline-flex items-center justify-center rounded-lg border border-outline-variant bg-surface px-4 py-2 text-label-md font-bold text-on-surface shadow-sm transition-colors hover:bg-surface-container-low"
                onClick={() => {
                  setSearchTerm("");
                  setBaseRoleFilter("all");
                  setStatusFilter("all");
                }}
              >
                Clear filters
              </button>
            ) : null}
          </div>
        ) : (
          <div className="max-w-full overflow-x-auto">
            <table className="min-w-[880px] w-full border-collapse divide-y divide-outline-variant/30 text-start text-sm">
              <thead className="bg-surface-container-low">
                <tr>
                  <th className="px-lg py-4 font-bold text-on-surface-variant text-label-sm uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-lg py-4 font-bold text-on-surface-variant text-label-sm uppercase tracking-wider">
                    Base Role
                  </th>
                  <th className="px-lg py-4 font-bold text-on-surface-variant text-label-sm uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-lg py-4 font-bold text-on-surface-variant text-label-sm uppercase tracking-wider">
                    Users
                  </th>
                  <th className="px-lg py-4 font-bold text-on-surface-variant text-label-sm uppercase tracking-wider">
                    Version
                  </th>
                  <th className="px-lg py-4 font-bold text-on-surface-variant text-label-sm uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/30 bg-surface-container-lowest">
                {filteredRoles.map((role) => (
                  <tr
                    key={role.id}
                    className="transition-colors hover:bg-surface-container-low/50"
                  >
                    <td className="px-lg py-4 font-bold text-on-surface">
                      {role.name}
                      {editingRole === role.id ? (
                        <div className="mt-2">
                          <input
                            className="w-full rounded-md border border-outline-variant bg-surface px-3 py-1.5 text-sm text-on-surface shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                          />
                          {editError ? (
                            <p className="mt-1 text-[11px] text-error">{editError}</p>
                          ) : null}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-lg py-4 text-on-surface-variant">
                      {editingRole === role.id ? (
                        <select
                          className="w-full rounded-md border border-outline-variant bg-surface px-3 py-1.5 text-sm text-on-surface shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                          value={editBaseRole}
                          onChange={(e) =>
                            setEditBaseRole(e.target.value as "COMPANY_ADMIN" | "EMPLOYEE")
                          }
                        >
                          {BASE_ROLE_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-bold bg-surface-container text-on-surface-variant uppercase tracking-wider border border-outline-variant/30">
                          {role.baseRole === "COMPANY_ADMIN" ? "Company Admin" : "Employee"}
                        </span>
                      )}
                    </td>
                    <td className="px-lg py-4 text-on-surface-variant">
                      <span
                        className={
                          role.status === "active"
                            ? "inline-flex items-center gap-1 rounded-full bg-tertiary-container/30 px-2 py-0.5 text-xs font-bold text-tertiary-fixed-dim"
                            : "inline-flex items-center gap-1 rounded-full bg-surface-container px-2 py-0.5 text-xs font-medium text-on-surface-variant"
                        }
                      >
                        {role.status === "active" ? (
                          <span className="material-symbols-outlined text-[14px]">
                            check_circle
                          </span>
                        ) : (
                          <span className="material-symbols-outlined text-[14px]">
                            archive
                          </span>
                        )}
                        {role.status === "active" ? "Active" : "Archived"}
                      </span>
                    </td>
                    <td className="px-lg py-4 text-on-surface-variant font-medium">
                      {role.userCount}
                    </td>
                    <td className="px-lg py-4 text-on-surface-variant font-mono">
                      v{role.version}
                    </td>
                    <td className="px-lg py-4">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="inline-flex items-center justify-center rounded-md border border-outline-variant bg-surface px-3 py-1.5 text-xs font-bold text-on-surface-variant shadow-sm hover:bg-surface-container-low transition-colors"
                          onClick={() => void openRoleDetails(role.id)}
                        >
                          <span className="material-symbols-outlined text-[16px]">
                            info
                          </span>
                          View
                        </button>
                        {canUpdate && editingRole !== role.id && (
                          <button
                            type="button"
                            className="inline-flex items-center justify-center rounded-md border border-outline-variant bg-surface px-3 py-1.5 text-xs font-bold text-on-surface-variant shadow-sm hover:bg-surface-container-low transition-colors"
                            onClick={() => startEdit(role)}
                          >
                            <span className="material-symbols-outlined text-[16px]">
                              edit
                            </span>
                            Edit
                          </button>
                        )}
                        {canUpdate && editingRole === role.id && (
                          <>
                            <button
                              type="button"
                              className="inline-flex items-center justify-center rounded-md bg-secondary text-on-secondary px-3 py-1.5 text-xs font-bold shadow-sm hover:bg-secondary-container hover:text-on-secondary-container transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                              disabled={editSubmitting}
                              onClick={() => void handleEdit(role.id)}
                            >
                              {editSubmitting ? "Saving..." : "Save"}
                            </button>
                            <button
                              type="button"
                              className="inline-flex items-center justify-center rounded-md border border-outline-variant bg-surface px-3 py-1.5 text-xs font-bold text-on-surface-variant shadow-sm hover:bg-surface-container-low transition-colors"
                              onClick={() => setEditingRole(null)}
                            >
                              Cancel
                            </button>
                          </>
                        )}
                        {canAssign && role.status === "active" && (
                          <button
                            type="button"
                            className="inline-flex items-center justify-center rounded-md border border-outline-variant bg-surface px-3 py-1.5 text-xs font-bold text-on-surface-variant shadow-sm hover:bg-surface-container-low transition-colors"
                            onClick={() => void openUserAssignments(role)}
                          >
                            <span className="material-symbols-outlined text-[16px]">
                              group
                            </span>
                            Assign
                          </button>
                        )}
                        {canUpdate && role.status === "active" && (
                          <button
                            type="button"
                            className="inline-flex items-center justify-center rounded-md border border-outline-variant bg-surface px-3 py-1.5 text-xs font-bold text-on-surface-variant shadow-sm hover:bg-surface-container-low transition-colors"
                            onClick={() =>
                              setLifecycleAction({ type: "archive", role })
                            }
                          >
                            <span className="material-symbols-outlined text-[16px]">
                              archive
                            </span>
                            Archive
                          </button>
                        )}
                        {canUpdate && role.status === "archived" && (
                          <>
                            <button
                              type="button"
                              className="inline-flex items-center justify-center rounded-md border border-primary/30 bg-surface px-3 py-1.5 text-xs font-bold text-primary shadow-sm hover:bg-primary/10 transition-colors"
                              onClick={() =>
                                setLifecycleAction({ type: "reactivate", role })
                              }
                            >
                              <span className="material-symbols-outlined text-[16px]">
                                unarchive
                              </span>
                              Reactivate
                            </button>
                            <button
                              type="button"
                              className="inline-flex items-center justify-center rounded-md border border-error/30 bg-surface px-3 py-1.5 text-xs font-bold text-error shadow-sm hover:bg-error-container hover:text-on-error-container transition-colors"
                              onClick={() =>
                                setLifecycleAction({ type: "delete", role })
                              }
                            >
                              <span className="material-symbols-outlined text-[16px]">
                                delete
                              </span>
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DashboardPanel>

      {selectedRole && (
        <RoleDetailsDrawer
          role={selectedRole}
          onClose={closeRoleDetails}
          catalog={permissionCatalog}
          loading={roleDetailsLoading}
          error={roleDetailsError}
        />
      )}

      {lifecycleAction && (
        <LifecycleConfirmation
          action={lifecycleAction.type}
          role={lifecycleAction.role}
          destination={migrationDestination}
          onDestinationSelect={setMigrationDestination}
          availableRoles={roles.filter((r) => r.id !== lifecycleAction.role.id && r.status === "active")}
          onConfirm={handleLifecycle}
          onCancel={() => {
            setLifecycleAction(null);
            setMigrationDestination(null);
            setMigrationResult(null);
            setLifecycleError(null);
          }}
          submitting={lifecycleSubmitting}
          error={lifecycleError}
          migrationResult={migrationResult}
        />
      )}

      {assignmentRole && (
        <UserAssignmentDrawer
          role={assignmentRole}
          users={assignmentUsers}
          search={assignmentSearch}
          onSearchChange={setAssignmentSearch}
          onSearchSubmit={(term) => setAssignmentSearch(term)}
          onAssign={handleAssignUser}
          onRemove={handleRemoveAssignment}
          onRefresh={() => void openUserAssignments(assignmentRole)}
          onClose={() => {
            setAssignmentRole(null);
            setAssignmentUsers([]);
            setAssignmentSearch("");
            setAssignmentError(null);
          }}
          loading={assignmentLoading}
          saving={assignmentSaving}
          error={assignmentError}
        />
      )}
    </DashboardPage>
  );
}

function RoleFilters({
  searchTerm,
  onSearchChange,
  baseRoleFilter,
  onBaseRoleFilterChange,
  statusFilter,
  onStatusFilterChange,
}: {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  baseRoleFilter: "all" | "COMPANY_ADMIN" | "EMPLOYEE";
  onBaseRoleFilterChange: (value: "all" | "COMPANY_ADMIN" | "EMPLOYEE") => void;
  statusFilter: "all" | "active" | "archived";
  onStatusFilterChange: (value: "all" | "active" | "archived") => void;
}) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="relative max-w-sm">
        <span className="material-symbols-outlined absolute start-3 top-1/2 -translate-y-1/2 text-[18px] text-on-surface-variant">
          search
        </span>
        <input
          type="text"
          className="w-full rounded-full border border-outline-variant bg-surface ps-10 pe-4 py-2 text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary"
          placeholder="Search roles..."
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>
      <div className="flex gap-2">
        <select
          className="rounded-lg border border-outline-variant bg-surface px-3 py-1.5 text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary"
          value={baseRoleFilter}
          onChange={(e) =>
            onBaseRoleFilterChange(e.target.value as "all" | "COMPANY_ADMIN" | "EMPLOYEE")
          }
        >
          <option value="all">All base roles</option>
          {BASE_ROLE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <select
          className="rounded-lg border border-outline-variant bg-surface px-3 py-1.5 text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary"
          value={statusFilter}
          onChange={(e) => onStatusFilterChange(e.target.value as "all" | "active" | "archived")}
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function RolePreview({
  roleName,
  baseRole,
}: {
  roleName: string;
  baseRole: "COMPANY_ADMIN" | "EMPLOYEE";
}) {
  return (
    <div className="rounded-2xl border border-outline-variant/40 bg-surface-container p-4">
      <p className="text-label-md font-bold text-on-surface">
        Role preview
      </p>
      <div className="mt-4 rounded-xl border border-outline-variant/30 bg-surface px-4 py-3">
        <p className="text-label-md font-semibold text-on-surface">
          {roleName.trim() || "Role name"}
        </p>
        <p className="mt-1 text-sm text-on-surface-variant">
          {baseRole === "COMPANY_ADMIN"
            ? "Company admin permissions"
            : "Standard employee permissions"}
        </p>
      </div>
      <div className="mt-4 rounded-xl bg-primary/10 p-3 text-sm text-primary">
        Tip: keep role names short and specific so they are easy to manage later.
      </div>
    </div>
  );
}

function PermissionSelector({
  catalog,
  selectedGrants,
  onChange,
  disabled,
}: {
  catalog: PermissionCatalogGroup[];
  selectedGrants: PermissionGrant[];
  onChange: (grants: PermissionGrant[]) => void;
  disabled: boolean;
}) {
  const [search, setSearch] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const filteredCatalog = catalog
    .map((group) => ({
      ...group,
      permissions: group.permissions.filter((p) =>
        p.label.toLowerCase().includes(search.toLowerCase()) ||
        p.id.toLowerCase().includes(search.toLowerCase()) ||
        p.description.toLowerCase().includes(search.toLowerCase())
      ),
    }))
    .filter((group) => group.permissions.length > 0);

  const isPermissionSelected = (permissionId: string) =>
    selectedGrants.some((g) => g.permission === permissionId);

  const togglePermission = (permissionId: string) => {
    const exists = selectedGrants.some((g) => g.permission === permissionId);
    if (exists) {
      onChange(selectedGrants.filter((g) => g.permission !== permissionId));
    } else {
      onChange([...selectedGrants, { permission: permissionId }]);
    }
  };

  const toggleGroupExpansion = (groupName: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupName)) {
        next.delete(groupName);
      } else {
        next.add(groupName);
      }
      return next;
    });
  };

  if (disabled) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-on-surface-variant">Loading permission catalog...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <label className="mb-2 block text-label-md font-bold text-on-surface-variant">
        Explicit Permissions
      </label>
      <div className="relative">
        <span className="material-symbols-outlined absolute start-3 top-1/2 -translate-y-1/2 text-[18px] text-on-surface-variant">
          search
        </span>
        <input
          type="text"
          className="w-full rounded-lg border border-outline-variant bg-surface ps-10 pe-4 py-2 text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary"
          placeholder="Search permissions..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {filteredCatalog.length === 0 ? (
        <p className="text-sm text-on-surface-variant">
          {catalog.length === 0 ? "No permissions available" : "No matching permissions"}
        </p>
      ) : (
        <div className="max-h-80 space-y-2 overflow-y-auto rounded-lg border border-outline-variant/30 p-2">
          {filteredCatalog.map((group) => {
            const isExpanded = expandedGroups.has(group.group);
            const groupSelectedCount = group.permissions.filter((p) =>
              isPermissionSelected(p.id)
            ).length;
            return (
              <div key={group.group} className="rounded-md border border-outline-variant/20">
                <button
                  type="button"
                  className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-surface-container-low"
                  onClick={() => toggleGroupExpansion(group.group)}
                >
                  <span className="text-label-md font-bold text-on-surface">
                    {group.label}
                  </span>
                  <div className="flex items-center gap-2">
                    {groupSelectedCount > 0 ? (
                      <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                        {groupSelectedCount} selected
                      </span>
                    ) : null}
                    <span className="material-symbols-outlined text-on-surface-variant">
                      {isExpanded ? "expand_less" : "expand_more"}
                    </span>
                  </div>
                </button>
                {isExpanded ? (
                  <div className="border-t border-outline-variant/20 bg-surface-container-lowest">
                    {group.permissions.map((permission) => (
                      <label
                        key={permission.id}
                        className="flex cursor-pointer items-start gap-3 px-3 py-2.5 text-sm hover:bg-surface-container"
                      >
                        <input
                          type="checkbox"
                          className="mt-0.5 h-4 w-4 rounded border-outline-variant text-primary focus:ring-2 focus:ring-primary"
                          checked={isPermissionSelected(permission.id)}
                          onChange={() => togglePermission(permission.id)}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-on-surface">{permission.label}</p>
                          <p className="text-xs text-on-surface-variant">
                            {permission.description}
                          </p>
                        </div>
                      </label>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RoleDetailsDrawer({
  role,
  onClose,
  catalog,
  loading,
  error,
}: {
  role: RoleView;
  onClose: () => void;
  catalog: PermissionCatalogGroup[];
  loading: boolean;
  error: string | null;
}) {
  const basePermissions = catalog
    .flatMap((g) => g.permissions)
    .map((p) => p.id);

  const inheritedGrants = role.grants.filter((g) =>
    basePermissions.includes(g.permission)
  );

  const explicitGrants = role.grants.filter(
    (g) => !basePermissions.includes(g.permission)
  );

  const effectivePermissions = [...new Set([
    ...basePermissions,
    ...role.grants.map((g) => g.permission),
  ])];

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/50 p-4">
        <DashboardPanel className="w-full max-w-xl">
          <div className="p-6 text-center">
            <span className="material-symbols-outlined animate-spin text-[32px]">
              progress_activity
            </span>
            <p className="mt-2 text-sm text-on-surface-variant">
              Loading role details...
            </p>
          </div>
        </DashboardPanel>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/50 p-4">
        <DashboardPanel className="w-full max-w-xl">
          <div className="p-6">
            <div className="rounded-xl bg-red-50 p-4 text-sm text-red-900 border border-red-200">
              {error}
            </div>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-lg border border-outline-variant bg-surface px-4 py-2 text-label-md font-bold text-on-surface shadow-sm transition-colors hover:bg-surface-container-low"
                onClick={onClose}
              >
                Close
              </button>
            </div>
          </div>
        </DashboardPanel>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-background/50 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="role-details-title"
    >
      <DashboardPanel className="w-full max-w-2xl">
        <div className="flex items-start justify-between p-4 pb-3">
          <h2 id="role-details-title" className="text-title-lg font-bold text-primary">
            {role.name}
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-high"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="px-4 pb-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-on-surface-variant">Base Role</p>
              <p className="font-medium text-on-surface">
                {role.baseRole === "COMPANY_ADMIN" ? "Company Admin" : "Employee"}
              </p>
            </div>
            <div>
              <p className="text-on-surface-variant">Status</p>
              <p className="font-medium text-on-surface capitalize">{role.status}</p>
            </div>
            <div>
              <p className="text-on-surface-variant">Assigned Users</p>
              <p className="font-medium text-on-surface">{role.userCount}</p>
            </div>
            <div>
              <p className="text-on-surface-variant">Version</p>
              <p className="font-medium text-on-surface">v{role.version}</p>
            </div>
          </div>

          <div className="mt-6 space-y-4">
            <h3 className="text-label-md font-bold text-on-surface">
              Permissions
            </h3>

            {inheritedGrants.length > 0 ? (
              <div>
                <p className="text-sm font-medium text-on-surface-variant">
                  Inherited ({inheritedGrants.length})
                </p>
                <ul className="mt-2 space-y-1">
                  {inheritedGrants.map((grant) => (
                    <li key={grant.permission} className="text-sm text-on-surface-variant">
                      • {grant.permission}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {explicitGrants.length > 0 ? (
              <div>
                <p className="text-sm font-medium text-on-surface-variant">
                  Explicit Grants ({explicitGrants.length})
                </p>
                <ul className="mt-2 space-y-1">
                  {explicitGrants.map((grant) => (
                    <li key={grant.permission} className="text-sm text-on-surface">
                      • {grant.permission}
                      {grant.scopes && Object.keys(grant.scopes).length > 0 ? (
                        <span className="text-xs text-on-surface-variant">
                          {" "}
                          (scoped)
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {role.grants.length === 0 ? (
              <p className="text-sm text-on-surface-variant">
                No explicit grants. Uses only base-role permissions.
              </p>
            ) : null}

            <p className="text-label-sm text-on-surface-variant">
              Total effective permissions: {effectivePermissions.length}
            </p>
          </div>

          <div className="mt-6 flex justify-end border-t border-outline-variant/30 pt-4">
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-lg border border-outline-variant bg-surface px-4 py-2 text-label-md font-bold text-on-surface shadow-sm transition-colors hover:bg-surface-container-low"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </div>
      </DashboardPanel>
    </div>
  );
}

function LifecycleConfirmation({
  action,
  role,
  onConfirm,
  onCancel,
  submitting,
  error,
  destination,
  onDestinationSelect,
  availableRoles,
  migrationResult,
}: {
  action: "clone" | "archive" | "reactivate" | "delete" | "migrate";
  role: RoleView;
  onConfirm: () => void;
  onCancel: () => void;
  submitting: boolean;
  error: string | null;
  destination: RoleView | null;
  onDestinationSelect: (role: RoleView | null) => void;
  availableRoles: RoleView[];
  migrationResult: { affected: number; skipped: number; conflicted: number } | null;
}) {
  const getTitle = () => {
    switch (action) {
      case "clone":
        return "Clone Role";
      case "archive":
        return "Archive Role";
      case "reactivate":
        return "Reactivate Role";
      case "delete":
        return "Delete Role";
      case "migrate":
        return "Migrate Users";
    }
  };

  const getMessage = () => {
    switch (action) {
      case "clone":
        return `Create a copy of "${role.name}"?`;
      case "archive":
        return `Archive "${role.name}"? Archived roles cannot be assigned.`;
      case "reactivate":
        return `Reactivate "${role.name}"?`;
      case "delete":
        return `Delete "${role.name}"? This cannot be undone.`;
      case "migrate":
        return "Select a destination role to migrate assigned users.";
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-background/50 p-4 sm:items-center">
      <DashboardPanel className="w-full max-w-lg">
        <div className="p-6">
          <h2 className="text-title-lg font-bold text-primary">{getTitle()}</h2>
          <p className="mt-2 text-sm text-on-surface-variant">{getMessage()}</p>

          {action === "migrate" && (
            <div className="mt-4">
              <p className="mb-2 text-label-sm font-bold text-on-surface-variant">
                Destination Role
              </p>
              <select
                className="w-full rounded-lg border border-outline-variant bg-surface px-md py-sm transition-all outline-none focus:border-transparent focus:ring-2 focus:ring-primary"
                value={destination?.id ?? ""}
                onChange={(e) => {
                  const role = availableRoles.find((r) => r.id === e.target.value);
                  onDestinationSelect(role ?? null);
                }}
              >
                <option value="">Select destination...</option>
                {availableRoles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.userCount} user{r.userCount !== 1 ? "s" : ""})
                  </option>
                ))}
              </select>
              {destination && (
                <p className="mt-2 text-xs text-on-surface-variant">
                  Destination has {destination.userCount} assigned user
                  {destination.userCount !== 1 ? "s" : ""}.
                </p>
              )}
            </div>
          )}

          {migrationResult && action === "migrate" ? (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-sm font-bold text-emerald-900">Migration complete</p>
              <ul className="mt-2 text-sm text-emerald-800">
                <li>• Affected: {migrationResult.affected}</li>
                <li>• Skipped: {migrationResult.skipped}</li>
                <li>• Conflicted: {migrationResult.conflicted}</li>
              </ul>
            </div>
          ) : null}

          {error ? (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
              {error}
            </div>
          ) : null}

          <div className="mt-6 flex gap-3 border-t border-outline-variant/30 pt-4">
            <button
              type="button"
              className="inline-flex min-h-10 items-center justify-center rounded-lg border border-outline-variant bg-surface px-4 py-2 text-label-md font-bold text-on-surface shadow-sm transition-colors hover:bg-surface-container-low disabled:cursor-not-allowed disabled:opacity-50"
              onClick={onCancel}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="button"
              className={
                action === "delete"
                  ? "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-error px-4 py-2 text-label-md font-bold text-on-error shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  : "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-label-md font-bold text-on-primary shadow-sm transition-all hover:bg-secondary-container hover:text-on-secondary-container disabled:cursor-not-allowed disabled:opacity-50"
              }
              onClick={onConfirm}
              disabled={submitting || (action === "migrate" && !destination)}
            >
              {submitting ? (
                <span className="material-symbols-outlined animate-spin text-[18px]">
                  progress_activity
                </span>
              ) : null}
              {submitting
                ? "Processing..."
                : action === "delete"
                  ? "Delete"
                  : action === "archive"
                    ? "Archive"
                    : "Confirm"}
            </button>
          </div>
        </div>
      </DashboardPanel>
    </div>
  );
}

function UserAssignmentDrawer({
  role,
  users,
  search,
  onSearchChange,
  onSearchSubmit,
  onAssign,
  onRemove,
  onRefresh,
  onClose,
  loading,
  saving,
  error,
}: {
  role: RoleView;
  users: {
    id: string;
    name: string;
    email: string;
    role: string;
    status: string;
    customRoleId?: string;
  }[];
  search: string;
  onSearchChange: (value: string) => void;
  onSearchSubmit: (value: string) => void;
  onAssign: (userId: string) => void;
  onRemove: (userId: string) => void;
  onRefresh: () => void;
  onClose: () => void;
  loading: boolean;
  saving: Record<string, boolean>;
  error: string | null;
}) {
  const filteredUsers = users.filter(
    (user) =>
      user.name.toLowerCase().includes(search.toLowerCase()) ||
      user.email.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-background/50 p-4 sm:items-center">
      <DashboardPanel className="flex h-[80vh] w-full max-w-2xl flex-col">
        <div className="flex items-center justify-between p-4 pb-3">
          <h2 className="text-title-lg font-bold text-primary">
            Assign Users to: {role.name}
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-high"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="px-4 pb-4">
          <div className="relative">
            <span className="material-symbols-outlined absolute start-3 top-1/2 -translate-y-1/2 text-[18px] text-on-surface-variant">
              search
            </span>
            <input
              type="text"
              className="w-full rounded-lg border border-outline-variant bg-surface ps-10 pe-4 py-2 text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary"
              placeholder="Search users..."
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  onSearchSubmit(search);
                }
              }}
            />
          </div>

          {error ? (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
              {error}
              <button
                type="button"
                className="ml-3 underline"
                onClick={onRefresh}
              >
                Retry
              </button>
            </div>
          ) : null}

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-on-surface-variant">
              <span className="material-symbols-outlined animate-spin">
                progress_activity
              </span>
              Loading users...
            </div>
          ) : filteredUsers.length === 0 ? (
            <p className="py-8 text-center text-sm text-on-surface-variant">
              No users found.
            </p>
          ) : (
            <div className="mt-4 max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-container-low">
                  <tr>
                    <th className="px-3 py-2 text-left font-bold text-on-surface-variant">
                      Name
                    </th>
                    <th className="px-3 py-2 text-left font-bold text-on-surface-variant">
                      Email
                    </th>
                    <th className="px-3 py-2 text-left font-bold text-on-surface-variant">
                      Status
                    </th>
                    <th className="px-3 py-2 text-left font-bold text-on-surface-variant">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/30">
                  {filteredUsers.map((user) => {
                    const isAssigned = user.customRoleId === role.id;
                    const hasCompatibleBaseRole = user.role === role.baseRole;
                    return (
                      <tr key={user.id} className="hover:bg-surface-container-low/50">
                        <td className="px-3 py-2 text-on-surface">
                          {user.name}
                          {!hasCompatibleBaseRole && (
                            <span className="block text-xs text-error">
                              Base role mismatch
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-on-surface-variant">
                          {user.email}
                        </td>
                        <td className="px-3 py-2 text-on-surface-variant">
                          {user.status}
                        </td>
                        <td className="px-3 py-2">
                          {isAssigned ? (
                            <button
                              type="button"
                              className="inline-flex items-center justify-center rounded-md border border-error/30 bg-surface px-3 py-1.5 text-xs font-bold text-error shadow-sm hover:bg-error-container hover:text-on-error-container transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                              disabled={saving[user.id]}
                              onClick={() => void onRemove(user.id)}
                            >
                              {saving[user.id] ? "Removing..." : "Remove"}
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="inline-flex items-center justify-center rounded-md bg-secondary text-on-secondary px-3 py-1.5 text-xs font-bold shadow-sm hover:bg-secondary-container hover:text-on-secondary-container transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                              disabled={saving[user.id] || !hasCompatibleBaseRole}
                              onClick={() => void onAssign(user.id)}
                            >
                              {saving[user.id] ? "Assigning..." : "Assign"}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-6 flex justify-end border-t border-outline-variant/30 pt-4">
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-lg border border-outline-variant bg-surface px-4 py-2 text-label-md font-bold text-on-surface shadow-sm transition-colors hover:bg-surface-container-low"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </div>
      </DashboardPanel>
    </div>
  );
}