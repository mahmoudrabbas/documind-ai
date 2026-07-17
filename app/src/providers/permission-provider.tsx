"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/providers/auth-provider";
import { getMyPermissions } from "@/services/permissions.service";
import {
  canPermission,
  createIdentityKey,
  computeNextPermissionAction,
  shouldApplyResponse,
  canRefreshPermissions,
} from "@/lib/permission-utils";
import type {
  PermissionScopes,
  PermissionSource,
  CustomRoleState,
} from "@/types/api/permissions.types";
import type { Role } from "@/constants/routes";

type PermissionState =
  | { status: "loading" }
  | { status: "idle" }
  | {
      status: "ready";
      permissions: Set<string>;
      grants: Record<string, { source: PermissionSource; scope: PermissionScopes | null }>;
      baseRole: Role;
      customRoleId: string | null;
      customRoleState: CustomRoleState;
      roleVersion: number | null;
    }
  | { status: "error"; error: Error };

type PermissionContextValue = PermissionState & {
  can: (permission: string) => boolean;
  refreshPermissions: () => Promise<void>;
};

const PermissionContext = createContext<PermissionContextValue | null>(null);

export function PermissionProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const [state, setState] = useState<PermissionState>({ status: "loading" });
  const mountedRef = useRef(true);
  const lastIdentityRef = useRef<string | null>(null);
  const reqGenRef = useRef(0);

  const authStatus = auth.status;
  const authIdentityKey = auth.status === "authenticated"
    ? createIdentityKey(auth.tenant.id, auth.user.id)
    : null;

  const refreshPermissions = useCallback(async () => {
    if (!canRefreshPermissions(authStatus)) return;

    const gen = ++reqGenRef.current;
    try {
      const response = await getMyPermissions();
      if (shouldApplyResponse(reqGenRef.current, gen, mountedRef.current)) {
        setState({
          status: "ready",
          permissions: new Set(response.data.permissions),
          grants: response.data.grants,
          baseRole: response.data.baseRole as Role,
          customRoleId: response.data.customRoleId,
          customRoleState: response.data.customRoleState,
          roleVersion: response.data.roleVersion,
        });
      }
    } catch (error) {
      if (shouldApplyResponse(reqGenRef.current, gen, mountedRef.current)) {
        setState({
          status: "error",
          error: error instanceof Error ? error : new Error("Failed to load permissions"),
        });
      }
    }
  }, [authStatus]);

  useEffect(() => {
    mountedRef.current = true;

    const action = computeNextPermissionAction(
      authStatus,
      authIdentityKey,
      lastIdentityRef.current,
    );

    if (action.kind === "set_loading") {
      ++reqGenRef.current;
      lastIdentityRef.current = null;
      setState({ status: "loading" });
      return () => { mountedRef.current = false; };
    }

    if (action.kind === "set_idle") {
      ++reqGenRef.current;
      setState({ status: "idle" });
      lastIdentityRef.current = null;
      return () => { mountedRef.current = false; };
    }

    if (action.kind === "load_permissions") {
      lastIdentityRef.current = action.identityKey;
      ++reqGenRef.current;
      setState({ status: "loading" });
      void refreshPermissions();
    }

    return () => { mountedRef.current = false; };
  }, [authStatus, authIdentityKey, refreshPermissions]);

  const can = useCallback(
    (permission: string): boolean => {
      if (state.status !== "ready") return false;
      return canPermission(permission, state.permissions);
    },
    [state],
  );

  const value = useMemo(
    (): PermissionContextValue => ({ ...state, can, refreshPermissions }),
    [state, can, refreshPermissions],
  );

  return (
    <PermissionContext.Provider value={value}>
      {children}
    </PermissionContext.Provider>
  );
}

export function usePermissions(): PermissionContextValue {
  const context = useContext(PermissionContext);
  if (!context) throw new Error("usePermissions must be used within PermissionProvider");
  return context;
}
