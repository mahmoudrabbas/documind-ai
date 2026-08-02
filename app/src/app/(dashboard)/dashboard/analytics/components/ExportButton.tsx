"use client";

import React, { useState } from "react";
import { triggerAnalyticsExport, getAnalyticsExportStatus } from "@/services/analytics.service";

interface ExportButtonProps {
  filters?: Record<string, string>;
}

export function ExportButton({ filters }: ExportButtonProps) {
  const [exporting, setExporting] = useState(false);
  const [format, setFormat] = useState<"csv" | "xlsx">("csv");

  const handleExport = async () => {
    try {
      setExporting(true);
      const res = await triggerAnalyticsExport(format, filters);
      const jobId = res.data._id || (res.data as unknown as Record<string, string>).id;

      let attempts = 0;
      const interval = setInterval(async () => {
        attempts++;
        if (attempts > 10) {
          clearInterval(interval);
          setExporting(false);
          alert("Export timed out. Please check back shortly.");
          return;
        }

        try {
          const statusRes = await getAnalyticsExportStatus(jobId);
          if (statusRes.data.status === "completed" && statusRes.data.filePath) {
            clearInterval(interval);
            setExporting(false);

            // Convert base64 data URI to Blob for universal browser download support
            const dataUri = statusRes.data.filePath;
            const mimeType = dataUri.split(";")[0].replace("data:", "");
            const base64Data = dataUri.split(",")[1];
            const binaryStr = window.atob(base64Data);
            const len = binaryStr.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
              bytes[i] = binaryStr.charCodeAt(i);
            }
            const blob = new Blob([bytes], { type: mimeType });
            const blobUrl = URL.createObjectURL(blob);

            const link = document.createElement("a");
            link.href = blobUrl;
            link.setAttribute("download", `analytics-export-${new Date().toISOString().split("T")[0]}.${format}`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
          } else if (statusRes.data.status === "failed") {
            clearInterval(interval);
            setExporting(false);
            alert(`Export failed: ${statusRes.data.error || "Unknown error"}`);
          }
        } catch {
          // Keep polling
        }
      }, 1000);
    } catch (err: unknown) {
      setExporting(false);
      alert(`Failed to start export: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <select
        value={format}
        onChange={(e) => setFormat(e.target.value as "csv" | "xlsx")}
        disabled={exporting}
        className="rounded-xl border border-outline-variant/40 bg-surface px-3 py-1.5 text-body-sm text-on-surface focus:border-primary focus:outline-none"
      >
        <option value="csv">CSV (.csv)</option>
        <option value="xlsx">Excel (.xlsx)</option>
      </select>

      <button
        type="button"
        onClick={handleExport}
        disabled={exporting}
        className="inline-flex items-center rounded-xl bg-primary px-4 py-2 text-label-md font-bold text-on-primary hover:opacity-90 disabled:opacity-50 transition-opacity shadow-sm"
      >
        {exporting ? "Exporting..." : "Export Data"}
      </button>
    </div>
  );
}
