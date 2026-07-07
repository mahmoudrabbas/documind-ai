import { describe, it, expect, beforeEach, vi } from "vitest";
import { api } from "../api-client";

/* ── Helpers ───────────────────────────────────────────── */

function mockFetch(
  status: number,
  body: unknown,
  contentType = "application/json",
): void {
  const bodyInit = body === null ? null : JSON.stringify(body);
  globalThis.fetch = vi.fn().mockResolvedValue(
    new Response(bodyInit, {
      status,
      headers: body === null ? undefined : { "content-type": contentType },
    }),
  );
}

function mockFetchNetworkError(): void {
  globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network error"));
}

function mockFetchText(
  status: number,
  text: string,
  contentType = "text/plain",
): void {
  globalThis.fetch = vi.fn().mockResolvedValue(
    new Response(text, {
      status,
      headers: { "content-type": contentType },
    }),
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
});

/* ── GET ───────────────────────────────────────────────── */

describe("api.get", () => {
  it("calls fetch with GET method and correct URL", async () => {
    mockFetch(200, { id: 1 });
    await api.get("/documents");

    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:5000/documents",
      expect.objectContaining({
        method: "GET",
        credentials: "include",
      }),
    );
  });

  it("sets Content-Type: application/json by default", async () => {
    mockFetch(200, {});
    await api.get("/documents");

    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          "Content-Type": "application/json",
        }),
      }),
    );
  });

  it("includes credentials: include", async () => {
    mockFetch(200, {});
    await api.get("/documents");

    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("returns data on success", async () => {
    mockFetch(200, { docs: [] });
    const res = await api.get<{ docs: unknown[] }>("/documents");

    expect(res.ok).toBe(true);
    expect(res.status).toBe(200);
    expect(res.data).toEqual({ docs: [] });
    expect(res.error).toBeNull();
  });

  it("returns error on 400 with JSON body", async () => {
    mockFetch(400, { message: "Bad request" });
    const res = await api.get("/documents");

    expect(res.ok).toBe(false);
    expect(res.error).toBe("Bad request");
    expect(res.data).toBeNull();
  });

  it("returns error on 401", async () => {
    mockFetch(401, { error: "Unauthorized" });
    const res = await api.get("/documents");

    expect(res.ok).toBe(false);
    expect(res.error).toBe("Unauthorized");
  });

  it("returns error on 500 with text body", async () => {
    mockFetchText(500, "Internal Server Error");
    const res = await api.get("/documents");

    expect(res.ok).toBe(false);
    expect(res.error).toBe("Internal Server Error");
  });

  it("handles network errors gracefully", async () => {
    mockFetchNetworkError();
    const res = await api.get("/documents");

    expect(res.ok).toBe(false);
    expect(res.error).toBe("Network error");
    expect(res.status).toBe(0);
    expect(res.data).toBeNull();
  });

  it("passes custom headers", async () => {
    mockFetch(200, {});
    await api.get("/documents", {
      headers: { "X-Custom": "value" } as Record<string, string>,
    });

    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ "X-Custom": "value" }),
      }),
    );
  });
});

/* ── POST ──────────────────────────────────────────────── */

describe("api.post", () => {
  it("calls fetch with POST method and JSON body", async () => {
    mockFetch(201, { id: 1 });
    const body = { title: "Test" };
    await api.post("/documents", body);

    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:5000/documents",
      expect.objectContaining({ method: "POST" }),
    );

    // Verify the request body was JSON-stringified
    const callArgs = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(JSON.parse(callArgs.body)).toEqual({ title: "Test" });
  });

  it("sends FormData without Content-Type header", async () => {
    mockFetch(201, { id: 1 });
    const formData = new FormData();
    formData.append("file", "blob");

    await api.post("/upload", formData);

    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ method: "POST" }),
    );

    const callArgs = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1];
    // FormData body should be sent directly, and Content-Type should NOT be set
    expect(callArgs.body).toBe(formData);
    expect(callArgs.headers?.["Content-Type"]).toBeUndefined();
  });

  it("can send empty POST without body", async () => {
    mockFetch(200, { ok: true });
    const res = await api.post("/noop");

    expect(res.ok).toBe(true);
    expect(res.data).toEqual({ ok: true });
  });

  it("handles network errors on POST", async () => {
    mockFetchNetworkError();
    const res = await api.post("/documents", { title: "X" });

    expect(res.ok).toBe(false);
    expect(res.error).toBe("Network error");
  });
});

/* ── PUT ───────────────────────────────────────────────── */

describe("api.put", () => {
  it("calls fetch with PUT method", async () => {
    mockFetch(200, { id: 1 });
    await api.put("/documents/1", { title: "Updated" });

    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ method: "PUT" }),
    );
  });

  it("returns data on success", async () => {
    mockFetch(200, { id: 1, title: "Updated" });
    const res = await api.put<{ id: number }>("/documents/1", {
      title: "Updated",
    });

    expect(res.ok).toBe(true);
    expect(res.data?.id).toBe(1);
  });
});

/* ── PATCH ─────────────────────────────────────────────── */

describe("api.patch", () => {
  it("calls fetch with PATCH method", async () => {
    mockFetch(200, {});
    await api.patch("/documents/1", { title: "Patched" });

    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ method: "PATCH" }),
    );
  });
});

/* ── DELETE ────────────────────────────────────────────── */

describe("api.delete", () => {
  it("calls fetch with DELETE method", async () => {
    mockFetch(204, null);
    await api.delete("/documents/1");

    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:5000/documents/1",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("returns ok on 204 no content", async () => {
    mockFetch(204, null);
    const res = await api.delete("/documents/1");

    expect(res.ok).toBe(true);
    expect(res.status).toBe(204);
    expect(res.data).toBeNull();
  });
});
