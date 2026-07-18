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
  ImportBatchStatus,
  ImportBatchView,
  ImportPreview,
  ImportRowView,
  ImportRowState,
} from "@/types/api/imports.types";
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

const TARGET_FIELDS = [
  { value: "name", label: "Full Name" },
  { value: "firstName", label: "First Name" },
  { value: "lastName", label: "Last Name" },
  { value: "email", label: "Email" },
  { value: "employeeId", label: "Employee ID" },
  { value: "department", label: "Department" },
  { value: "jobTitle", label: "Job Title" },
  { value: "customRole", label: "Custom Role" },
  { value: "language", label: "Preferred Language" },
  { value: "phone", label: "Phone" },
  { value: "hireDate", label: "Hire Date" },
  { value: "managerEmail", label: "Manager Email" },
  { value: "_skip", label: "(Skip column)" },
];

const ROW_STATE_STYLES: Record<ImportRowState, string> = {
  VALID: "bg-emerald-50 text-emerald-900",
  WARNING: "bg-amber-50 text-amber-900",
  INVALID: "bg-red-50 text-red-900",
};

const ROW_STATE_BADGE: Record<ImportRowState, string> = {
  VALID: "bg-emerald-100 text-emerald-800",
  WARNING: "bg-amber-100 text-amber-800",
  INVALID: "bg-red-100 text-red-800",
};

