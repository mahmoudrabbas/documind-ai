"use client";

import { useState, useCallback, useEffect } from "react";
import { useI18n } from "@/providers/i18n-provider";
import { usePermissions } from "@/providers/permission-provider";
import { Permission } from "@/types/api/permissions.types";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { getFileSizeLabel } from "@/lib/validation";
import * as documentsService from "@/services/documents.service";
import * as processingProgressService from "@/services/processingProgress.service";
import type { DocumentView, DocumentVersionView } from "@/types/api/documents.types";
import type { ProcessingRunView } from "@/types/api/processingProgress.types";
import { DocumentQualityPanel } from "./DocumentQualityPanel";
import { IndexingStatusCard } from "./IndexingStatusCard";
import { ClassificationBadge } from "./ClassificationBadge";
import { DocumentPolicyPanel } from "./DocumentPolicyPanel";
import { ProcessingTimeline } from "./ProcessingTimeline";
import { ProcessingStatusBadge } from "./ProcessingStatusBadge";
import { RetryConfirmDialog, ReprocessConfirmDialog, CancelConfirmDialog } from "./ProcessingConfirmDialogs";

const CLASSIFICATION_BADGE_MAP: Record<string, string> = {
  public: "success",
  internal: "info",
  confidential: "warning",
  restricted: "error",
};

const SCAN_RESULT_MAP: Record<string, string> = {
  clean: "success",
  infected: "error",
  error: "warning",
};

function ConfirmDialog({ action, onConfirm, onCancel }: { action: string; onConfirm: () => void; onCancel: () => void }) {
  const { t } = useI18n();
  const isDestructive = action === "delete" || action === "permanentDelete";
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40" onClick={onCancel} onKeyDown={(e) => e.key === "Escape" && onCancel()}>
      <div className="mx-4 w-full max-w-sm rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-6 shadow-modal" onClick={(e) => e.stopPropagation()} role="alertdialog" aria-modal="true">
        <p className="text-title-lg font-bold text-on-surface">{t(`documents.${action}Confirm`)}</p>
        <div className="mt-5 flex gap-3">
          <Button variant={isDestructive ? "danger" : "primary"} onClick={onConfirm}>{t("common.confirm")}</Button>
          <Button variant="ghost" onClick={onCancel}>{t("common.cancel")}</Button>
        </div>
      </div>
    </div>
  );
}

interface DocumentDetailDrawerProps {
  document: DocumentView;
  onClose: () => void;
  onArchive: (id: string) => void;
  onRestore: (id: string) => void;
  onSoftDelete: (id: string) => void;
  onPermanentDelete: (id: string) => void;
  onReplace: (id: string, file: File, desc?: string) => void;
  versions: DocumentVersionView[];
  isLoadingVersions: boolean;
  highlightPage?: number;
}

