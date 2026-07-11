"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ApiError } from "@/lib/api-client";
import {
  listRoles,
  createRole,
  updateRole,
  deleteRole,
} from "@/services/roles.service";
import type { RoleView } from "@/types/api/users.types";
import {
  DashboardPage,
  DashboardPageHeader,
  DashboardPanel,
} from "@/components/ui/DashboardPage";

export default function RolesPage() {
  const [roles, setRoles] = useState<RoleView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createBaseRole, setCreateBaseRole] = useState<
    "COMPANY_ADMIN" | "EMPLOYEE"
  >("EMPLOYEE");
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSubmitting, setCreateSubmitting] = useState(false);

  const [editingRole, setEditingRole] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editBaseRole, setEditBaseRole] = useState<
    "COMPANY_ADMIN" | "EMPLOYEE"
  >("EMPLOYEE");
  const [editError, setEditError] = useState<string | null>(null);
  const [editSubmitting, setEditSubmitting] = useState(false);

  const [deletingRoleId, setDeletingRoleId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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

  useEffect(() => {
    async function fetchRoles() {
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
    }
    fetchRoles();
  }, []);

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
      await createRole({ name: normalizedName, baseRole: createBaseRole });
      setSuccessMessage(`Role "${normalizedName}" created successfully`);
      setCreateName("");
      setCreateBaseRole("EMPLOYEE");
      setShowCreateForm(false);
      void loadRoles();
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
    setEditBaseRole(role.baseRole as "COMPANY_ADMIN" | "EMPLOYEE");
    setEditError(null);
  }

  async function handleEdit(roleId: string) {
    setEditError(null);
    setEditSubmitting(true);
    setSuccessMessage(null);

    const payload: { name?: string; baseRole?: "COMPANY_ADMIN" | "EMPLOYEE" } =
      {};
    if (editName.trim()) payload.name = editName.trim();
    if (editBaseRole) payload.baseRole = editBaseRole;

    try {
      const response = await updateRole(roleId, payload);
      setSuccessMessage(
        `Role "${response.data.role.name}" updated successfully`,
      );
      setEditingRole(null);
      void loadRoles();
    } catch (err) {
      if (err instanceof ApiError) {
        setEditError(err.message);
      } else {
        setEditError("Failed to update role");
      }
    } finally {
      setEditSubmitting(false);
    }
  }

  async function handleDelete(roleId: string) {
    setDeletingRoleId(roleId);
    setDeleteError(null);
    setSuccessMessage(null);

    try {
      await deleteRole(roleId);
      setSuccessMessage("Role deleted successfully");
      void loadRoles();
    } catch (err) {
      if (err instanceof ApiError) {
        setDeleteError(err.message);
      } else {
        setDeleteError("Failed to delete role");
      }
    } finally {
      setDeletingRoleId(null);
    }
  }

  return (
    <DashboardPage>
      <DashboardPageHeader
        title="Custom Roles"
        description="Define custom roles that map to existing permission levels."
        actions={
          <button
            type="button"
            className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-label-md font-bold text-on-primary shadow-sm transition-all hover:bg-secondary-container hover:text-on-secondary-container sm:w-auto"
            onClick={() => {
              setShowCreateForm(!showCreateForm);
              setCreateError(null);
            }}
          >
            {showCreateForm ? (
              <>
                <span className="material-symbols-outlined text-[18px]">
                  close
                </span>
                Cancel
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-[18px]">
                  add
                </span>
                Create Role
              </>
            )}
          </button>
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
              <span className="material-symbols-outlined text-[16px]">
                shield_person
              </span>
              New access profile
            </div>
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="text-title-lg font-bold text-primary">
                  Create New Role
                </h2>
                <p className="mt-1 text-sm text-on-surface-variant">
                  Create a role with a clear name and a permission level that
                  matches how your team should work.
                </p>
              </div>
            </div>
          </div>

          <form
            className="space-y-4"
            onSubmit={(event) => void handleCreate(event)}
          >
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
                    Use a short, descriptive name so teammates can recognize the
                    role quickly.
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
                      setCreateBaseRole(
                        e.target.value as "COMPANY_ADMIN" | "EMPLOYEE",
                      )
                    }
                  >
                    <option value="EMPLOYEE">Employee</option>
                    <option value="COMPANY_ADMIN">Company Admin</option>
                  </select>
                  <p className="mt-2 text-sm text-on-surface-variant">
                    Company admins can manage settings, while employees have
                    standard access.
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-outline-variant/40 bg-surface-container p-4">
                <p className="text-label-md font-bold text-on-surface">
                  Role preview
                </p>
                <div className="mt-4 rounded-xl border border-outline-variant/30 bg-surface px-4 py-3">
                  <p className="text-label-md font-semibold text-on-surface">
                    {createName.trim() || "Role name"}
                  </p>
                  <p className="mt-1 text-sm text-on-surface-variant">
                    {createBaseRole === "COMPANY_ADMIN"
                      ? "Company admin permissions"
                      : "Standard employee permissions"}
                  </p>
                </div>
                <div className="mt-4 rounded-xl bg-primary/10 p-3 text-sm text-primary">
                  Tip: keep role names short and specific so they are easy to
                  manage later.
                </div>
              </div>
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
                  <span className="material-symbols-outlined text-[18px]">
                    save
                  </span>
                )}
                {createSubmitting ? "Creating..." : "Create Role"}
              </button>
            </div>
          </form>
        </DashboardPanel>
      ) : null}

      <DashboardPanel padding="none">
        {loading ? (
          <div className="flex items-center justify-center gap-2 p-6 text-sm text-on-surface-variant sm:p-8">
            <span className="material-symbols-outlined animate-spin">
              progress_activity
            </span>
            Loading roles...
          </div>
        ) : error ? (
          <div className="p-4 sm:p-6">
            <div className="rounded-xl bg-red-50 p-4 text-sm text-red-900 border border-red-200">
              {error}
            </div>
          </div>
        ) : roles.length === 0 ? (
          <div className="p-6 text-center sm:p-10">
            <div className="w-16 h-16 bg-surface-container-low rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="material-symbols-outlined text-outline text-[32px]">
                shield_person
              </span>
            </div>
            <p className="text-title-md font-bold text-on-surface mb-2">
              No custom roles yet
            </p>
            <p className="text-body-sm text-on-surface-variant max-w-sm mx-auto">
              Create your first custom role to fine-tune access for your
              teammates.
            </p>
          </div>
        ) : (
          <div className="max-w-full overflow-x-auto">
            <table className="min-w-[720px] w-full border-collapse divide-y divide-outline-variant/30 text-start text-sm">
              <thead className="bg-surface-container-low">
                <tr>
                  <th className="px-lg py-4 font-bold text-on-surface-variant text-label-sm uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-lg py-4 font-bold text-on-surface-variant text-label-sm uppercase tracking-wider">
                    Permission Level
                  </th>
                  <th className="px-lg py-4 font-bold text-on-surface-variant text-label-sm uppercase tracking-wider">
                    Users
                  </th>
                  <th className="px-lg py-4 font-bold text-on-surface-variant text-label-sm uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-lg py-4 font-bold text-on-surface-variant text-label-sm uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/30 bg-surface-container-lowest">
                {roles.map((role) => (
                  <tr
                    key={role.id}
                    className="transition-colors hover:bg-surface-container-low/50"
                  >
                    {editingRole === role.id ? (
                      <>
                        <td className="px-lg py-4">
                          <input
                            className="w-full rounded-md border border-outline-variant bg-surface px-3 py-1.5 text-sm text-on-surface shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                          />
                          {editError ? (
                            <p className="mt-1 text-[11px] text-error">
                              {editError}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-lg py-4">
                          <select
                            className="w-full rounded-md border border-outline-variant bg-surface px-3 py-1.5 text-sm text-on-surface shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                            value={editBaseRole}
                            onChange={(e) =>
                              setEditBaseRole(
                                e.target.value as "COMPANY_ADMIN" | "EMPLOYEE",
                              )
                            }
                          >
                            <option value="EMPLOYEE">Employee</option>
                            <option value="COMPANY_ADMIN">Company Admin</option>
                          </select>
                        </td>
                        <td className="px-lg py-4 text-on-surface-variant">
                          {role.userCount}
                        </td>
                        <td className="px-lg py-4 text-on-surface-variant text-body-sm whitespace-nowrap">
                          {new Date(role.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-lg py-4">
                          <div className="flex gap-2">
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
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-lg py-4 font-bold text-on-surface">
                          {role.name}
                        </td>
                        <td className="px-lg py-4 text-on-surface-variant">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-bold bg-surface-container text-on-surface-variant uppercase tracking-wider border border-outline-variant/30">
                            {role.baseRole === "COMPANY_ADMIN"
                              ? "Company Admin"
                              : "Employee"}
                          </span>
                        </td>
                        <td className="px-lg py-4 text-on-surface-variant font-medium">
                          {role.userCount}
                        </td>
                        <td className="px-lg py-4 text-on-surface-variant text-body-sm whitespace-nowrap">
                          {new Date(role.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-lg py-4">
                          <div className="flex gap-2">
                            <button
                              type="button"
                              className="inline-flex items-center justify-center rounded-md border border-outline-variant bg-surface px-3 py-1.5 text-xs font-bold text-on-surface-variant shadow-sm hover:bg-surface-container-low transition-colors"
                              onClick={() => startEdit(role)}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="inline-flex items-center justify-center rounded-md border border-error/30 bg-surface px-3 py-1.5 text-xs font-bold text-error shadow-sm hover:bg-error-container hover:text-on-error-container transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                              disabled={deletingRoleId === role.id}
                              onClick={() => {
                                if (
                                  window.confirm(
                                    `Delete role "${role.name}"? This cannot be undone.`,
                                  )
                                ) {
                                  void handleDelete(role.id);
                                }
                              }}
                            >
                              {deletingRoleId === role.id
                                ? "Deleting..."
                                : "Delete"}
                            </button>
                          </div>
                          {deleteError && deletingRoleId === role.id ? (
                            <p className="mt-2 text-[11px] text-error">
                              {deleteError}
                            </p>
                          ) : null}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DashboardPanel>
    </DashboardPage>
  );
}
