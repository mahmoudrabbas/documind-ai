"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError } from "@/lib/api-client";
import {
  confirmImport,
  downloadTemplate,
  getBatchStatus,
  updateMapping,
  uploadImportFile,
} from "@/services/imports.service";
import type {
  ImportBatchView,
  ImportPreview,
  ImportRowState,
} from "@/types/api/imports.types";
import { useI18n } from "@/providers/i18n-provider";
import { codeLabel } from "@/lib/i18n/code-label";
import {
  DashboardPageHeader,
  DashboardPanel,
} from "@/components/ui/DashboardPage";

type PagePhase =
  | "upload"
  | "mapping"
  | "confirming"
  | "processing"
  | "done"
  | "error";

type ColumnMapping = Record<string, string>;

/* `value` is the contract field identifier posted to the mapping endpoint
   and must never be translated. `labelKey` supplies the visible option text. */
const TARGET_FIELDS = [
  { value: "name", labelKey: "dashboard.import.field.fullName" },
  { value: "firstName", labelKey: "dashboard.import.field.firstName" },
  { value: "lastName", labelKey: "dashboard.import.field.lastName" },
  { value: "email", labelKey: "dashboard.import.field.email" },
  { value: "employeeId", labelKey: "dashboard.import.field.employeeId" },
  { value: "department", labelKey: "dashboard.import.field.department" },
  { value: "jobTitle", labelKey: "dashboard.import.field.jobTitle" },
  { value: "customRole", labelKey: "dashboard.import.field.customRole" },
  { value: "language", labelKey: "dashboard.import.field.language" },
  { value: "phone", labelKey: "dashboard.import.field.phone" },
  { value: "hireDate", labelKey: "dashboard.import.field.hireDate" },
  { value: "managerEmail", labelKey: "dashboard.import.field.managerEmail" },
  { value: "_skip", labelKey: "dashboard.import.field.skip" },
];

const ROW_STATE_BADGE: Record<string, string> = {
  VALID: "bg-emerald-100 text-emerald-800",
  CREATED: "bg-emerald-100 text-emerald-800",
  INVITED: "bg-emerald-100 text-emerald-800",
  WARNING: "bg-amber-100 text-amber-800",
  SKIPPED: "bg-amber-100 text-amber-800",
  INVALID: "bg-red-100 text-red-800",
  FAILED: "bg-red-100 text-red-800",
  PENDING: "bg-slate-100 text-slate-800",
  PROCESSING: "bg-blue-100 text-blue-800",
};