function generateIdempotencyKey(): string {
  return `import_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function getStatusBadgeClass(status: ImportBatchStatus): string {
  switch (status) {
    case "PROCESSING":
    case "VALIDATING":
      return "bg-blue-100 text-blue-800";
    case "COMPLETED":
      return "bg-emerald-100 text-emerald-800";
    case "PARTIALLY_COMPLETED":
      return "bg-amber-100 text-amber-800";
    case "FAILED":
      return "bg-red-100 text-red-800";
    case "CANCELLED":
      return "bg-neutral-100 text-neutral-800";
    default:
      return "bg-surface-container text-on-surface-variant";
  }
}

export default function ImportPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<PagePhase>("upload");
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
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
      setError("Failed to check import status.");
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
          : "Failed to download template.",
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
      setError("Please select an .xlsx, .xls, or .csv file.");
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
          : "Failed to update mapping.",
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
          : "Failed to start import.",
      );
    }
  }

  function renderUploadPhase() {
    return (
      <DashboardPanel>
        <div className="mb-6">
          <h2 className="text-title-lg font-bold text-primary">
            Upload Employee File
          </h2>
          <p className="mt-1 text-body-sm leading-relaxed text-on-surface-variant">
            Upload an Excel or CSV file to bulk-import employees into your
            company directory. Download the template first to ensure the correct
            format.
          </p>
        </div>

        <div className="mb-6">
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg border border-outline-variant bg-surface px-4 py-2.5 text-label-md font-bold text-on-surface shadow-sm transition-colors hover:bg-surface-container-low"
            onClick={() => void handleDownloadTemplate()}
          >
            <span className="material-symbols-outlined text-[18px]">download</span>
            Download Template
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
            Drag & drop your file here
          </p>
          <p className="mt-1 text-body-sm text-on-surface-variant">
            or click to browse &mdash; .xlsx, .xls, .csv accepted
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
                Review Column Mapping
              </h2>
              <p className="mt-1 text-body-sm leading-relaxed text-on-surface-variant">
                File: <span className="font-medium text-on-surface">{preview.originalFileName}</span>
                &nbsp;&mdash; {preview.totalRows} rows found
              </p>
            </div>
            <div className="shrink-0 rounded-full bg-surface-container-low px-3 py-1 text-label-sm font-bold text-on-surface-variant">
              Step 2 of 3
            </div>
          </div>

          <div className="max-w-full overflow-x-auto rounded-xl border border-outline-variant/30">
            <table className="w-full min-w-[500px] divide-y divide-outline-variant/30 text-start text-sm">
              <thead className="bg-surface-container-low">
                <tr>
                  <th className="px-4 py-3 text-label-sm font-bold uppercase tracking-wider text-on-surface-variant">
                    Source Column
                  </th>
                  <th className="px-4 py-3 text-label-sm font-bold uppercase tracking-wider text-on-surface-variant">
                    Map To
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
                          Select field
                        </option>
                        {TARGET_FIELDS.map((field) => (
                          <option key={field.value} value={field.value}>
                            {field.label}
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
              Re-preview with this mapping
            </button>
          </div>
        </DashboardPanel>

        <DashboardPanel>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-title-md font-bold text-primary">
              Validation Preview
            </h3>
            <div className="flex gap-3 text-sm">
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />
                {preview.summary.validRows} valid
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-500" />
                {preview.summary.warningRows} warnings
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" />
                {preview.summary.invalidRows} invalid
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
                    State
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
                    Messages
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
                          {row.state}
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
                      No rows to preview.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <div className="flex gap-4 text-sm">
              <span className="font-medium text-on-surface">
                Total: {preview.summary.totalRows} rows
              </span>
              <span className="text-emerald-700">
                {preview.summary.validRows} valid
              </span>
              <span className="text-amber-700">
                {preview.summary.warningRows} warnings
              </span>
              <span className="text-red-700">
                {preview.summary.invalidRows} invalid
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
                Back
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-2 text-label-md font-bold text-on-primary shadow-sm transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={preview.summary.validRows === 0}
                onClick={() => void handleConfirmImport()}
              >
                Confirm Import
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
            Import in progress
          </h2>
          <p className="mt-2 text-body-sm text-on-surface-variant">
            Processing your file. This may take a moment...
          </p>
          {batch && (
            <div className="mt-6 flex gap-6 text-sm">
              <span className="text-on-surface-variant">
                Processed:{" "}
                {batch.summary.createdCount + batch.summary.failedCount} /{" "}
                {batch.summary.totalRows}
              </span>
              <span className="text-emerald-700">
                Created: {batch.summary.createdCount}
              </span>
              <span className="text-red-700">
                Failed: {batch.summary.failedCount}
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
              ? "Import completed"
              : batch.status === "PARTIALLY_COMPLETED"
                ? "Partially completed"
                : "Import failed"}
          </h2>

          <div className="mt-4 flex flex-wrap justify-center gap-6 text-sm">
            <div className="rounded-xl border border-outline-variant/30 bg-surface px-4 py-3 text-center">
              <p className="text-2xl font-bold text-on-surface">
                {batch.summary.createdCount}
              </p>
              <p className="text-xs text-on-surface-variant">Created</p>
            </div>
            <div className="rounded-xl border border-outline-variant/30 bg-surface px-4 py-3 text-center">
              <p className="text-2xl font-bold text-red-600">
                {batch.summary.failedCount}
              </p>
              <p className="text-xs text-on-surface-variant">Failed</p>
            </div>
            <div className="rounded-xl border border-outline-variant/30 bg-surface px-4 py-3 text-center">
              <p className="text-2xl font-bold text-on-surface">
                {batch.summary.totalRows}
              </p>
              <p className="text-xs text-on-surface-variant">Total</p>
            </div>
          </div>

          {batch.errorMessage && (
            <p className="mt-4 max-w-md text-sm text-red-700">
              {batch.errorMessage}
            </p>
          )}

          {batch.summary.invalidRows > 0 && (
            <p className="mt-2 text-sm text-red-600">
              {batch.summary.invalidRows} row(s) were skipped due to validation
              errors.
            </p>
          )}

          <div className="mt-6 flex gap-3">
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-label-md font-bold text-on-primary shadow-sm transition-all hover:opacity-90"
              onClick={() => router.push(`/dashboard/users/import/${batch.id}`)}
            >
              View batch detail
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
              Import another file
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
            Something went wrong
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
            Try again
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
            Employee import
          </div>
        }
        title="Import Employees"
        description="Upload a spreadsheet of employees to bulk-add them to your company directory with the right information from the start."
        actions={
          <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest px-4 py-3 text-sm shadow-sm">
            <p className="font-semibold text-on-surface">
              Supported formats
            </p>
            <p className="mt-1 max-w-xs text-on-surface-variant">
              .xlsx, .xls, and .csv files up to 10 MB. Download the template
              to get started.
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
            Starting import...
          </div>
        </DashboardPanel>
      )}
      {phase === "processing" && renderProcessingPhase()}
      {phase === "done" && renderDonePhase()}
      {phase === "error" && renderErrorPhase()}
    </>
  );
}