export function DocumentDetailDrawer({
  document: doc,
  onClose,
  onArchive,
  onRestore,
  onSoftDelete,
  onPermanentDelete,
  onReplace,
  versions,
  isLoadingVersions,
  highlightPage,
}: DocumentDetailDrawerProps) {
  const { t } = useI18n();
  const permissions = usePermissions();
  const canDownload = permissions.can(Permission.DOCUMENTS_DOWNLOAD);
  const canUpdate = permissions.can(Permission.DOCUMENTS_UPDATE);
  const canDelete = permissions.can(Permission.DOCUMENTS_DELETE);
  const canArchive = permissions.can(Permission.DOCUMENTS_ARCHIVE);
  const canProcessOcr = permissions.can(Permission.DOCUMENTS_OCR_PROCESS);

  const [showReplaceForm, setShowReplaceForm] = useState(false);
  const [replaceFile, setReplaceFile] = useState<File | null>(null);
  const [replaceDesc, setReplaceDesc] = useState("");
  const [isReplacing, setIsReplacing] = useState(false);
  const [confirmAction, setConfirmAction] = useState<"archive" | "restore" | "softDelete" | "permanentDelete" | null>(null);

  const [processingRun, setProcessingRun] = useState<ProcessingRunView | null>(null);
  const [isLoadingProcessing, setIsLoadingProcessing] = useState(true);
  const [processingError, setProcessingError] = useState<string | null>(null);
  const [processingErrorDetail, setProcessingErrorDetail] = useState<{ title: string; description: string; retryable: boolean; errorCode: string | null } | null>(null);
  const [showRetryDialog, setShowRetryDialog] = useState(false);
  const [showReprocessDialog, setShowReprocessDialog] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isReprocessing, setIsReprocessing] = useState(false);
  const [isCanceling, setIsCanceling] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [reprocessError, setReprocessError] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const fetchProcessingStatus = useCallback(async () => {
    try {
      const res = await processingProgressService.getProcessingStatus(doc.id, doc.version);
      setProcessingRun(res.data.run);
      if (res.data.error) {
        setProcessingError(res.data.error.title);
        setProcessingErrorDetail(res.data.error);
      } else {
        setProcessingError(null);
        setProcessingErrorDetail(null);
      }
    } catch {
      setProcessingRun(null);
    } finally {
      setIsLoadingProcessing(false);
    }
  }, [doc.id, doc.version]);

  useEffect(() => {
    void fetchProcessingStatus();
  }, [fetchProcessingStatus]);

  useEffect(() => {
    const activeStatuses = ["queued", "running", "paused"];
    if (processingRun && activeStatuses.includes(processingRun.status)) {
      const interval = setInterval(() => {
        void fetchProcessingStatus();
      }, 3000);
      return () => clearInterval(interval);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processingRun?.status, fetchProcessingStatus]);

  const handleRetry = useCallback(async () => {
    setIsRetrying(true);
    setRetryError(null);
    try {
      await processingProgressService.retryProcessing(doc.id);
      setShowRetryDialog(false);
      setRetryError(null);
      await fetchProcessingStatus();
    } catch (err) {
      setRetryError(err instanceof Error ? err.message : "Failed to retry");
    } finally {
      setIsRetrying(false);
    }
  }, [doc.id, fetchProcessingStatus]);

  const handleReprocess = useCallback(async () => {
    setIsReprocessing(true);
    setReprocessError(null);
    try {
      await processingProgressService.reprocessDocument(doc.id);
      setShowReprocessDialog(false);
      setReprocessError(null);
      await fetchProcessingStatus();
    } catch (err) {
      setReprocessError(err instanceof Error ? err.message : "Failed to reprocess");
    } finally {
      setIsReprocessing(false);
    }
  }, [doc.id, fetchProcessingStatus]);

  const handleCancel = useCallback(async () => {
    setIsCanceling(true);
    setCancelError(null);
    try {
      await processingProgressService.cancelProcessing(doc.id);
      setShowCancelDialog(false);
      setCancelError(null);
      await fetchProcessingStatus();
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : "Failed to cancel");
    } finally {
      setIsCanceling(false);
    }
  }, [doc.id, fetchProcessingStatus]);

  const handleDownload = useCallback(async () => {
    if (!canDownload) return;
    try {
      await documentsService.downloadDocument(doc.id);
    } catch {
      // error handled by parent
    }
  }, [canDownload, doc.id]);

  async function handleReplace() {
    if (!canUpdate || !replaceFile) return;
    setIsReplacing(true);
    await onReplace(doc.id, replaceFile, replaceDesc || undefined);
    setIsReplacing(false);
    setShowReplaceForm(false);
    setReplaceFile(null);
    setReplaceDesc("");
  }

  const isActive = processingRun && ["queued", "running", "paused"].includes(processingRun.status);
  const isFailed = processingRun && processingRun.status === "failed";
  const isCanceled = processingRun && processingRun.status === "canceled";

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby="document-detail-title" className="fixed inset-y-0 end-0 z-50 flex w-full max-w-lg flex-col border-s border-outline-variant/30 bg-surface-container-lowest shadow-modal transition-transform sm:max-w-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-outline-variant/30 px-6 py-4">
          <h2 id="document-detail-title" className="text-title-lg font-bold text-on-surface truncate">{t("documents.detailTitle")}</h2>
          <button aria-label={t("common.close")} onClick={onClose} className="rounded-full p-2 text-on-surface-variant transition-colors hover:bg-surface-container-high">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="mb-6 flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <span className="material-symbols-outlined text-[28px]" style={{ fontVariationSettings: "'FILL' 1" }}>description</span>
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-title-md font-bold text-on-surface truncate">{doc.metadata.title || doc.fileName}</h3>
              <p className="mt-1 text-body-sm text-on-surface-variant truncate">{doc.fileName}</p>
            </div>
          </div>

          {/* Status badges */}
          <div className="mb-6 flex flex-wrap gap-2">
            <Badge status={STATUS_BADGE_MAP[doc.status] as "success" | "info" | "warning" | "error" | undefined} icon={STATUS_ICON_MAP[doc.status]}>
              {t(`documents.status${doc.status.charAt(0).toUpperCase() + doc.status.slice(1)}`)}
            </Badge>
            <ClassificationBadge level={doc.classification} />
            {doc.isArchived && <Badge status="warning" icon="archive">{t("documents.archived")}</Badge>}
            {doc.quarantineStatus === "quarantined" && <Badge status="error" icon="shield">{t("documents.quarantined")}</Badge>}
            <Badge status="neutral" icon="tag">{doc.versionLabel}</Badge>
          </div>

          {doc.scanResult && (
            <div className="mb-6 rounded-xl border border-outline-variant/30 bg-surface-container-low p-4">
              <p className="text-label-sm font-bold uppercase tracking-wider text-on-surface-variant">{t("documents.scanResult")}</p>
              <div className="mt-2 flex items-center gap-2">
                <Badge status={SCAN_RESULT_MAP[doc.scanResult.result] as "success" | "error" | "warning" | undefined}>
                  {doc.scanResult.result}
                </Badge>
                <span className="text-body-sm text-on-surface-variant">{doc.scanResult.scanner}</span>
              </div>
              {doc.scanResult.details && <p className="mt-1 text-body-sm text-on-surface-variant">{doc.scanResult.details}</p>}
            </div>
          )}

          {/* Processing Progress Section */}
          <div className="mb-6 rounded-xl border border-outline-variant/30 bg-surface-container-low p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-label-sm font-bold uppercase tracking-wider text-on-surface-variant">Processing Progress</p>
              {processingRun && <ProcessingStatusBadge status={processingRun.status} />}
            </div>

            {isLoadingProcessing ? (
              <Skeleton className="h-16 w-full rounded-lg" />
            ) : processingRun ? (
              <div>
                <ProcessingTimeline run={processingRun} />

                {/* Safe error display for failed runs */}
                {isFailed && processingRun.errorCode && (
                  <div className="mt-3 rounded-lg bg-red-50 border border-red-200 p-3">
                    <p className="text-sm font-medium text-red-800">
                      {processingRun.errorCode.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                    </p>
                    {processingRun.errorMessage && (
                      <p className="mt-1 text-sm text-red-600">{processingRun.errorMessage}</p>
                    )}
                    <p className="mt-1 text-xs text-red-500">
                      Retry {processingRun.retryCount} of {processingRun.maxRetries}
                    </p>
                  </div>
                )}

                {/* Processing action buttons */}
                {(isFailed || isCanceled) && canProcessOcr && (
                  <div className="mt-3 flex gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setShowRetryDialog(true)}
                    >
                      <span className="material-symbols-outlined me-1 text-[14px]">refresh</span>
                      Retry
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setShowReprocessDialog(true)}
                    >
                      <span className="material-symbols-outlined me-1 text-[14px]">replay</span>
                      Reprocess
                    </Button>
                  </div>
                )}

                {isActive && canProcessOcr && (
                  <Button
                    size="sm"
                    variant="danger"
                    className="mt-3"
                    onClick={() => setShowCancelDialog(true)}
                  >
                    <span className="material-symbols-outlined me-1 text-[14px]">cancel</span>
                    Cancel Processing
                  </Button>
                )}

                {processingRun.traceId && (
                  <p className="mt-2 text-xs text-on-surface-variant font-mono">
                    Trace: {processingRun.traceId.slice(0, 8)}...
                  </p>
                )}
              </div>
            ) : (
              <div>
                <p className="text-body-sm text-on-surface-variant">No processing run found for this document.</p>
                {canProcessOcr && (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="mt-2"
                    onClick={async () => {
                      try {
                        await processingProgressService.initiateProcessing(doc.id);
                        await fetchProcessingStatus();
                      } catch (err) {
                        setProcessingError(err instanceof Error ? err.message : "Failed to initiate processing");
                      }
                    }}
                  >
                    <span className="material-symbols-outlined me-1 text-[14px]">play_arrow</span>
                    Start Processing
                  </Button>
                )}
              </div>
            )}

            {processingError && (
              <div className="mt-2 rounded-lg border border-red-200 bg-red-50 p-3">
                <p className="text-sm font-medium text-red-700">{processingError}</p>
                {processingErrorDetail?.description && (
                  <p className="mt-1 text-xs text-red-600">{processingErrorDetail.description}</p>
                )}
                {processingErrorDetail?.retryable === false && (
                  <p className="mt-1 text-xs text-red-500">This error is not retryable.</p>
                )}
              </div>
            )}
          </div>

          <div className="mb-6">
            <DocumentQualityPanel
              documentId={doc.id}
              documentVersion={doc.version}
              canProcessOcr={canProcessOcr}
              canReviewQuality={permissions.can(Permission.DOCUMENTS_QUALITY_REVIEW)}
              highlightPage={highlightPage}
            />
          </div>

          <div className="mb-6">
            <IndexingStatusCard
              documentId={doc.id}
              canUpdate={canUpdate}
            />
          </div>

          <DocumentPolicyPanel document={doc} />

          <div className="mb-6 space-y-3">
            <h4 className="text-label-sm font-bold uppercase tracking-wider text-on-surface-variant">{t("documents.metadata")}</h4>
            <div className="grid grid-cols-2 gap-3 text-body-sm">
              <div>
                <p className="text-on-surface-variant">{t("documents.tableSize")}</p>
                <p className="font-medium text-on-surface">{getFileSizeLabel(doc.fileSize)}</p>
              </div>
              <div>
                <p className="text-on-surface-variant">{t("documents.tableType")}</p>
                <p className="font-medium text-on-surface">{doc.mimeType.split("/").pop()}</p>
              </div>
              <div>
                <p className="text-on-surface-variant">{t("documents.tableDate")}</p>
                <p className="font-medium text-on-surface">{new Date(doc.createdAt).toLocaleDateString()}</p>
              </div>
              <div>
                <p className="text-on-surface-variant">{t("documents.version")}</p>
                <p className="font-medium text-on-surface">{doc.versionLabel} ({t("documents.versionNumber", { n: String(doc.version) })})</p>
              </div>
              {doc.category && (
                <div>
                  <p className="text-on-surface-variant">{t("documents.category")}</p>
                  <p className="font-medium text-on-surface">{doc.category}</p>
                </div>
              )}
              {doc.department && (
                <div>
                  <p className="text-on-surface-variant">{t("documents.department")}</p>
                  <p className="font-medium text-on-surface">{doc.department}</p>
                </div>
              )}
            </div>
            {doc.metadata.description && (
              <div>
                <p className="text-on-surface-variant">{t("documents.metadataDescription")}</p>
                <p className="mt-1 text-on-surface">{doc.metadata.description}</p>
              </div>
            )}
            {doc.metadata.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {doc.metadata.tags.map((tag) => (
                  <span key={tag} className="rounded-full bg-surface-container-high px-2.5 py-0.5 text-body-sm text-on-surface-variant">{tag}</span>
                ))}
              </div>
            )}
            {doc.checksum && (
              <div>
                <p className="text-on-surface-variant">{t("documents.checksum")}</p>
                <p className="mt-1 break-all font-mono text-body-sm text-on-surface">{doc.checksum}</p>
              </div>
            )}
          </div>

          <div className="mb-6">
            <h4 className="text-label-sm font-bold uppercase tracking-wider text-on-surface-variant">{t("documents.versionHistory")}</h4>
            {isLoadingVersions ? (
              <div className="mt-3 space-y-2">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}
              </div>
            ) : versions.length === 0 ? (
              <p className="mt-3 text-body-sm text-on-surface-variant">{t("documents.noVersions")}</p>
            ) : (
              <div className="mt-3 space-y-2">
                {versions.map((v) => (
                  <div key={v.id} className="flex items-center justify-between rounded-lg border border-outline-variant/20 bg-surface-container-low px-3 py-2">
                    <div>
                      <p className="text-body-sm font-medium text-on-surface">{v.versionLabel} — {v.fileName}</p>
                      <p className="text-body-sm text-on-surface-variant">{getFileSizeLabel(v.fileSize)} · {new Date(v.createdAt).toLocaleDateString()} · {v.uploadReason}</p>
                    </div>
                    <Badge status={v.version === doc.version ? "info" : "neutral"}>
                      {v.version === doc.version ? t("documents.current") : ""}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Action bar */}
        <div className="border-t border-outline-variant/30 bg-surface-container-lowest px-6 py-4">
          {showReplaceForm && canUpdate ? (
            <div className="space-y-3">
              <input type="file" accept=".pdf,.docx,.doc,.txt,.md" onChange={(e) => setReplaceFile(e.target.files?.[0] ?? null)} className="w-full text-body-sm" />
              <input type="text" value={replaceDesc} onChange={(e) => setReplaceDesc(e.target.value)} placeholder={t("documents.changeDescription")} className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-body-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
              <div className="flex gap-2">
                <Button size="sm" isLoading={isReplacing} disabled={!replaceFile} onClick={handleReplace}>{t("documents.replace")}</Button>
                <Button size="sm" variant="ghost" onClick={() => { setShowReplaceForm(false); setReplaceFile(null); setReplaceDesc(""); }}>{t("common.cancel")}</Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {canDownload ? (
                <Button size="sm" onClick={handleDownload}>
                  <span className="material-symbols-outlined me-1 text-[18px]" aria-hidden="true">download</span>
                  {t("documents.download")}
                </Button>
              ) : null}
              {canUpdate && !doc.isArchived && !doc.deletedAt && (
                <Button size="sm" variant="secondary" onClick={() => setShowReplaceForm(true)}>
                  <span className="material-symbols-outlined me-1 text-[18px]" aria-hidden="true">swap_horiz</span>
                  {t("documents.replace")}
                </Button>
              )}
              {canArchive && !doc.isArchived && !doc.deletedAt && (
                <Button size="sm" variant="secondary" onClick={() => setConfirmAction("archive")}>
                  <span className="material-symbols-outlined me-1 text-[18px]" aria-hidden="true">archive</span>
                  {t("documents.archive")}
                </Button>
              )}
              {canArchive && doc.isArchived && (
                <Button size="sm" variant="secondary" onClick={() => setConfirmAction("restore")}>
                  <span className="material-symbols-outlined me-1 text-[18px]" aria-hidden="true">unarchive</span>
                  {t("documents.restore")}
                </Button>
              )}
              <div className="ms-auto">
                {canDelete && !doc.deletedAt && (
                  <Button size="sm" variant="danger" onClick={() => setConfirmAction("softDelete")}>
                    <span className="material-symbols-outlined me-1 text-[18px]" aria-hidden="true">delete</span>
                    {t("documents.moveToTrash")}
                  </Button>
                )}
                {canDelete && doc.deletedAt && (
                  <Button size="sm" variant="danger" onClick={() => setConfirmAction("permanentDelete")}>
                    <span className="material-symbols-outlined me-1 text-[18px]" aria-hidden="true">delete_forever</span>
                    {t("documents.permanentDelete")}
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {confirmAction === "archive" && <ConfirmDialog action="archive" onConfirm={() => { onArchive(doc.id); setConfirmAction(null); }} onCancel={() => setConfirmAction(null)} />}
      {confirmAction === "restore" && <ConfirmDialog action="restore" onConfirm={() => { onRestore(doc.id); setConfirmAction(null); }} onCancel={() => setConfirmAction(null)} />}
      {confirmAction === "softDelete" && <ConfirmDialog action="delete" onConfirm={() => { onSoftDelete(doc.id); setConfirmAction(null); }} onCancel={() => setConfirmAction(null)} />}
      {confirmAction === "permanentDelete" && <ConfirmDialog action="permanentDelete" onConfirm={() => { onPermanentDelete(doc.id); setConfirmAction(null); }} onCancel={() => setConfirmAction(null)} />}

      <RetryConfirmDialog
        open={showRetryDialog}
        onConfirm={handleRetry}
        onCancel={() => { setShowRetryDialog(false); setRetryError(null); }}
        isLoading={isRetrying}
        error={retryError}
      />
      <ReprocessConfirmDialog
        open={showReprocessDialog}
        onConfirm={handleReprocess}
        onCancel={() => { setShowReprocessDialog(false); setReprocessError(null); }}
        isLoading={isReprocessing}
        error={reprocessError}
      />
      <CancelConfirmDialog
        open={showCancelDialog}
        onConfirm={handleCancel}
        onCancel={() => { setShowCancelDialog(false); setCancelError(null); }}
        isLoading={isCanceling}
        error={cancelError}
      />
    </>
  );
}

const STATUS_BADGE_MAP: Record<string, string> = {
  uploaded: "info",
  uploading: "warning",
  processing: "warning",
  processed: "success",
  failed: "error",
  canceled: "neutral",
  reprocessing: "warning",
};

const STATUS_ICON_MAP: Record<string, string> = {
  uploaded: "upload",
  uploading: "sync",
  processing: "sync",
  processed: "check_circle",
  failed: "error",
  canceled: "cancel",
  reprocessing: "replay",
};
