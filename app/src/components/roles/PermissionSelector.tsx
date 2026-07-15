"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getPermissionCatalog } from "@/services/permissions.service";
import type {
  PermissionGroup,
} from "@/types/api/permissions.types";
import { ApiError } from "@/lib/api-client";

interface PermissionSelectorProps {
  selected: string[];
  onChange: (permissions: string[]) => void;
  disabled?: boolean;
}

export function PermissionSelector({
  selected,
  onChange,
  disabled = false,
}: PermissionSelectorProps) {
  const [groups, setGroups] = useState<PermissionGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const response = await getPermissionCatalog();
        if (!cancelled) {
          setGroups(response.data.groups);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiError
              ? err.message
              : "Failed to load permissions",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredGroups = useMemo(() => {
    if (!search.trim()) return groups;
    const q = search.toLowerCase();
    return groups
      .map((g) => ({
        ...g,
        permissions: g.permissions.filter(
          (p) =>
            p.label.toLowerCase().includes(q) ||
            p.id.toLowerCase().includes(q) ||
            p.description.toLowerCase().includes(q),
        ),
      }))
      .filter((g) => g.permissions.length > 0);
  }, [groups, search]);

  const toggle = useCallback(
    (permissionId: string) => {
      if (disabled) return;
      const next = selected.includes(permissionId)
        ? selected.filter((p) => p !== permissionId)
        : [...selected, permissionId];
      onChange(next);
    },
    [selected, onChange, disabled],
  );

  const toggleGroup = useCallback(
    (groupPermissions: string[]) => {
      if (disabled) return;
      const allSelected = groupPermissions.every((p) =>
        selected.includes(p),
      );
      if (allSelected) {
        onChange(
          selected.filter((p) => !groupPermissions.includes(p)),
        );
      } else {
        const next = [
          ...selected,
          ...groupPermissions.filter(
            (p) => !selected.includes(p),
          ),
        ];
        onChange(next);
      }
    },
    [selected, onChange, disabled],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 p-6 text-sm text-on-surface-variant">
        <span className="material-symbols-outlined animate-spin">
          progress_activity
        </span>
        Loading permissions...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-on-surface-variant">
          search
        </span>
        <input
          type="text"
          placeholder="Search permissions..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-outline-variant bg-surface pl-10 pr-md py-sm text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary"
          disabled={disabled}
        />
      </div>

      <div className="max-h-[400px] space-y-2 overflow-y-auto pr-1">
        {filteredGroups.length === 0 ? (
          <p className="p-4 text-center text-sm text-on-surface-variant">
            No permissions match your search.
          </p>
        ) : (
          filteredGroups.map((group) => {
            const allSelected = group.permissions.every((p) =>
              selected.includes(p.id),
            );
            const someSelected = group.permissions.some((p) =>
              selected.includes(p.id),
            );

            return (
              <div
                key={group.group}
                className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest"
              >
                <button
                  type="button"
                  onClick={() =>
                    toggleGroup(group.permissions.map((p) => p.id))
                  }
                  disabled={disabled}
                  className="flex w-full items-center gap-3 px-lg py-3 text-start transition-colors hover:bg-surface-container-low/50 disabled:cursor-not-allowed"
                >
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded border transition-colors ${
                      allSelected
                        ? "border-primary bg-primary text-on-primary"
                        : someSelected
                          ? "border-primary bg-primary/20 text-primary"
                          : "border-outline-variant bg-surface"
                    }`}
                  >
                    {allSelected && (
                      <span className="material-symbols-outlined text-[14px]">
                        check
                      </span>
                    )}
                    {someSelected && !allSelected && (
                      <span className="h-2 w-2 rounded-sm bg-primary" />
                    )}
                  </span>
                  <span className="text-label-md font-bold text-on-surface">
                    {group.label}
                  </span>
                  <span className="ml-auto text-xs text-on-surface-variant">
                    {
                      group.permissions.filter((p) =>
                        selected.includes(p.id),
                      ).length
                    }
                    /{group.permissions.length}
                  </span>
                </button>

                <div className="divide-y divide-outline-variant/20 border-t border-outline-variant/20 px-lg">
                  {group.permissions.map((perm) => (
                    <button
                      key={perm.id}
                      type="button"
                      onClick={() => toggle(perm.id)}
                      disabled={disabled}
                      className="flex w-full items-center gap-3 py-2.5 text-start transition-colors hover:bg-surface-container-low/30 disabled:cursor-not-allowed"
                    >
                      <span
                        className={`flex h-4 w-4 items-center justify-center rounded border transition-colors ${
                          selected.includes(perm.id)
                            ? "border-primary bg-primary text-on-primary"
                            : "border-outline-variant bg-surface"
                        }`}
                      >
                        {selected.includes(perm.id) && (
                          <span className="material-symbols-outlined text-[12px]">
                            check
                          </span>
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-on-surface">
                          {perm.label}
                        </p>
                        <p className="truncate text-xs text-on-surface-variant">
                          {perm.description}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
