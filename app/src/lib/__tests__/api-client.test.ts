import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  allowSessionRestore,
  ApiError,
  apiClient,
  beginExplicitLogout,
  refreshAccessToken,
} from "../api-client";
import {
  clearAccessToken,
  getAccessToken,
  setAccessToken,
} from "../auth-tokens";

const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
};
const locationMock = { pathname: "/", href: "/" };

function jsonResponse(status: number, body: unknown): Response {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: body === null ? undefined : { "content-type": "application/json" },
  });
}

beforeEach(() => {
  clearAccessToken();
  locationMock.pathname = "/";
  locationMock.href = "/";
  vi.stubGlobal("window", {
    localStorage: localStorageMock,
    location: locationMock,
  });
});

afterEach(() => {
  allowSessionRestore();
  clearAccessToken();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("apiClient authentication", () => {
  it("attaches Authorization when an access token exists", async () => {
    setAccessToken("stored-token");
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { ok: true }));

    await apiClient("/documents", { method: "GET" });

    const headers = new Headers(vi.mocked(fetch).mock.calls[0][1]?.headers);
    expect(headers.get("Authorization")).toBe("Bearer stored-token");
  });

  it("does not attach Authorization when auth is false", async () => {
    setAccessToken("stored-token");
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { ok: true }));

    await apiClient("/documents", { method: "GET", auth: false });

    const headers = new Headers(vi.mocked(fetch).mock.calls[0][1]?.headers);
    expect(headers.has("Authorization")).toBe(false);
  });

  it("refreshes and retries once after a 401", async () => {
    setAccessToken("expired-token");
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { message: "Expired" }))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          success: true,
          data: { tokens: { accessToken: "fresh-token" } },
        }),
      )
      .mockResolvedValueOnce(jsonResponse(200, { documents: [] }));

    const result = await apiClient<{ documents: unknown[] }>("/documents");

    expect(result).toEqual({ documents: [] });
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(vi.mocked(fetch).mock.calls[1][0]).toBe(
      "http://localhost:5000/auth/refresh",
    );
    expect(vi.mocked(fetch).mock.calls[1][1]?.credentials).toBe("include");
    const retryHeaders = new Headers(
      vi.mocked(fetch).mock.calls[2][1]?.headers,
    );
    expect(retryHeaders.get("Authorization")).toBe("Bearer fresh-token");
    expect(getAccessToken()).toBe("fresh-token");
    expect(localStorageMock.setItem).not.toHaveBeenCalled();
  });

  it("does not refresh again when the retried request returns 401", async () => {
    setAccessToken("expired-token");
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { message: "Expired" }))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          success: true,
          data: { tokens: { accessToken: "fresh-token" } },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(401, { message: "Still unauthorized" }),
      );

    await expect(apiClient("/documents")).rejects.toMatchObject({
      status: 401,
      message: "Still unauthorized",
    });
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(
      vi
        .mocked(fetch)
        .mock.calls.filter(([url]) => String(url).endsWith("/auth/refresh")),
    ).toHaveLength(1);
  });

  it("clears the token and redirects when refresh fails", async () => {
    setAccessToken("expired-token");
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { message: "Expired" }))
      .mockResolvedValueOnce(
        jsonResponse(401, {
          success: false,
          error: { code: "INVALID_REFRESH", message: "Refresh expired" },
        }),
      );

    await expect(apiClient("/documents")).rejects.toMatchObject({
      status: 401,
      code: "INVALID_REFRESH",
      message: "Refresh expired",
    });
    expect(getAccessToken()).toBeNull();
    expect(locationMock.href).toBe("/login");
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(localStorageMock.removeItem).not.toHaveBeenCalled();
  });

  it("clears the token without redirecting when redirectOnAuthFailure is false", async () => {
    setAccessToken("expired-token");
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { message: "Expired" }))
      .mockResolvedValueOnce(
        jsonResponse(401, {
          success: false,
          error: { code: "INVALID_REFRESH", message: "Refresh expired" },
        }),
      );

    await expect(
      apiClient("/documents", { redirectOnAuthFailure: false }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(getAccessToken()).toBeNull();
    expect(locationMock.href).toBe("/");
  });

  it.each([
    "/auth/login",
    "/auth/register",
    "/auth/refresh",
    "/auth/verify-email",
    "/auth/resend-verification-email",
    "/auth/logout",
  ])("does not refresh the public endpoint %s", async (endpoint) => {
    setAccessToken("expired-token");
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(jsonResponse(401, { message: "Unauthorized" }));

    await expect(apiClient(endpoint)).rejects.toBeInstanceOf(ApiError);

    const headers = new Headers(vi.mocked(fetch).mock.calls[0][1]?.headers);
    expect(headers.has("Authorization")).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("does not refresh or restore a token after explicit logout begins", async () => {
    setAccessToken("active-token");
    globalThis.fetch = vi.fn();
    beginExplicitLogout();

    await expect(refreshAccessToken()).rejects.toMatchObject({
      code: "LOGOUT_IN_PROGRESS",
    });
    expect(getAccessToken()).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("apiClient request and response handling", () => {
  it("serializes a plain object while preserving caller headers", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse(200, { id: 1 }));

    await apiClient("/documents", {
      method: "POST",
      headers: { "X-Request-ID": "request-1" },
      body: { title: "Guide" },
      auth: false,
    });

    const init = vi.mocked(fetch).mock.calls[0][1];
    const headers = new Headers(init?.headers);
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get("X-Request-ID")).toBe("request-1");
    expect(init?.body).toBe(JSON.stringify({ title: "Guide" }));
  });

  it("preserves caller-provided credentials", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { ok: true }));

    await apiClient("/documents", {
      credentials: "same-origin",
      auth: false,
    });

    expect(vi.mocked(fetch).mock.calls[0][1]?.credentials).toBe("same-origin");
  });

  it("does not set Content-Type for FormData", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse(200, { id: 1 }));
    const body = new FormData();
    body.append("file", "contents");

    await apiClient("/documents", { method: "POST", body });

    const init = vi.mocked(fetch).mock.calls[0][1];
    expect(new Headers(init?.headers).has("Content-Type")).toBe(false);
    expect(init?.body).toBe(body);
  });

  it("returns null for an empty successful response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse(204, null));

    await expect(
      apiClient("/documents/1", { method: "DELETE" }),
    ).resolves.toBeNull();
  });

  it("supports the flat backend error shape", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      jsonResponse(400, {
        success: false,
        message: "Invalid document",
        error: "INVALID_DOCUMENT",
        details: { field: "title" },
      }),
    );

    await expect(apiClient("/documents")).rejects.toMatchObject({
      status: 400,
      code: "INVALID_DOCUMENT",
      message: "Invalid document",
      details: { field: "title" },
    });
  });
});
