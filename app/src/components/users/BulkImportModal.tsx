"use client";

import { useState, useEffect, useRef } from "react";
import {
  cancelBatch,
  confirmImport,
  downloadTemplate,
  getBatchWithRows,
  updateMapping,
  uploadImportFile,
} from "@/services/imports.service";
import type {
  ImportBatchView,
  ImportPreview,
  ImportRowState,
  ImportRowView,
} from "@/types/api/imports.types";

interface BulkImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportSuccess?: () => void;
}

type Step = "UPLOAD" | "MAPPING" | "PROCESSING" | "SUMMARY";

const SYSTEM_FIELDS = [
  { key: "email", label: "Email Address", required: true },
  { key: "fullName", label: "Full Name", required: false },
  { key: "firstName", label: "First Name", required: false },
  { key: "lastName", label: "Last Name", required: false },
  { key: "role", label: "System Role (ADMIN/EMPLOYEE)", required: false },
  { key: "customRole", label: "Custom Role", required: false },
  { key: "department", label: "Department", required: false },
  { key: "jobTitle", label: "Job Title", required: false },
  { key: "employeeId", label: "Employee ID", required: false },
  { key: "phone", label: "Phone Number", required: false },
  { key: "hireDate", label: "Hire Date", required: false },
  { key: "managerEmail", label: "Manager Email", required: false },
  { key: "language", label: "Language", required: false },
];

const STATE_BADGE_STYLES: Record<string, string> = {
  VALID: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30 dark:text-emerald-400",
  CREATED: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30 dark:text-emerald-400",
  INVITED: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30 dark:text-emerald-400",
  WARNING: "bg-amber-500/10 text-amber-600 border-amber-500/30 dark:text-amber-400",
  SKIPPED: "bg-amber-500/10 text-amber-600 border-amber-500/30 dark:text-amber-400",
  INVALID: "bg-rose-500/10 text-rose-600 border-rose-500/30 dark:text-rose-400",
  FAILED: "bg-rose-500/10 text-rose-600 border-rose-500/30 dark:text-rose-400",
  PENDING: "bg-slate-500/10 text-slate-600 border-slate-500/30 dark:text-slate-400",
  PROCESSING: "bg-blue-500/10 text-blue-600 border-blue-500/30 dark:text-blue-400",
};

