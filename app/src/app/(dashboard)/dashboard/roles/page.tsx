"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ApiError } from "@/lib/api-client";
import { listRoles, createRole, updateRole, deleteRole } from "@/services/roles.service";
import type { RoleView } from "@/types/api/users.types";

export default function RolesPage() {
  const [roles, setRoles] = useState<RoleView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createBaseRole, setCreateBaseRole] = useState<"COMPANY_ADMIN" | "EMPLOYEE">("EMPLOYEE");
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSubmitting, setCreateSubmitting] = useState(false);

  const [editingRole, setEditingRole] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editBaseRole, setEditBaseRole] = useState<"COMPANY_ADMIN" | "EMPLOYEE">("EMPLOYEE");
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
    void loadRoles();
  }, [loadRoles]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateError(null);
    setCreateSubmitting(true);
    setSuccessMessage(null);

    try {
      await createRole({ name: createName.trim(), baseRole: createBaseRole });
      setSuccessMessage(`Role "${createName.trim()}" created successfully`);
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

    const payload: { name?: string; baseRole?: "COMPANY_ADMIN" | "EMPLOYEE" } = {};
    if (editName.trim()) payload.name = editName.trim();
    if (editBaseRole) payload.baseRole = editBaseRole;

    try {
      const response = await updateRole(roleId, payload);
      setSuccessMessage(`Role "${response.data.role.name}" updated successfully`);
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
    <main className="p-6">
      <div className="max-w-4xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Custom Roles</h1>
            <p className="mt-2 text-sm text-slate-600">
              Define custom roles that map to existing permission levels.
            </p>
          </div>
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
            onClick={() => {
              setShowCreateForm(!showCreateForm);
              setCreateError(null);
            }}
          >
            {showCreateForm ? "Cancel" : "Create Role"}
          </button>
        </div>

        {successMessage ? (
          <div className="mt-4 rounded-md bg-emerald-50 p-3 text-sm text-emerald-900">
            {successMessage}
          </div>
        ) : null}

        {showCreateForm ? (
          <form className="mt-6 space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm" onSubmit={(event) => void handleCreate(event)}>
            <div>
              <label className="block text-sm font-medium text-slate-700">Role Name</label>
              <input
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="e.g. HR, IT, Sales"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Permission Level</label>
              <select
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                value={createBaseRole}
                onChange={(e) => setCreateBaseRole(e.target.value as "COMPANY_ADMIN" | "EMPLOYEE")}
              >
                <option value="EMPLOYEE">Employee</option>
                <option value="COMPANY_ADMIN">Company Admin</option>
              </select>
            </div>
            {createError ? (
              <div className="rounded-md bg-rose-50 p-3 text-sm text-rose-900">{createError}</div>
            ) : null}
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-400"
              disabled={createSubmitting}
            >
              {createSubmitting ? "Creating..." : "Create Role"}
            </button>
          </form>
        ) : null}

        <section className="mt-8 overflow-x-auto">
          {loading ? (
            <div className="text-sm text-slate-600">Loading roles...</div>
          ) : error ? (
            <div className="rounded-md bg-rose-50 p-3 text-sm text-rose-900">{error}</div>
          ) : roles.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
              No custom roles yet. Create your first role above.
            </div>
          ) : (
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 font-medium text-slate-700">Name</th>
                  <th className="px-4 py-3 font-medium text-slate-700">Permission Level</th>
                  <th className="px-4 py-3 font-medium text-slate-700">Users</th>
                  <th className="px-4 py-3 font-medium text-slate-700">Created</th>
                  <th className="px-4 py-3 font-medium text-slate-700">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {roles.map((role) => (
                  <tr key={role.id}>
                    {editingRole === role.id ? (
                      <>
                        <td className="px-4 py-3">
                          <input
                            className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                          />
                          {editError ? (
                            <p className="mt-1 text-xs text-rose-600">{editError}</p>
                          ) : null}
                        </td>
                        <td className="px-4 py-3">
                          <select
                            className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                            value={editBaseRole}
                            onChange={(e) => setEditBaseRole(e.target.value as "COMPANY_ADMIN" | "EMPLOYEE")}
                          >
                            <option value="EMPLOYEE">Employee</option>
                            <option value="COMPANY_ADMIN">Company Admin</option>
                          </select>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{role.userCount}</td>
                        <td className="px-4 py-3 text-slate-600">
                          {new Date(role.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            <button
                              type="button"
                              className="inline-flex items-center justify-center rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                              disabled={editSubmitting}
                              onClick={() => void handleEdit(role.id)}
                            >
                              {editSubmitting ? "Saving..." : "Save"}
                            </button>
                            <button
                              type="button"
                              className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                              onClick={() => setEditingRole(null)}
                            >
                              Cancel
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-3 font-medium text-slate-900">{role.name}</td>
                        <td className="px-4 py-3 text-slate-600">
                          {role.baseRole === "COMPANY_ADMIN" ? "Company Admin" : "Employee"}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{role.userCount}</td>
                        <td className="px-4 py-3 text-slate-600">
                          {new Date(role.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            <button
                              type="button"
                              className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                              onClick={() => startEdit(role)}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="inline-flex items-center justify-center rounded-md border border-rose-300 bg-white px-3 py-1.5 text-sm font-semibold text-rose-700 shadow-sm hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                              disabled={deletingRoleId === role.id}
                              onClick={() => {
                                if (window.confirm(`Delete role "${role.name}"? This cannot be undone.`)) {
                                  void handleDelete(role.id);
                                }
                              }}
                            >
                              {deletingRoleId === role.id ? "Deleting..." : "Delete"}
                            </button>
                          </div>
                          {deleteError && deletingRoleId === role.id ? (
                            <p className="mt-1 text-xs text-rose-600">{deleteError}</p>
                          ) : null}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </main>
  );
}
