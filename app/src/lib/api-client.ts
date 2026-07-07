import { API_BASE_URL } from "@/constants/api";

/* ── Types ─────────────────────────────────────────────── */

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface ApiResponse<T = unknown> {
  data: T | null;
  error: string | null;
  status: number;
  ok: boolean;
}

export interface RequestOptions extends Omit<RequestInit, "method" | "body"> {
  /** JSON body — auto-stringified. */
  body?: Record<string, unknown> | FormData;
}

/* ── Internal fetch wrapper ────────────────────────────── */

async function request<T = unknown>(
  method: HttpMethod,
  path: string,
  options: RequestOptions = {},
): Promise<ApiResponse<T>> {
  const { body, headers: customHeaders, ...rest } = options;

  const isFormData = body instanceof FormData;

  const headers: Record<string, string> = {
    ...(customHeaders as Record<string, string>),
  };

  if (!isFormData) {
    headers["Content-Type"] = "application/json";
  }

  // Automatically include credentials for cookie-based auth
  const credentials: RequestCredentials = "include";

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      credentials,
      body: isFormData ? (body as FormData) : body ? JSON.stringify(body) : undefined,
      ...rest,
    });

    const status = response.status;
    const ok = response.ok;
    let data: T | null = null;
    let error: string | null = null;

    // Try to parse JSON regardless of status
    const contentType = response.headers.get("content-type");
    if (contentType?.includes("application/json")) {
      const json = await response.json();
      if (ok) {
        data = json as T;
      } else {
        error = json.message ?? json.error ?? `Request failed with status ${status}`;
      }
    } else {
      const text = await response.text();
      if (!ok) {
        error = text || `Request failed with status ${status}`;
      }
    }

    return { data, error, status, ok };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : "Network error",
      status: 0,
      ok: false,
    };
  }
}

/* ── Public helpers ────────────────────────────────────── */

export const api = {
  get<T = unknown>(path: string, options?: RequestOptions) {
    return request<T>("GET", path, options);
  },

  post<T = unknown>(path: string, body?: Record<string, unknown> | FormData, options?: RequestOptions) {
    return request<T>("POST", path, { ...options, body });
  },

  put<T = unknown>(path: string, body?: Record<string, unknown> | FormData, options?: RequestOptions) {
    return request<T>("PUT", path, { ...options, body });
  },

  patch<T = unknown>(path: string, body?: Record<string, unknown> | FormData, options?: RequestOptions) {
    return request<T>("PATCH", path, { ...options, body });
  },

  delete<T = unknown>(path: string, options?: RequestOptions) {
    return request<T>("DELETE", path, options);
  },
};
