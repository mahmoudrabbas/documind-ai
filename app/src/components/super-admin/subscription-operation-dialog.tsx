"use client";

import { useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api-client";
import {
  previewSubscriptionImpact,
  provisionSubscription,
  updateSubscription,
} from "@/services/super-admin.service";
import type { PlatformSubscriptionRecord, SubscriptionOperationAction } from "@/types/api/super-admin.types";
import {
  buildProvisionInput,
  buildUpdateInput,
  validateSubscriptionReason,
} from "./subscription-operation.contract";

export function SubscriptionOperationDialog({
  tenantId, existing, action, packageId, targetStatus, onClose, onSuccess,
}: {
  tenantId: string;
  existing: PlatformSubscriptionRecord | null;
  action: SubscriptionOperationAction;
  packageId?: string;
  targetStatus?: string;
  onClose: () => void;
  onSuccess: () => void | Promise<void>;
}) {
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof previewSubscriptionImpact>>["data"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const idempotencyKey = useRef(crypto.randomUUID());
  const closeButton = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLElement>(null);
  const pendingRef = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    void previewSubscriptionImpact(tenantId, {
      action, packageId, targetStatus,
      expectedVersion: existing?.version ?? 0,
    }, controller.signal).then((response) => setPreview(response.data)).catch((caught) => {
      if (!controller.signal.aborted) setError(caught instanceof ApiError ? caught.message : "Unable to load subscription impact.");
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [action, existing?.version, packageId, retry, targetStatus, tenantId]);

  useEffect(() => { pendingRef.current = pending; }, [pending]);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButton.current?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pendingRef.current) onClose();
      if (event.key !== "Tab") return;
      const focusable = dialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]), textarea:not([disabled]), select:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])');
      if (!focusable?.length) return;
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", keyboard);
    return () => { document.removeEventListener("keydown", keyboard); previousFocus?.focus(); };
  }, [onClose]);

  async function confirm() {
    const validation = validateSubscriptionReason(reason);
    if (validation) { setError(validation); return; }
    if (!preview?.transitionAllowed || pending) return;
    setPending(true); setError("");
    try {
      if (action === "provision") {
        if (!packageId || (targetStatus !== "trialing" && targetStatus !== "active")) return;
        await provisionSubscription(tenantId, buildProvisionInput(packageId, targetStatus, reason), idempotencyKey.current);
      } else {
        if (!existing) return;
        const body = buildUpdateInput(existing, { packageId, status: targetStatus }, reason);
        await updateSubscription(tenantId, body, idempotencyKey.current);
      }
      await onSuccess(); onClose();
    } catch (caught) {
      setError(caught instanceof ApiError
        ? `${caught.message}${caught.code ? ` (${caught.code})` : ""}`
        : "Unable to complete the subscription operation.");
      if (caught instanceof ApiError && caught.code === "SUBSCRIPTION_STALE_VERSION") await onSuccess();
    } finally { setPending(false); }
  }

  return (
    <div role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !pending) onClose(); }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <section ref={dialog} role="dialog" aria-modal="true" aria-labelledby="subscription-dialog-title"
        className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl bg-surface p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <h2 id="subscription-dialog-title" className="text-title-lg font-bold">
            {action === "provision" ? "Provision Subscription" : "Confirm Subscription Change"}
          </h2>
          <button ref={closeButton} type="button" aria-label="Close dialog" disabled={pending} onClick={onClose}>✕</button>
        </div>
        {loading ? <p className="mt-4" aria-live="polite">Loading impact preview…</p> : null}
        {!loading && error && !preview ? <div className="mt-4"><p role="alert">{error}</p><button type="button" className="mt-2 font-bold text-primary" onClick={() => setRetry((value) => value + 1)}>Retry preview</button></div> : null}
        {preview ? <div className="mt-4 space-y-3 text-sm">
          <p><strong>Mode:</strong> {preview.operationMode}</p>
          <p><strong>Current status:</strong> {preview.subscription?.status ?? "No subscription"}</p>
          <p><strong>Target package:</strong> {preview.targetPackage ? `${preview.targetPackage.name} v${preview.targetPackage.version}` : "Unchanged"}</p>
          {preview.warnings.map((warning) => <p key={warning} className="rounded bg-warning-container p-2">{warning}</p>)}
          {preview.blockingReasons.map((reasonText) => <p key={reasonText} role="alert" className="rounded bg-error-container p-2 text-on-error-container">{reasonText}</p>)}
          <label className="block font-bold">Administrative reason
            <textarea value={reason} onChange={(event) => setReason(event.target.value)} minLength={10} maxLength={1000} required
              className="mt-1 min-h-24 w-full rounded-lg border border-outline-variant bg-surface p-3" />
          </label>
          {error ? <p role="alert" className="text-error">{error}</p> : null}
          <div className="flex justify-end gap-3">
            <button type="button" disabled={pending} onClick={onClose} className="rounded-lg px-4 py-2 font-bold">Cancel</button>
            <button type="button" disabled={pending || !preview.transitionAllowed} onClick={() => void confirm()}
              className="rounded-lg bg-primary px-4 py-2 font-bold text-on-primary disabled:opacity-50">
              {pending ? "Applying…" : "Confirm"}
            </button>
          </div>
        </div> : null}
      </section>
    </div>
  );
}
