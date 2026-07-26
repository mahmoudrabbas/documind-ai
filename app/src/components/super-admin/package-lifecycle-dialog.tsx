"use client";

import { useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api-client";
import {
  activatePackage,
  archivePackage,
  previewPackageImpact,
} from "@/services/super-admin.service";
import type {
  PackageImpactPreview,
  PackageLifecycleAction,
  PlatformPackage,
} from "@/types/api/super-admin.types";

export function PackageLifecycleDialog({ open, action, pkg, onClose, onSuccess }: {
  open: boolean;
  action: PackageLifecycleAction;
  pkg: PlatformPackage;
  onClose: () => void;
  onSuccess: () => void | Promise<void>;
}) {
  const [preview, setPreview] = useState<PackageImpactPreview | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [loading, setLoading] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const pendingRef = useRef(pending);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const previousFocus = document.activeElement;
    setPreview(null);
    setPreviewError("");
    setError("");
    setReason("");
    setLoading(true);
    dialogRef.current?.focus();
    void previewPackageImpact(pkg._id, action, controller.signal)
      .then((response) => setPreview(response.data))
      .catch(() => {
        if (!controller.signal.aborted) setPreviewError("Unable to load package impact.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pendingRef.current) closeRef.current();
    };
    window.addEventListener("keydown", keydown);
    return () => {
      controller.abort();
      window.removeEventListener("keydown", keydown);
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, [action, open, pkg._id, pkg.version, retry]);

  async function confirm() {
    if (!preview?.transitionAllowed || reason.trim().length < 3 || pending) return;
    setPending(true);
    setError("");
    try {
      const body = { expectedVersion: pkg.version, reason: reason.trim() };
      if (action === "archive") await archivePackage(pkg._id, body);
      else await activatePackage(pkg._id, body);
      await onSuccess();
      onClose();
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === "PACKAGE_VERSION_CONFLICT") {
        setError("This package changed in another session. Current data is being reloaded.");
        await onSuccess();
      } else {
        setError(caught instanceof Error ? caught.message : "Package transition failed.");
      }
    } finally {
      setPending(false);
    }
  }

  if (!open) return null;
  const title = action === "archive" ? "Archive package" : "Activate package";
  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="package-lifecycle-title"
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-4"
      onClick={(event) => event.target === event.currentTarget && !pending && onClose()}
    >
      <div className="w-full max-w-lg rounded-2xl bg-surface-container-lowest p-6 shadow-modal">
        <div className="flex items-start justify-between gap-4">
          <div><h2 id="package-lifecycle-title" className="text-title-lg font-bold">{title}</h2>
            <p className="text-sm text-on-surface-variant">{pkg.name} · {pkg.code} · v{pkg.version}</p></div>
          <button type="button" aria-label={`Close ${title}`} disabled={pending} onClick={onClose}>✕</button>
        </div>
        {loading ? <p className="mt-4" aria-live="polite">Loading impact…</p> : null}
        {previewError ? <div role="alert" className="mt-4 rounded-lg bg-error-container p-3">{previewError}{" "}
          <button type="button" className="font-bold underline" onClick={() => setRetry((value) => value + 1)}>Retry</button></div> : null}
        {preview ? <div className="mt-4 space-y-2 rounded-xl bg-surface-container-low p-4 text-sm">
          <p>Subscriptions using package: <strong>{preview.subscriptionUsageCount}</strong></p>
          <p>Landing visibility: <strong>{preview.landingVisibilityImpact}</strong></p>
          {Object.entries(preview.affectedSubscriptionStates).map(([state, count]) => <p key={state}>{state}: {count}</p>)}
          {preview.warnings.map((warning) => <p key={warning} className="text-amber-800">{warning}</p>)}
          {preview.blockingReasons.map((reasonCode) => <p key={reasonCode} role="alert" className="text-error">Blocked: {reasonCode}</p>)}
        </div> : null}
        <label className="mt-4 block text-sm font-bold">Reason
          <textarea autoFocus value={reason} onChange={(event) => setReason(event.target.value)} minLength={3} maxLength={500} rows={3}
            className="mt-1 w-full rounded-lg border border-outline-variant bg-surface p-3" aria-describedby="package-reason-help" />
        </label>
        <p id="package-reason-help" className="text-xs text-on-surface-variant">At least 3 characters; recorded in the audit trail.</p>
        {error ? <p role="alert" className="mt-3 rounded-lg bg-error-container p-3">{error}</p> : null}
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" disabled={pending} onClick={onClose} className="rounded-lg border px-4 py-2 font-bold">Cancel</button>
          <button type="button" onClick={() => void confirm()} disabled={pending || !preview?.transitionAllowed || reason.trim().length < 3}
            className="rounded-lg bg-primary px-4 py-2 font-bold text-on-primary disabled:opacity-50">{pending ? "Working…" : title}</button>
        </div>
      </div>
    </div>
  );
}
