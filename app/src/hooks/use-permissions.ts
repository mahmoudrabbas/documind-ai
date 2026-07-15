"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getMyPermissions } from "@/services/permissions.service";
import type { PermissionScopes } from "@/types/api/permissions.types";

interface UsePermissionsResult {
  permissions: Set<string>;
  scopes: PermissionScopes;
  baseRole: string;
  loading: boolean;
  error: string | null;
  has: (permission: string) => boolean;
  reload: () => Promise<void>;
}

export function usePermissions(): UsePermissionsResult {
  const [permissions, setPermissions] = useState<Set<string>>(
    new Set(),
  );
  const [scopes, setScopes] = useState<PermissionScopes>({
    selfOnly: false,
    departmentIds: [],
    categories: [],
  });
  const [baseRole, setBaseRole] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    try {
      const response = await getMyPermissions(controller.signal);
      if (!controller.signal.aborted) {
        setPermissions(new Set(response.data.permissions));
        setScopes(response.data.scopes);
        setBaseRole(response.data.baseRole);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (!controller.signal.aborted) {
        setError(
          err instanceof Error ? err.message : "Failed to load permissions",
        );
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void load();
    return () => {
      abortRef.current?.abort();
    };
  }, [load]);

  const has = useCallback(
    (permission: string) => permissions.has(permission),
    [permissions],
  );

  return { permissions, scopes, baseRole, loading, error, has, reload: load };
}