export function BulkImportModal({
  isOpen,
  onClose,
  onImportSuccess,
}: BulkImportModalProps) {
  const [step, setStep] = useState<Step>("UPLOAD");
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [isUploading, setIsUploading] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [isUpdatingMapping, setIsUpdatingMapping] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [batchDetail, setBatchDetail] = useState<
    (ImportBatchView & { rows?: ImportRowView[] }) | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [rowStateFilter, setRowStateFilter] = useState<ImportRowState | "ALL">("ALL");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Reset modal state when opened
  useEffect(() => {
    if (isOpen) {
      setStep("UPLOAD");
      setFile(null);
      setUploadProgress(0);
      setIsUploading(false);
      setPreview(null);
      setColumnMapping({});
      setBatchId(null);
      setBatchDetail(null);
      setError(null);
      setRowStateFilter("ALL");
    } else {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    }
  }, [isOpen]);

  // Clean up poll timers on unmount
  useEffect(() => {
    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
      }
    };
  }, []);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && step !== "PROCESSING") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, step, onClose]);

  const handleDownloadTemplate = async () => {
    try {
      setDownloadingTemplate(true);
      const blob = await downloadTemplate();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "documind_users_import_template.csv";
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch {
      setError("Failed to download template file. Please try again.");
    } finally {
      setDownloadingTemplate(false);
    }
  };

  const processFile = async (selectedFile: File) => {
    setError(null);

    // Validate size (50 MB)
    const maxSizeBytes = 50 * 1024 * 1024;
    if (selectedFile.size > maxSizeBytes) {
      setError("File size exceeds maximum limit of 50 MB.");
      return;
    }

    const name = selectedFile.name.toLowerCase();
    if (!name.endsWith(".csv") && !name.endsWith(".xlsx") && !name.endsWith(".xls")) {
      setError("Unsupported file format. Please upload a .csv or .xlsx spreadsheet.");
      return;
    }

    setFile(selectedFile);
    setIsUploading(true);
    setUploadProgress(0);

    try {
      const res = await uploadImportFile(selectedFile, (progress) => {
        setUploadProgress(progress);
      });

      if (res && res.data) {
        setPreview(res.data);
        setBatchId(res.data.batchId);
        
        // Auto-match headers if backend suggestedMapping is empty or partial
        const autoMapping: Record<string, string> = {};
        for (const col of res.data.columns || []) {
          const backendVal = res.data.suggestedMapping?.[col];
          if (backendVal && SYSTEM_FIELDS.some((f) => f.key === backendVal)) {
            autoMapping[col] = backendVal;
          } else {
            const lower = col.toLowerCase().trim();
            if (lower.includes("email") && !lower.includes("manager")) autoMapping[col] = "email";
            else if (lower === "first name" || lower === "firstname" || lower === "fname") autoMapping[col] = "firstName";
            else if (lower === "last name" || lower === "lastname" || lower === "lname") autoMapping[col] = "lastName";
            else if (lower.includes("full name") || lower === "name") autoMapping[col] = "fullName";
            else if (lower.includes("custom role")) autoMapping[col] = "customRole";
            else if (lower.includes("role")) autoMapping[col] = "role";
            else if (lower.includes("department") || lower === "dept") autoMapping[col] = "department";
            else if (lower.includes("title") || lower.includes("position")) autoMapping[col] = "jobTitle";
            else if (lower.includes("id")) autoMapping[col] = "employeeId";
            else if (lower.includes("phone") || lower.includes("mobile")) autoMapping[col] = "phone";
            else if (lower.includes("date")) autoMapping[col] = "hireDate";
            else if (lower.includes("manager")) autoMapping[col] = "managerEmail";
            else if (lower.includes("lang")) autoMapping[col] = "language";
          }
        }
        setColumnMapping(autoMapping);
        setStep("MAPPING");
      } else {
        setError("Invalid response received during file upload.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      setError(msg);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      void processFile(e.dataTransfer.files[0]);
    }
  };

  const handleMappingChange = (header: string, field: string) => {
    setColumnMapping((prev) => ({
      ...prev,
      [header]: field,
    }));
  };

  const handleConfirmMapping = async () => {
    if (!batchId || !preview) return;
    setError(null);
    setIsUpdatingMapping(true);

    try {
      // Update mapping first
      const updated = await updateMapping(batchId, columnMapping);
      if (updated && updated.data) {
        setPreview(updated.data);
      }

      // Confirm import with unique idempotency key
      setIsConfirming(true);
      setStep("PROCESSING");

      const idempotencyKey = `import_${batchId}_${typeof window !== "undefined" && window.crypto?.randomUUID ? window.crypto.randomUUID() : "key"}`;
      await confirmImport(batchId, idempotencyKey);

      // Start polling status
      startPollingBatchStatus(batchId);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to confirm mapping";
      setError(msg);
      setStep("MAPPING");
    } finally {
      setIsUpdatingMapping(false);
      setIsConfirming(false);
    }
  };

  const startPollingBatchStatus = (id: string) => {
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);

    const poll = async () => {
      try {
        const res = await getBatchWithRows(id);
        if (res && res.data) {
          setBatchDetail(res.data);
          const status = res.data.status;
          const isFinished =
            status === "COMPLETED" ||
            status === "PARTIALLY_COMPLETED" ||
            status === "FAILED" ||
            status === "CANCELLED";

          if (isFinished) {
            if (pollTimerRef.current) clearInterval(pollTimerRef.current);
            pollTimerRef.current = null;
            setStep("SUMMARY");
            if (onImportSuccess) {
              onImportSuccess();
            }
          }
        }
      } catch {
        // Silently retry on transient poll errors
      }
    };

    void poll();
    pollTimerRef.current = setInterval(poll, 1500);
  };

  const handleCancelImport = async () => {
    if (!batchId) return;
    try {
      await cancelBatch(batchId);
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
      onClose();
    } catch {
      setError("Failed to cancel import batch.");
    }
  };

  if (!isOpen) return null;

  const filteredRows =
    batchDetail?.rows?.filter((r) => {
      if (rowStateFilter === "ALL") return true;
      if (rowStateFilter === "VALID") return r.state === "VALID" || r.state === "CREATED" || r.state === "INVITED";
      if (rowStateFilter === "INVALID") return r.state === "INVALID" || r.state === "FAILED";
      if (rowStateFilter === "WARNING") return r.state === "WARNING" || r.state === "SKIPPED";
      return r.state === rowStateFilter;
    }) ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-outline-variant/30 bg-surface shadow-2xl transition-all"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bulk-import-title"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-outline-variant/30 px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined rounded-lg bg-primary/10 p-2 text-[22px] text-primary">
              group_add
            </span>
            <div>
              <h2 id="bulk-import-title" className="text-title-md font-bold text-on-surface">
                Bulk Import Employees
              </h2>
              <p className="text-body-xs text-on-surface-variant">
                Upload CSV or Excel spreadsheets to import users in bulk
              </p>
            </div>
          </div>

          {step !== "PROCESSING" && (
            <button
              onClick={onClose}
              className="rounded-full p-1.5 text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface"
              title="Close modal"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          )}
        </div>

        {/* Step Indicator */}
        <div className="flex items-center justify-between border-b border-outline-variant/20 bg-surface-container-low px-8 py-2.5 text-xs font-medium text-on-surface-variant">
          <div
            className={`flex items-center gap-2 ${
              step === "UPLOAD" ? "font-bold text-primary" : ""
            }`}
          >
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${
                step === "UPLOAD"
                  ? "bg-primary text-on-primary"
                  : "bg-surface-container-high text-on-surface-variant"
              }`}
            >
              1
            </span>
            Upload File
          </div>
          <span className="material-symbols-outlined text-[16px] opacity-40">
            chevron_right
          </span>
          <div
            className={`flex items-center gap-2 ${
              step === "MAPPING" ? "font-bold text-primary" : ""
            }`}
          >
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${
                step === "MAPPING"
                  ? "bg-primary text-on-primary"
                  : "bg-surface-container-high text-on-surface-variant"
              }`}
            >
              2
            </span>
            Map Columns
          </div>
          <span className="material-symbols-outlined text-[16px] opacity-40">
            chevron_right
          </span>
          <div
            className={`flex items-center gap-2 ${
              step === "PROCESSING" ? "font-bold text-primary" : ""
            }`}
          >
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${
                step === "PROCESSING"
                  ? "bg-primary text-on-primary"
                  : "bg-surface-container-high text-on-surface-variant"
              }`}
            >
              3
            </span>
            Processing
          </div>
          <span className="material-symbols-outlined text-[16px] opacity-40">
            chevron_right
          </span>
          <div
            className={`flex items-center gap-2 ${
              step === "SUMMARY" ? "font-bold text-primary" : ""
            }`}
          >
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${
                step === "SUMMARY"
                  ? "bg-primary text-on-primary"
                  : "bg-surface-container-high text-on-surface-variant"
              }`}
            >
              4
            </span>
            Summary & Log
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 flex items-start gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3.5 text-xs text-rose-600 dark:text-rose-400">
              <span className="material-symbols-outlined text-[18px] shrink-0">
                error
              </span>
              <div className="flex-1">{error}</div>
              <button
                onClick={() => setError(null)}
                className="text-rose-500 hover:text-rose-700"
              >
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            </div>
          )}

          {/* STEP 1: UPLOAD */}
          {step === "UPLOAD" && (
            <div className="flex flex-col items-center gap-6">
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`flex w-full cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-10 text-center transition-all ${
                  dragActive
                    ? "border-primary bg-primary/5 scale-[1.01]"
                    : "border-outline-variant/40 bg-surface-container-low hover:border-primary/60 hover:bg-surface-container"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      void processFile(e.target.files[0]);
                    }
                  }}
                />
                <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <span className="material-symbols-outlined text-[32px]">
                    cloud_upload
                  </span>
                </div>
                <h3 className="text-body-md font-bold text-on-surface">
                  Drag and drop your spreadsheet here
                </h3>
                <p className="mt-1 text-body-xs text-on-surface-variant">
                  Supports CSV or Excel files (.xlsx, .xls) up to 50 MB
                </p>
                <button
                  type="button"
                  className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-label-sm font-bold text-on-primary shadow-sm hover:bg-primary/90"
                >
                  Browse Computer
                </button>
              </div>

              {isUploading && (
                <div className="w-full space-y-2">
                  <div className="flex justify-between text-body-xs font-medium text-on-surface">
                    <span>Uploading {file?.name}...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-surface-container-high">
                    <div
                      className="h-full bg-primary transition-all duration-200"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="flex w-full items-center justify-between rounded-xl border border-outline-variant/30 bg-surface-container-low p-4 text-body-xs">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-[20px] text-primary">
                    description
                  </span>
                  <div>
                    <span className="font-semibold text-on-surface">
                      Need a sample CSV format?
                    </span>
                    <p className="text-on-surface-variant">
                      Download our pre-formatted employee import template.
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleDownloadTemplate}
                  disabled={downloadingTemplate}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-outline-variant px-3 py-1.5 text-label-xs font-bold text-on-surface hover:bg-surface-container-high disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[16px]">
                    download
                  </span>
                  {downloadingTemplate ? "Downloading..." : "Download Template"}
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: MAPPING */}
          {step === "MAPPING" && preview && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-body-md font-bold text-on-surface">
                    Map Columns & Preview Rows
                  </h3>
                  <p className="text-body-xs text-on-surface-variant">
                    Match file headers to system fields ({preview.totalRows} total rows found)
                  </p>
                </div>
                <button
                  onClick={() => setStep("UPLOAD")}
                  className="text-label-xs font-bold text-primary hover:underline"
                >
                  Change File
                </button>
              </div>

              {preview.quotaImpact?.wouldExceed && (
                <div className="flex items-start gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3.5 text-xs text-rose-600 dark:text-rose-400">
                  <span className="material-symbols-outlined text-[18px] shrink-0">
                    warning
                  </span>
                  <div className="flex-1">
                    <span className="font-bold">Quota Limit Warning:</span> Importing these employees would exceed your active employee seat limit ({preview.quotaImpact.currentUsers}/{preview.quotaImpact.planLimit} seats used).
                  </div>
                </div>
              )}

              {((preview.summary.invalidRows ?? preview.summary.invalid ?? 0) > 0) && (
                <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-700 dark:text-amber-300">
                  <span className="material-symbols-outlined text-[18px] shrink-0">
                    info
                  </span>
                  <div className="flex-1">
                    <span className="font-bold">{preview.summary.invalidRows ?? preview.summary.invalid ?? 0} Invalid Row(s):</span> Rows with errors (e.g. invalid email format or missing names) will be skipped during processing.
                  </div>
                </div>
              )}

              {/* Column Mapping Grid */}
              <div className="rounded-xl border border-outline-variant/30 bg-surface-container-low p-4">
                <h4 className="mb-3 text-label-sm font-bold text-on-surface">
                  Header Mappings
                </h4>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {preview.columns.map((header) => (
                    <div
                      key={header}
                      className="flex flex-col gap-2 rounded-xl border border-outline-variant/30 bg-surface p-3 text-body-xs shadow-2xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-mono font-bold text-on-surface" title={header}>
                          {`"${header}"`}
                        </span>
                        <span className="shrink-0 rounded-md bg-surface-container-high px-2 py-0.5 text-[10px] font-semibold text-on-surface-variant">
                          CSV Column
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-[16px] text-primary shrink-0">
                          east
                        </span>
                        <select
                          value={columnMapping[header] || ""}
                          onChange={(e) => handleMappingChange(header, e.target.value)}
                          className="w-full rounded-lg border border-outline-variant/50 bg-surface px-2.5 py-1.5 text-body-xs font-medium text-on-surface focus:border-primary focus:outline-hidden"
                        >
                          <option value="">-- Skip Column --</option>
                          {SYSTEM_FIELDS.map((field) => (
                            <option key={field.key} value={field.key}>
                              {field.label} {field.required ? "*" : ""}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Preview Table */}
              <div>
                <h4 className="mb-2 text-label-sm font-bold text-on-surface">
                  Row Validation Preview (First 5 Rows)
                </h4>
                <div className="max-w-full overflow-x-auto rounded-xl border border-outline-variant/30">
                  <table className="w-full text-start text-body-xs">
                    <thead className="bg-surface-container-low font-semibold text-on-surface-variant">
                      <tr>
                        <th className="px-3 py-2 text-start">Row #</th>
                        <th className="px-3 py-2 text-start">Status</th>
                        <th className="px-3 py-2 text-start">Preview Data</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/20">
                      {preview.rows.slice(0, 5).map((row) => (
                        <tr key={row.rowNumber}>
                          <td className="px-3 py-2 font-mono">{row.rowNumber}</td>
                          <td className="px-3 py-2">
                            <span
                              className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-bold ${
                                STATE_BADGE_STYLES[row.state]
                              }`}
                            >
                              {row.state}
                            </span>
                          </td>
                          <td className="px-3 py-2 font-mono text-on-surface-variant">
                            {Object.entries(row.data)
                              .map(([k, v]) => `${k}: ${v}`)
                              .join(" | ")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-outline-variant px-4 py-2 text-label-sm font-bold text-on-surface hover:bg-surface-container-high"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmMapping}
                  disabled={isUpdatingMapping || isConfirming}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-label-sm font-bold text-on-primary shadow-sm hover:bg-primary/90 disabled:opacity-50"
                >
                  {isUpdatingMapping || isConfirming ? (
                    <>
                      <span className="material-symbols-outlined text-[18px] animate-spin">
                        progress_activity
                      </span>
                      Confirming...
                    </>
                  ) : (
                    <>
                      Confirm & Start Import
                      <span className="material-symbols-outlined text-[18px]">
                        arrow_forward
                      </span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: PROCESSING */}
          {step === "PROCESSING" && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
                <span className="material-symbols-outlined text-[36px] animate-spin">
                  progress_activity
                </span>
              </div>
              <h3 className="text-title-md font-bold text-on-surface">
                Processing Employee Import...
              </h3>
              <p className="mt-1 max-w-md text-body-xs text-on-surface-variant">
                Validating email credentials, hashing invites, and persisting user records.
              </p>

              {batchDetail && (
                <div className="mt-6 w-full max-w-md space-y-2">
                  <div className="flex justify-between text-body-xs font-semibold text-on-surface">
                    <span>Status: {batchDetail.status}</span>
                    <span>
                      {batchDetail.summary?.createdCount ?? 0} /{" "}
                      {batchDetail.summary?.totalRows ?? 0} Processed
                    </span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-container-high">
                    <div
                      className="h-full bg-primary transition-all duration-300"
                      style={{
                        width: `${
                          batchDetail.summary?.totalRows
                            ? Math.round(
                                ((batchDetail.summary?.createdCount +
                                  batchDetail.summary?.failedCount) /
                                  batchDetail.summary?.totalRows) *
                                  100,
                              )
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={handleCancelImport}
                className="mt-8 rounded-lg border border-rose-500/40 px-4 py-1.5 text-label-xs font-bold text-rose-600 hover:bg-rose-500/10 dark:text-rose-400"
              >
                Cancel Batch
              </button>
            </div>
          )}

          {/* STEP 4: SUMMARY & ERROR LOG TABLE */}
          {step === "SUMMARY" && batchDetail && (
            <div className="space-y-6">
              {/* Summary Stats Cards */}
              <div className="grid grid-cols-3 gap-4">
                <div className="rounded-xl border border-outline-variant/30 bg-surface-container-low p-4 text-center">
                  <span className="text-body-xs text-on-surface-variant">Total Rows</span>
                  <div className="text-title-md font-bold text-on-surface">
                    {batchDetail.summary?.totalRows ?? 0}
                  </div>
                </div>
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-center">
                  <span className="text-body-xs text-emerald-600 dark:text-emerald-400">
                    Successfully Created
                  </span>
                  <div className="text-title-md font-bold text-emerald-600 dark:text-emerald-400">
                    {batchDetail.summary?.createdCount ?? 0}
                  </div>
                </div>
                <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-center">
                  <span className="text-body-xs text-rose-600 dark:text-rose-400">
                    Failed / Invalid
                  </span>
                  <div className="text-title-md font-bold text-rose-600 dark:text-rose-400">
                    {batchDetail.summary?.failedCount ?? 0}
                  </div>
                </div>
              </div>

              {/* Row Error Log Section */}
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <h4 className="text-label-sm font-bold text-on-surface">
                    Row Execution Details
                  </h4>
                  <div className="flex items-center gap-1 rounded-lg border border-outline-variant/30 bg-surface-container-low p-1 text-label-xs">
                    {(["ALL", "INVALID", "WARNING", "VALID"] as const).map((st) => (
                      <button
                        key={st}
                        onClick={() => setRowStateFilter(st)}
                        className={`rounded-md px-2 py-0.5 transition-colors ${
                          rowStateFilter === st
                            ? "bg-primary text-on-primary font-bold"
                            : "text-on-surface-variant hover:text-on-surface"
                        }`}
                      >
                        {st}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="max-h-60 overflow-y-auto rounded-xl border border-outline-variant/30">
                  <table className="w-full text-start text-body-xs">
                    <thead className="sticky top-0 bg-surface-container-low font-semibold text-on-surface-variant">
                      <tr>
                        <th className="px-3 py-2 text-start">Row #</th>
                        <th className="px-3 py-2 text-start">Status</th>
                        <th className="px-3 py-2 text-start">Data</th>
                        <th className="px-3 py-2 text-start">Errors / Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/20">
                      {filteredRows.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="py-6 text-center text-on-surface-variant">
                            No rows match the selected filter.
                          </td>
                        </tr>
                      ) : (
                        filteredRows.map((row) => (
                          <tr key={row.rowNumber}>
                            <td className="px-3 py-2 font-mono font-bold">{row.rowNumber}</td>
                            <td className="px-3 py-2">
                              <span
                                className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-bold ${
                                  STATE_BADGE_STYLES[row.state]
                                }`}
                              >
                                {row.state}
                              </span>
                            </td>
                            <td className="px-3 py-2 font-mono text-on-surface-variant">
                              {row.data.email || row.data.fullName || JSON.stringify(row.data)}
                            </td>
                            <td className="px-3 py-2 text-rose-600 dark:text-rose-400">
                              {row.errors?.join(", ") || (row.state !== "CREATED" && row.state !== "INVITED" ? row.errorMessage : null) || row.warnings?.join(", ") || "OK"}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setStep("UPLOAD")}
                  className="rounded-lg border border-outline-variant px-4 py-2 text-label-sm font-bold text-on-surface hover:bg-surface-container-high"
                >
                  Import Another File
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg bg-primary px-6 py-2 text-label-sm font-bold text-on-primary shadow-sm hover:bg-primary/90"
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