function generateIdempotencyKey(): string {
  return `import_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export default function ImportPage() {
  const router = useRouter();
  const { t, tPlural } = useI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<PagePhase>("upload");
  const [error, setError] = useState<string | null>(null);
  const [, setUploadProgress] = useState<number>(0);
  const [isDragging, setIsDragging] = useState(false);

  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [idempotencyKey] = useState(generateIdempotencyKey);

  const [batch, setBatch] = useState<ImportBatchView | null>(null);

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  async function pollBatchStatus(id: string) {
    try {
      const res = await getBatchStatus(id);
      const b = res.data;
      setBatch(b);
      if (
        b.status === "COMPLETED" ||
        b.status === "PARTIALLY_COMPLETED" ||
        b.status === "FAILED" ||
        b.status === "CANCELLED"
      ) {
        stopPolling();
        setPhase("done");
      }
    } catch {
      stopPolling();
      setPhase("error");
      setError(t("dashboard.import.statusCheckError"));
    }
  }

  async function handleDownloadTemplate() {
    try {
      const blob = await downloadTemplate();
      const url = URL.createObjectURL(blob);
      const a = window.document.createElement("a");
      a.href = url;
      a.download = "employee-import-template.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : t("dashboard.import.templateDownloadError"),
      );
    }
  }

  function handleDragOver(event: React.DragEvent) {
    event.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave(event: React.DragEvent) {
    event.preventDefault();
    setIsDragging(false);
  }

  function handleDrop(event: React.DragEvent) {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) void handleFileSelected(file);
  }

  function handleFileInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) void handleFileSelected(file);
  }

  async function handleFileSelected(file: File) {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!ext || !["xlsx", "xls", "csv"].includes(ext)) {
      setError(t("dashboard.import.selectSpreadsheetFile"));
      return;
    }
    setError(null);
    setPhase("mapping");
    setUploadProgress(0);

    try {
      const res = await uploadImportFile(file, setUploadProgress);
      setPreview(res.data);
      setBatchId(res.data.batchId);
      setMapping(res.data.suggestedMapping);
    } catch (err) {
      setPhase("upload");
      setError(
        err instanceof ApiError ? err.message : "Upload failed. Please try again.",
      );
    }
  }

  async function handleRemap() {
    if (!batchId) return;
    try {
      const res = await updateMapping(batchId, mapping);
      setPreview(res.data);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : t("dashboard.import.updateMappingError"),
      );
    }
  }

  function handleMappingChange(sourceColumn: string, targetField: string) {
    setMapping((prev) => ({ ...prev, [sourceColumn]: targetField }));
  }

  async function handleConfirmImport() {
    if (!batchId) return;
    setError(null);
    setPhase("confirming");

    try {
      await confirmImport(batchId, idempotencyKey);
      setPhase("processing");
      const statusRes = await getBatchStatus(batchId);
      setBatch(statusRes.data);

      pollingRef.current = setInterval(() => {
        void pollBatchStatus(batchId);
      }, 3000);
    } catch (err) {
      setPhase("mapping");
      setError(
        err instanceof ApiError
          ? err.message
          : t("dashboard.import.startImportError"),
      );
    }
  }

  function renderUploadPhase() {
    return (
      <DashboardPanel>
        <div className="mb-6">
          <h2 className="text-title-lg font-bold text-primary">
            {t("dashboard.import.uploadPhaseTitle")}
          </h2>
          <p className="mt-1 text-body-sm leading-relaxed text-on-surface-variant">
            {t("dashboard.import.uploadPhaseDescription")}
          </p>
        </div>

        <div className="mb-6">
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg border border-outline-variant bg-surface px-4 py-2.5 text-label-md font-bold text-on-surface shadow-sm transition-colors hover:bg-surface-container-low"
            onClick={() => void handleDownloadTemplate()}
          >
            <span className="material-symbols-outlined text-[18px]">download</span>
            {t("dashboard.import.downloadTemplate")}
          </button>
        </div>

        <div
          className={`relative flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-12 text-center transition-colors ${
            isDragging
              ? "border-primary bg-primary/5"
              : "border-outline-variant bg-surface hover:border-primary/50"
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <span className="material-symbols-outlined mb-3 text-5xl text-outline">
            cloud_upload
          </span>
          <p className="text-title-lg font-bold text-on-surface">
            {t("dashboard.import.dropzoneTitleShort")}
          </p>
          <p className="mt-1 text-body-sm text-on-surface-variant">
            {t("dashboard.import.dropzoneBrowseHint")}
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={handleFileInputChange}
          />
        </div>
      </DashboardPanel>
    );
  }

  function renderMappingPhase() {
    if (!preview) return null;
    return (
      <>
        <DashboardPanel>
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-title-lg font-bold text-primary">
                {t("dashboard.import.reviewMappingTitle")}
              </h2>
              <p className="mt-1 text-body-sm leading-relaxed text-on-surface-variant">
                {t("dashboard.import.fileLabel")}{" "}
                <span className="font-medium text-on-surface">{preview.originalFileName}</span>
                &nbsp;&mdash; {tPlural("dashboard.import.rowsFound", preview.totalRows)}
              </p>
            </div>
            <div className="shrink-0 rounded-full bg-surface-container-low px-3 py-1 text-label-sm font-bold text-on-surface-variant">
              {t("dashboard.import.stepIndicator", { current: "2", total: "3" })}
            </div>
          </div>

          <div className="max-w-full overflow-x-auto rounded-xl border border-outline-variant/30">
            <table className="w-full min-w-[500px] divide-y divide-outline-variant/30 text-start text-sm">
              <thead className="bg-surface-container-low">
                <tr>
                  <th className="px-4 py-3 text-label-sm font-bold uppercase tracking-wider text-on-surface-variant">
                    {t("dashboard.import.colSourceColumn")}
                  </th>
                  <th className="px-4 py-3 text-label-sm font-bold uppercase tracking-wider text-on-surface-variant">
                    {t("dashboard.import.colMapTo")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/30 bg-surface-container-lowest">
                {preview.columns.map((col) => (
                  <tr key={col} className="transition-colors hover:bg-surface-container-low/50">
                    <td className="px-4 py-3 font-medium text-on-surface">
                      {col}
                    </td>
                    <td className="px-4 py-3">
                      <select
                        className="w-full max-w-xs rounded-md border border-outline-variant bg-surface px-2 py-1.5 text-sm text-on-surface shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                        value={mapping[col] ?? ""}
                        onChange={(event) =>
                          handleMappingChange(col, event.target.value)
                        }
                      >
                        <option value="" disabled>
                          {t("dashboard.import.selectFieldOption")}
                        </option>
                        {TARGET_FIELDS.map((field) => (
                          <option key={field.value} value={field.value}>
                            {t(field.labelKey)}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex justify-end">
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-lg bg-secondary px-4 py-2 text-label-md font-bold text-on-secondary shadow-sm transition-colors hover:bg-secondary-container hover:text-on-secondary-container"
              onClick={() => void handleRemap()}
            >
              <span className="material-symbols-outlined text-[18px]">refresh</span>
              {t("dashboard.import.rePreviewWithMapping")}
            </button>
          </div>
        </DashboardPanel>

        <DashboardPanel>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-title-md font-bold text-primary">
              {t("dashboard.import.validationPreview")}
            </h3>
            <div className="flex gap-3 text-sm">
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />
                {tPlural("dashboard.import.validCount", preview.summary.validRows)}
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-500" />
                {tPlural("dashboard.import.warningCount", preview.summary.warningRows)}
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" />
                {tPlural("dashboard.import.invalidCount", preview.summary.invalidRows)}
              </span>
            </div>
          </div>

          <div className="max-w-full overflow-x-auto rounded-xl border border-outline-variant/30">
            <table className="w-full min-w-[600px] divide-y divide-outline-variant/30 text-start text-sm">
              <thead className="bg-surface-container-low">
                <tr>
                  <th className="px-4 py-3 text-label-sm font-bold uppercase tracking-wider text-on-surface-variant">
                    #
                  </th>
                  <th className="px-4 py-3 text-label-sm font-bold uppercase tracking-wider text-on-surface-variant">
                    {t("dashboard.import.colState")}
                  </th>
                  {preview.columns.map((col) => (
                    <th
                      key={col}
                      className="px-4 py-3 text-label-sm font-bold uppercase tracking-wider text-on-surface-variant"
                    >
                      {col}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-label-sm font-bold uppercase tracking-wider text-on-surface-variant">
                    {t("dashboard.import.colMessages")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/30 bg-surface-container-lowest">
                {preview.rows.length > 0 ? (
                  preview.rows.map((row) => (
                    <tr
                      key={row.rowNumber}
                      className={`transition-colors ${
                        row.state === "INVALID"
                          ? "bg-red-50/50"
                          : row.state === "WARNING"
                            ? "bg-amber-50/50"
                            : "hover:bg-surface-container-low/50"
                      }`}
                    >
                      <td className="px-4 py-2.5 font-medium text-on-surface">
                        {row.rowNumber}
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${ROW_STATE_BADGE[row.state]}`}
                        >
                          {codeLabel(t, "dashboard.importRowState", row.state)}
                        </span>
                      </td>
                      {preview.columns.map((col) => (
                        <td
                          key={col}
                          className="max-w-[160px] truncate px-4 py-2.5 text-on-surface-variant"
                        >
                          {row.data[col] ?? ""}
                        </td>
                      ))}
                      <td className="px-4 py-2.5">
                        {row.errors && row.errors.length > 0 && (
                          <p className="text-xs text-red-700">
                            {row.errors.join("; ")}
                          </p>
                        )}
                        {row.warnings && row.warnings.length > 0 && (
                          <p className="text-xs text-amber-700">
                            {row.warnings.join("; ")}
                          </p>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={preview.columns.length + 3}
                      className="px-4 py-8 text-center text-sm text-on-surface-variant"
                    >
                      {t("dashboard.import.noRowsToPreview")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <div className="flex gap-4 text-sm">
              <span className="font-medium text-on-surface">
                {tPlural("dashboard.import.totalRowsCount", preview.summary.totalRows)}
              </span>
              <span className="text-emerald-700">
                {tPlural("dashboard.import.validCount", preview.summary.validRows)}
              </span>
              <span className="text-amber-700">
                {tPlural("dashboard.import.warningCount", preview.summary.warningRows)}
              </span>
              <span className="text-red-700">
                {tPlural("dashboard.import.invalidCount", preview.summary.invalidRows)}
              </span>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-lg border border-outline-variant bg-surface px-4 py-2 text-label-md font-bold text-on-surface shadow-sm transition-colors hover:bg-surface-container-low"
                onClick={() => {
                  setPhase("upload");
                  setPreview(null);
                  setBatchId(null);
                  setError(null);
                }}
              >
                {t("common.back")}
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-2 text-label-md font-bold text-on-primary shadow-sm transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={preview.summary.validRows === 0}
                onClick={() => void handleConfirmImport()}
              >
                {t("dashboard.import.confirmImport")}
              </button>
            </div>
          </div>
        </DashboardPanel>
      </>
    );
  }

  function renderProcessingPhase() {
    return (
      <DashboardPanel>
        <div className="flex flex-col items-center py-12 text-center">
          <span className="material-symbols-outlined mb-4 animate-spin text-5xl text-primary">
            progress_activity
          </span>
          <h2 className="text-title-lg font-bold text-on-surface">
            {t("dashboard.import.inProgressTitle")}
          </h2>
          <p className="mt-2 text-body-sm text-on-surface-variant">
            {t("dashboard.import.inProgressDesc")}
          </p>
          {batch && (
            <div className="mt-6 flex gap-6 text-sm">
              <span className="text-on-surface-variant">
                {t("dashboard.import.processedOf", {
                  done: String(
                    batch.summary.createdCount + batch.summary.failedCount,
                  ),
                  total: String(batch.summary.totalRows),
                })}
              </span>
              <span className="text-emerald-700">
                {t("dashboard.import.createdLabel", {
                  count: String(batch.summary.createdCount),
                })}
              </span>
              <span className="text-red-700">
                {t("dashboard.import.failedLabel", {
                  count: String(batch.summary.failedCount),
                })}
              </span>
            </div>
          )}
        </div>
      </DashboardPanel>
    );
  }

  function renderDonePhase() {
    if (!batch) return null;
    const hasFailures =
      batch.status === "PARTIALLY_COMPLETED" || batch.status === "FAILED";
    return (
      <DashboardPanel>
        <div className="flex flex-col items-center py-10 text-center">
          <span
            className={`material-symbols-outlined mb-4 text-5xl ${
              hasFailures ? "text-amber-500" : "text-emerald-500"
            }`}
          >
            {hasFailures ? "warning" : "check_circle"}
          </span>
          <h2 className="text-title-lg font-bold text-on-surface">
            {batch.status === "COMPLETED"
              ? t("dashboard.import.resultCompleted")
              : batch.status === "PARTIALLY_COMPLETED"
                ? t("dashboard.import.resultPartiallyCompleted")
                : t("dashboard.import.resultFailed")}
          </h2>

          <div className="mt-4 flex flex-wrap justify-center gap-6 text-sm">
            <div className="rounded-xl border border-outline-variant/30 bg-surface px-4 py-3 text-center">
              <p className="text-2xl font-bold text-on-surface">
                {batch.summary.createdCount}
              </p>
              <p className="text-xs text-on-surface-variant">
                {t("dashboard.import.created")}
              </p>
            </div>
            <div className="rounded-xl border border-outline-variant/30 bg-surface px-4 py-3 text-center">
              <p className="text-2xl font-bold text-red-600">
                {batch.summary.failedCount}
              </p>
              <p className="text-xs text-on-surface-variant">
                {t("dashboard.import.failed")}
              </p>
            </div>
            <div className="rounded-xl border border-outline-variant/30 bg-surface px-4 py-3 text-center">
              <p className="text-2xl font-bold text-on-surface">
                {batch.summary.totalRows}
              </p>
              <p className="text-xs text-on-surface-variant">
                {t("dashboard.import.total")}
              </p>
            </div>
          </div>

          {batch.errorMessage && (
            <p className="mt-4 max-w-md text-sm text-red-700">
              {batch.errorMessage}
            </p>
          )}

          {batch.summary.invalidRows > 0 && (
            <p className="mt-2 text-sm text-red-600">
              {tPlural("dashboard.import.rowsSkipped", batch.summary.invalidRows)}
            </p>
          )}

          <div className="mt-6 flex gap-3">
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-label-md font-bold text-on-primary shadow-sm transition-all hover:opacity-90"
              onClick={() => router.push(`/dashboard/users/import/${batch.id}`)}
            >
              {t("dashboard.import.viewBatchDetail")}
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-lg border border-outline-variant bg-surface px-4 py-2 text-label-md font-bold text-on-surface shadow-sm transition-colors hover:bg-surface-container-low"
              onClick={() => {
                setPhase("upload");
                setPreview(null);
                setBatchId(null);
                setBatch(null);
                setError(null);
              }}
            >
              {t("dashboard.import.importAnotherFile")}
            </button>
          </div>
        </div>
      </DashboardPanel>
    );
  }

  function renderErrorPhase() {
    return (
      <DashboardPanel>
        <div className="flex flex-col items-center py-10 text-center">
          <span className="material-symbols-outlined mb-4 text-5xl text-red-500">
            error
          </span>
          <h2 className="text-title-lg font-bold text-on-surface">
            {t("common.error")}
          </h2>
          {error && (
            <p className="mt-2 text-sm text-red-700">{error}</p>
          )}
          <button
            type="button"
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-label-md font-bold text-on-primary shadow-sm transition-all hover:opacity-90"
            onClick={() => {
              setPhase("upload");
              setPreview(null);
              setBatchId(null);
              setBatch(null);
              setError(null);
            }}
          >
            {t("common.tryAgain")}
          </button>
        </div>
      </DashboardPanel>
    );
  }

  return (
    <>
      <DashboardPageHeader
        eyebrow={
          <div className="inline-flex w-fit items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-primary">
            <span className="material-symbols-outlined text-[16px]">
              file_upload
            </span>
            {t("dashboard.import.eyebrow")}
          </div>
        }
        title={t("dashboard.import.pageTitle")}
        description={t("dashboard.import.pageDescription")}
        actions={
          <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest px-4 py-3 text-sm shadow-sm">
            <p className="font-semibold text-on-surface">
              {t("dashboard.import.supportedFormats")}
            </p>
            <p className="mt-1 max-w-xs text-on-surface-variant">
              {t("dashboard.import.supportedFormatsHint")}
            </p>
          </div>
        }
      />

      {error ? (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          {error}
        </div>
      ) : null}

      {phase === "upload" && renderUploadPhase()}
      {phase === "mapping" && renderMappingPhase()}
      {phase === "confirming" && (
        <DashboardPanel>
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-on-surface-variant">
            <span className="material-symbols-outlined animate-spin">
              progress_activity
            </span>
            {t("dashboard.import.startingImport")}
          </div>
        </DashboardPanel>
      )}
      {phase === "processing" && renderProcessingPhase()}
      {phase === "done" && renderDonePhase()}
      {phase === "error" && renderErrorPhase()}
    </>
  );
}
