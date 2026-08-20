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
  ApiError,
  subscribePermissionDenied,
} from "@/lib/api-client";
import {
  canPermission,
  createIdentityKey,
  computeNextPermissionAction,
  canRefreshPermissions,
} from "@/lib/permission-utils";
import type {
  PermissionScopes,
  PermissionSource,
  CustomRoleState,
  PermissionValue,
} from "@/types/api/permissions.types";
import type { Role } from "@/constants/routes";

type PermissionState =
  | { status: "loading" }
  | { status: "idle" }
  | { status: "maintenance"; error: ApiError }
  | {
      status: "ready";
      permissions: Set<PermissionValue>;
      grants: Record<string, { source: PermissionSource; scope: PermissionScopes | null }>;
      baseRole: Role;
      customRoleId: string | null;
      customRoleState: CustomRoleState;
      roleVersion: number | null;
    }
  | { status: "denied"; error: ApiError }
  | { status: "error"; error: Error };

type PermissionContextValue = PermissionState & {
  can: (permission: PermissionValue) => boolean;
  refreshPermissions: () => Promise<void>;
};

const PermissionContext = createContext<PermissionContextValue | null>(null);

const PERMISSION_REQUEST_TIMEOUT_MS = 8_000;
const PERMISSION_DENIED_REFRESH_DEBOUNCE_MS = 150;

type ActivePermissionRequest = {
  identityKey: string;
  token: symbol;
  promise: Promise<void>;
  timeoutId: ReturnType<typeof setTimeout>;
};

export function PermissionProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const [state, setState] = useState<PermissionState>({ status: "loading" });
  const mountedRef = useRef(false);
  const lastIdentityRef = useRef<string | null>(null);
  const readyIdentityRef = useRef<string | null>(null);
  const activeRequestRef = useRef<ActivePermissionRequest | null>(null);
  const denialRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const authStatus = auth.status;
  const authIdentityKey = auth.status === "authenticated"
    ? createIdentityKey(auth.tenant.id, auth.user.id)
    : null;

  const invalidateActiveRequest = useCallback(() => {
    const activeRequest = activeRequestRef.current;
    if (!activeRequest) return;
    clearTimeout(activeRequest.timeoutId);
    activeRequestRef.current = null;
  }, []);

  const clearDenialRefreshTimer = useCallback(() => {
    if (!denialRefreshTimerRef.current) return;
    clearTimeout(denialRefreshTimerRef.current);
    denialRefreshTimerRef.current = null;
  }, []);

  const refreshPermissions = useCallback(async () => {
    if (!canRefreshPermissions(authStatus) || !authIdentityKey) return;

    const activeRequest = activeRequestRef.current;
    if (activeRequest?.identityKey === authIdentityKey) {
      return activeRequest.promise;
    }
    if (activeRequest) invalidateActiveRequest();

    const identityKey = authIdentityKey;
    const token = Symbol(identityKey);
    setState({ status: "loading" });
    readyIdentityRef.current = null;

    let timeoutId!: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_resolve, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error("Permissions check timed out"));
      }, PERMISSION_REQUEST_TIMEOUT_MS);
    });

    const isCurrentRequest = () =>
      mountedRef.current &&
      activeRequestRef.current?.token === token &&
      activeRequestRef.current.identityKey === identityKey;

    const request = Promise.resolve().then(() => getMyPermissions());
    const promise = Promise.race([request, timeout])
      .then((response) => {
        if (!isCurrentRequest()) return;
        readyIdentityRef.current = identityKey;
        setState({
          status: "ready",
          permissions: new Set(response.data.permissions as PermissionValue[]),
          grants: response.data.grants,
          baseRole: response.data.baseRole as Role,
          customRoleId: response.data.customRoleId,
          customRoleState: response.data.customRoleState,
          roleVersion: response.data.roleVersion,
        });
      })
      .catch((error: unknown) => {
        if (!isCurrentRequest()) return;
        readyIdentityRef.current = null;
        if (error instanceof ApiError && error.code === "MAINTENANCE_MODE") {
          setState({ status: "maintenance", error });
        } else {
          setState(
            error instanceof ApiError && error.status === 403
              ? { status: "denied", error }
              : {
                  status: "error",
                  error:
                    error instanceof Error
                      ? error
                      : new Error("Failed to load permissions"),
                },
          );
        }
      })
      .finally(() => {
        if (activeRequestRef.current?.token !== token) return;
        clearTimeout(timeoutId);
        activeRequestRef.current = null;
      });

    activeRequestRef.current = {
      identityKey,
      token,
      promise,
      timeoutId,
    };
    return promise;
  }, [authIdentityKey, authStatus, invalidateActiveRequest]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      invalidateActiveRequest();
      clearDenialRefreshTimer();
    };
  }, [clearDenialRefreshTimer, invalidateActiveRequest]);

  useEffect(() => {
    clearDenialRefreshTimer();
  }, [authIdentityKey, authStatus, clearDenialRefreshTimer]);

  useEffect(() => {
    const action = computeNextPermissionAction(
      authStatus,
      authIdentityKey,
      lastIdentityRef.current,
    );

    if (action.kind === "set_loading") {
      invalidateActiveRequest();
      lastIdentityRef.current = null;
      readyIdentityRef.current = null;
      setState({ status: "loading" });
      return;
    }

    if (action.kind === "set_idle") {
      invalidateActiveRequest();
      setState({ status: "idle" });
      lastIdentityRef.current = null;
      readyIdentityRef.current = null;
      return;
    }

    if (action.kind === "load_permissions") {
      invalidateActiveRequest();
      lastIdentityRef.current = action.identityKey;
      readyIdentityRef.current = null;
      setState({ status: "loading" });
      void refreshPermissions();
      return;
    }

    if (
      authStatus === "authenticated" &&
      authIdentityKey &&
      state.status === "loading" &&
      readyIdentityRef.current !== authIdentityKey &&
      activeRequestRef.current?.identityKey !== authIdentityKey
    ) {
      void refreshPermissions();
    }
  }, [
    authStatus,
    authIdentityKey,
    invalidateActiveRequest,
    refreshPermissions,
    state.status,
  ]);

  useEffect(
    () =>
      subscribePermissionDenied(() => {
        if (authStatus !== "authenticated") return;
        if (denialRefreshTimerRef.current) {
          clearTimeout(denialRefreshTimerRef.current);
        }
        denialRefreshTimerRef.current = setTimeout(() => {
          denialRefreshTimerRef.current = null;
          void refreshPermissions();
        }, PERMISSION_DENIED_REFRESH_DEBOUNCE_MS);
      }),
    [authStatus, refreshPermissions],
  );

  const can = useCallback(
    (permission: PermissionValue): boolean => {
      if (state.status !== "ready") return false;
      if (state.baseRole === "SUPER_ADMIN") return true;
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
