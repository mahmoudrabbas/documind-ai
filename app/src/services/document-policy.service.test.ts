import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api-client";
import {
  applyBatch,
  applyPolicy,
  changeTaxonomyStatus,
  classifyPolicyError,
  createTaxonomy,
  getActivePolicy,
  updateTaxonomy,
} from "./document-policy.service";
import type { ActivePolicyResponse, PolicyDraft } from "@/types/api/document-policy.types";

const draft: PolicyDraft = { rules: [], inherits: null, effectiveFrom: "2026-07-23T00:00:00.000Z", effectiveUntil: null, reason: "test" };
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }); }
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("document policy API", () => {
  it("returns the typed active-policy envelope", async () => {
    const response: ActivePolicyResponse = { success: true, data: { mayManage: true, taxonomy: { categoryId: null, departmentId: null, classificationId: "c1" }, policy: { contractVersion: 1, documentId: "d1", policyId: "p1", policyVersion: 3, status: "active", effectiveFrom: "2026-07-23T00:00:00.000Z", rules: [], provenance: { createdBy: "u1", createdAt: "2026-07-23T00:00:00.000Z" }, indexMetadata: { policyId: "p1", policyVersion: 3 } } } };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(response)));
    await expect(getActivePolicy("d1")).resolves.toEqual(response);
  });

  it.each([
    [403, "X", "denied"], [404, "DOCUMENT_NOT_FOUND", "unavailable"],
    [409, "DOCUMENT_POLICY_VERSION_CONFLICT", "version_conflict"],
    [409, "DOCUMENT_POLICY_PREVIEW_MISMATCH", "preview_mismatch"],
    [409, "DOCUMENT_POLICY_SENSITIVE_CONFIRMATION_REQUIRED", "sensitive_confirmation"],
    [409, "DOCUMENT_POLICY_IDEMPOTENCY_CONFLICT", "idempotency_conflict"],
    [400, "DOCUMENT_POLICY_REFERENCE_INVALID", "invalid_reference"],
    [400, "DOCUMENT_POLICY_BATCH_LIMIT_EXCEEDED", "batch_limit"],
  ] as const)("maps %s/%s to %s", (status, code, expected) => {
    expect(classifyPolicyError(new ApiError({ status, code, message: "safe" }))).toBe(expected);
  });

  it("sends and reuses the caller's Idempotency-Key for an identical retry", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(json({ success: true, data: { status: "applied", policyId: "p1", policyVersion: 2 } })));
    vi.stubGlobal("fetch", fetchMock);
    await applyPolicy("d1", "opaque-token", draft, "document-policy:stable");
    await applyPolicy("d1", "opaque-token", draft, "document-policy:stable");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const call of fetchMock.mock.calls) expect(new Headers(call[1]?.headers).get("Idempotency-Key")).toBe("document-policy:stable");
  });

  it("sends confirmation only after an explicit true value", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(json({ success: true, data: { status: "applied", policyId: "p1", policyVersion: 2 } }))); vi.stubGlobal("fetch", fetchMock);
    await applyPolicy("d1", "opaque-token", draft, "key-one", false);
    await applyPolicy("d1", "opaque-token", draft, "key-two", true);
    expect(String(fetchMock.mock.calls[0][1]?.body)).not.toContain("confirmSensitiveBroadening");
    expect(String(fetchMock.mock.calls[1][1]?.body)).toContain('"confirmSensitiveBroadening":true');
  });

  it("sends only the supported backend taxonomy create fields", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ success: true, message: "created", data: {} }));
    vi.stubGlobal("fetch", fetchMock);

    await createTaxonomy("classifications", {
      name: "Restricted",
      description: "Restricted documents",
      level: "restricted",
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as Record<string, unknown>;
    expect(body).toEqual({
      name: "Restricted",
      description: "Restricted documents",
      level: "restricted",
    });
  });

  it("sends the backend taxonomy update contract without expectedVersion", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ success: true, message: "updated", data: {} }));
    vi.stubGlobal("fetch", fetchMock);

    await updateTaxonomy("categories", "category-id", {
      version: 7,
      name: "Updated category",
      description: null,
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as Record<string, unknown>;
    expect(body).toEqual({ version: 7, name: "Updated category", description: null });
    expect(body).not.toHaveProperty("expectedVersion");
  });

  it("sends the backend taxonomy archive contract", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ success: true, message: "archived", data: {} }));
    vi.stubGlobal("fetch", fetchMock);

    await changeTaxonomyStatus("departments", "department-id", 8, "archive");

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as Record<string, unknown>;
    expect(body).toEqual({ version: 8 });
  });

  it("sends the backend taxonomy restore contract", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ success: true, message: "restored", data: {} }));
    vi.stubGlobal("fetch", fetchMock);

    await changeTaxonomyStatus("classifications", "classification-id", 9, "restore");

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as Record<string, unknown>;
    expect(body).toEqual({ version: 9 });
  });

  it("sends the caller's Idempotency-Key for batch apply", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ success: true, data: { status: "applied", results: [] } }));
    vi.stubGlobal("fetch", fetchMock);

    await applyBatch("batch-token", draft, "document-policy:batch-stable");

    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("Idempotency-Key")).toBe("document-policy:batch-stable");
  });
});
