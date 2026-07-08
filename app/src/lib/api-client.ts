import { clearAccessToken, getAccessToken, setAccessToken } from "./auth-tokens";

export const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000"
).replace(/\/+$/, "");

const PUBLIC_AUTH_ENDPOINTS = new Set([
  "/auth/login",
  "/auth/register",
  "/auth/refresh",
  "/auth/verify-email",
  "/auth/resend-verification-email",
]);

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface ApiClientOptions extends Omit<RequestInit, "body"> {
  body?: Record<string, unknown> | FormData | BodyInit | null;
  auth?: boolean;
  redirectOnAuthFailure?: boolean;
}

interface ErrorPayload {
  message?: unknown;
  error?: unknown;
  details?: unknown;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly details: unknown;

  constructor({
    status,
    code = null,
    message,
    details,
  }: {
    status: number;
    code?: string | null;
    message: string;
    details?: unknown;
  }) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function getEndpointPath(endpoint: string): string {
  try {
    return new URL(endpoint, `${API_BASE_URL}/`).pathname.replace(/\/+$/, "") || "/";
  } catch {
    return endpoint.split(/[?#]/, 1)[0].replace(/\/+$/, "") || "/";
  }
}

function isPublicAuthEndpoint(endpoint: string): boolean {
  return PUBLIC_AUTH_ENDPOINTS.has(getEndpointPath(endpoint));
}

function buildUrl(endpoint: string): string {
  if (/^https?:\/\//i.test(endpoint)) {
    return endpoint;
  }

  return `${API_BASE_URL}/${endpoint.replace(/^\/+/, "")}`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

async function parseResponse(response: Response): Promise<unknown> {
  const text = await response.text();

  if (!text) {
    return null;
  }

  const contentType = response.headers.get("content-type");
  if (contentType?.includes("json")) {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return text;
    }
  }

  return text;
}

function toApiError(response: Response, payload: unknown): ApiError {
  const fallbackMessage = `Request failed with status ${response.status}`;

  if (!payload || typeof payload !== "object") {
    return new ApiError({
      status: response.status,
      message: typeof payload === "string" && payload ? payload : fallbackMessage,
    });
  }

  const body = payload as ErrorPayload;
  if (body.error && typeof body.error === "object") {
    const nested = body.error as ErrorPayload & { code?: unknown };
    return new ApiError({
      status: response.status,
      code: typeof nested.code === "string" ? nested.code : null,
      message:
        typeof nested.message === "string" ? nested.message : fallbackMessage,
      details: nested.details,
    });
  }

  return new ApiError({
    status: response.status,
    code: typeof body.error === "string" ? body.error : null,
    message: typeof body.message === "string" ? body.message : fallbackMessage,
    details: body.details,
  });
}

function prepareBody(
  body: ApiClientOptions["body"],
  headers: Headers,
): BodyInit | null | undefined {
  if (isPlainObject(body)) {
    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    return JSON.stringify(body);
  }

  return body;
}

interface RefreshResponse {
  success?: boolean;
  data?: {
    tokens?: {
      accessToken?: string;
    };
  };
}

let refreshRequest: Promise<string> | null = null;

export async function refreshAccessToken(): Promise<string> {
  if (!refreshRequest) {
    refreshRequest = (async () => {
      let response: Response;

      try {
        response = await fetch(buildUrl("/auth/refresh"), {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
        });
      } catch (error) {
        throw new ApiError({
          status: 0,
          code: "REFRESH_FAILED",
          message: error instanceof Error ? error.message : "Token refresh failed",
        });
      }

      const payload = await parseResponse(response);
      if (!response.ok) {
        throw toApiError(response, payload);
      }

      const accessToken = (payload as RefreshResponse | null)?.data?.tokens
        ?.accessToken;

      if (!accessToken) {
        throw new ApiError({
          status: response.status,
          code: "INVALID_REFRESH_RESPONSE",
          message: "Token refresh response did not include an access token",
          details: payload,
        });
      }

      setAccessToken(accessToken);
      return accessToken;
    })().finally(() => {
      refreshRequest = null;
    });
  }

  return refreshRequest;
}

function logout(redirectOnAuthFailure: boolean): void {
  clearAccessToken();

  if (
    redirectOnAuthFailure &&
    typeof window !== "undefined" &&
    window.location.pathname !== "/login"
  ) {
    window.location.href = "/login";
  }
}

async function executeRequest<T>(
  endpoint: string,
  options: ApiClientOptions,
  retried: boolean,
): Promise<T> {
  const {
    auth = true,
    redirectOnAuthFailure = true,
    body,
    headers: callerHeaders,
    ...requestInit
  } = options;
  const publicEndpoint = isPublicAuthEndpoint(endpoint);
  const headers = new Headers(callerHeaders);
  const accessToken = getAccessToken();

  if (auth && !publicEndpoint && accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  } else {
    headers.delete("Authorization");
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(endpoint), {
      ...requestInit,
      headers,
      body: prepareBody(body, headers),
      credentials: requestInit.credentials ?? "include",
    });
  } catch (error) {
    throw new ApiError({
      status: 0,
      code: "NETWORK_ERROR",
      message: error instanceof Error ? error.message : "Network request failed",
    });
  }

  if (
    response.status === 401 &&
    auth &&
    !publicEndpoint &&
    !retried
  ) {
    try {
      await refreshAccessToken();
    } catch (error) {
      logout(redirectOnAuthFailure);
      if (error instanceof ApiError) {
        throw error;
      }
      throw new ApiError({
        status: 401,
        code: "REFRESH_FAILED",
        message: "Token refresh failed",
        details: error,
      });
    }

    return executeRequest<T>(endpoint, options, true);
  }

  const payload = await parseResponse(response);
  if (!response.ok) {
    throw toApiError(response, payload);
  }

  return payload as T;
}

export function apiClient<T = unknown>(
  endpoint: string,
  options: ApiClientOptions = {},
): Promise<T> {
  return executeRequest<T>(endpoint, options, false);
}

export const api = {
  get<T = unknown>(endpoint: string, options?: ApiClientOptions) {
    return apiClient<T>(endpoint, { ...options, method: "GET" });
  },
  post<T = unknown>(
    endpoint: string,
    body?: ApiClientOptions["body"],
    options?: ApiClientOptions,
  ) {
    return apiClient<T>(endpoint, { ...options, method: "POST", body });
  },
  put<T = unknown>(
    endpoint: string,
    body?: ApiClientOptions["body"],
    options?: ApiClientOptions,
  ) {
    return apiClient<T>(endpoint, { ...options, method: "PUT", body });
  },
  patch<T = unknown>(
    endpoint: string,
    body?: ApiClientOptions["body"],
    options?: ApiClientOptions,
  ) {
    return apiClient<T>(endpoint, { ...options, method: "PATCH", body });
  },
  delete<T = unknown>(endpoint: string, options?: ApiClientOptions) {
    return apiClient<T>(endpoint, { ...options, method: "DELETE" });
  },
};
