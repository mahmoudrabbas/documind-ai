"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  allowSessionRestore,
  apiClient,
  beginExplicitLogout,
  finishExplicitLogout,
  refreshAccessToken,
} from "@/lib/api-client";
import {
  clearAccessToken,
  getAccessToken,
  setAccessToken,
} from "@/lib/auth-tokens";
import type { Role } from "@/constants/routes";

export type AuthUser = {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  role: Role;
  status: string;
  emailVerified: boolean;
};
export type AuthTenant = {
  id: string;
  name: string;
  slug: string;
  status: string;
  plan: string;
};
type Session = { user: AuthUser; tenant: AuthTenant };
type AuthContextValue =
  | (Session & { status: "authenticated"; accessToken: string })
  | {
      status: "loading" | "unauthenticated";
      user: null;
      tenant: null;
      accessToken: null;
    };

const AuthContext = createContext<
  | (AuthContextValue & {
      establishSession: (accessToken: string, session: Session) => void;
      logout: () => Promise<void>;
      logoutAll: () => Promise<void>;
    })
  | null
>(null);

let bootstrapRequest: Promise<Session> | null = null;

async function restoreSession(): Promise<Session> {
  if (!bootstrapRequest) {
    bootstrapRequest = (async () => {
      await refreshAccessToken();
      const response = await apiClient<{ success: true; data: Session }>(
        "/auth/me",
        {
          redirectOnAuthFailure: false,
        },
      );
      return response.data;
    })().finally(() => {
      bootstrapRequest = null;
    });
  }
  return bootstrapRequest;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthContextValue>({
    status: "loading",
    user: null,
    tenant: null,
    accessToken: null,
  });

  useEffect(() => {
    let active = true;
    void restoreSession()
      .then((session) => {
        const token = getAccessToken();
        if (active && token)
          setState({ status: "authenticated", ...session, accessToken: token });
      })
      .catch(() => {
        clearAccessToken();
        if (active)
          setState({
            status: "unauthenticated",
            user: null,
            tenant: null,
            accessToken: null,
          });
      });
    return () => {
      active = false;
    };
  }, []);

  const establishSession = useCallback(
    (accessToken: string, session: Session) => {
      allowSessionRestore();
      setAccessToken(accessToken);
      setState({ status: "authenticated", ...session, accessToken });
    },
    [],
  );

  const logout = useCallback(async () => {
    beginExplicitLogout();
    try {
      await apiClient("/auth/logout", {
        method: "POST",
        auth: false,
        credentials: "include",
      });
    } finally {
      clearAccessToken();
      finishExplicitLogout();
      setState({
        status: "unauthenticated",
        user: null,
        tenant: null,
        accessToken: null,
      });
    }
  }, []);

  const logoutAll = useCallback(async () => {
    beginExplicitLogout();
    try {
      await apiClient("/auth/logout-all", {
        method: "POST",
        credentials: "include",
        headers: { "X-Confirm-Logout-All": "true" },
      });
    } finally {
      clearAccessToken();
      finishExplicitLogout();
      setState({
        status: "unauthenticated",
        user: null,
        tenant: null,
        accessToken: null,
      });
    }
  }, []);

  const value = useMemo(
    () => ({ ...state, establishSession, logout, logoutAll }),
    [state, establishSession, logout, logoutAll],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
