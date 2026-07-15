"use client";

import type { RoleView } from "@/types/api/users.types";
import type { PermissionGroup } from "@/types/api/permissions.types";

interface RoleDetailsPanelProps {
  role: RoleView;
  catalogGroups: PermissionGroup[];
}

export function RoleDetailsPanel({
  role,
  catalogGroups,
}: RoleDetailsPanelProps) {
  const permissions = role.permissions ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
          <span className="material-symbols-outlined text-primary text-[24px]">
            shield_person
          </span>
        </div>
        <div>
          <h3 className="text-title-lg font-bold text-on-surface">
            {role.name}
          </h3>
          <div className="mt-1 flex items-center gap-2">
            <span className="inline-flex items-center rounded-md bg-surface-container px-2 py-0.5 text-xs font-bold uppercase tracking-wider border border-outline-variant/30 text-on-surface-variant">
              {role.baseRole === "COMPANY_ADMIN"
                ? "Company Admin"
                : "Employee"}
            </span>
            {role.status === "archived" && (
              <span className="inline-flex items-center rounded-md bg-error-container px-2 py-0.5 text-xs font-bold text-on-error-container">
                Archived
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 rounded-xl bg-surface-container-low p-4">
        <div>
          <p className="text-label-sm text-on-surface-variant">
            Users
          </p>
          <p className="text-title-lg font-bold text-on-surface">
            {role.userCount}
          </p>
        </div>
        <div>
          <p className="text-label-sm text-on-surface-variant">
            Permissions
          </p>
          <p className="text-title-lg font-bold text-on-surface">
            {permissions.length}
          </p>
        </div>
        <div>
          <p className="text-label-sm text-on-surface-variant">
            Version
          </p>
          <p className="text-title-lg font-bold text-on-surface">
            {role.version ?? 1}
          </p>
        </div>
      </div>

      {role.scopes?.selfOnly && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <span className="font-bold">Self-only scope:</span> This
          role restricts document access to the user&apos;s own
          uploads.
        </div>
      )}

      <div>
        <h4 className="text-label-md font-bold text-on-surface mb-2">
          Granted Permissions
        </h4>
        {permissions.length === 0 ? (
          <p className="text-sm text-on-surface-variant">
            No custom permissions assigned. This role uses base
            role defaults only.
          </p>
        ) : (
          <div className="space-y-2">
            {catalogGroups.map((group) => {
              const groupPerms = permissions.filter((p) =>
                group.permissions.some((gp) => gp.id === p),
              );
              if (groupPerms.length === 0) return null;
              return (
                <div key={group.group}>
                  <p className="text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-1">
                    {group.label}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {groupPerms.map((p) => {
                      const perm = group.permissions.find(
                        (gp) => gp.id === p,
                      );
                      return (
                        <span
                          key={p}
                          className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                        >
                          {perm?.label ?? p}
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="border-t border-outline-variant/30 pt-3 text-xs text-on-surface-variant">
        Created{" "}
        {new Date(role.createdAt).toLocaleDateString()}
        {role.updatedAt !== role.createdAt && (
          <>
            {" "}
            · Updated{" "}
            {new Date(role.updatedAt).toLocaleDateString()}
          </>
        )}
      </div>
    </div>
  );
}
