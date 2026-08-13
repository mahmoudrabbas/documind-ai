"use client";

import { useRef, useState, type DragEvent } from "react";
import { cn } from "@/lib/utils";
import { getFileSizeParts } from "@/lib/validation";
import { useI18n } from "@/providers/i18n-provider";

export interface FileDropzoneProps {
  onFilesSelected: (files: File[]) => void;
  accept?: string;
  disabled?: boolean;
  error?: string | null;
  /* Each label falls back to its translation for the active locale when
     the prop is not supplied. */
  dragDropText?: string;
  dragDropActiveText?: string;
  browseText?: string;
  fileRequirementsText?: string;
  selectedFileLabel?: string;
}

export function FileDropzone({
  onFilesSelected,
  accept = ".pdf,.docx,.txt",
  disabled = false,
  error = null,
  dragDropText,
  dragDropActiveText,
  browseText,
  fileRequirementsText,
  selectedFileLabel,
}: FileDropzoneProps) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (!disabled) setIsDragOver(true);
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setIsDragOver(false);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setIsDragOver(false);

    if (disabled) return;

    const files = Array.from(event.dataTransfer.files);
    if (files.length > 0) {
      setSelectedFile(files[0]);
      onFilesSelected(files);
    }
  }

  function handleFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (files.length > 0) {
      setSelectedFile(files[0]);
      onFilesSelected(files);
    }
  }

  function handleClick() {
    if (!disabled) {
      inputRef.current?.click();
    }
  }

  return (
    <div className="w-full">
      <div
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") handleClick();
        }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        aria-disabled={disabled}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-4 transition-colors sm:p-6",
          isDragOver
            ? "border-blue-500 bg-blue-50"
            : "border-slate-300 bg-slate-50 hover:border-slate-400",
          disabled && "cursor-not-allowed opacity-50",
          error && "border-red-400 bg-red-50",
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          onChange={handleFileSelect}
          className="hidden"
          disabled={disabled}
        />

        {selectedFile ? (
          <div className="flex flex-col items-center gap-2 text-center">
            <span className="text-3xl" aria-hidden="true">
              📄
            </span>
            <p className="text-sm font-medium text-slate-900">
              {selectedFileLabel ?? t("shell.selectedFile")}: {selectedFile.name}
            </p>
            <p className="text-xs text-slate-500">
              {(() => {
                const { value, unitKey } = getFileSizeParts(selectedFile.size);
                return `${value} ${t(unitKey)}`;
              })()}
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-center">
            <span className="text-3xl text-slate-400" aria-hidden="true">
              📁
            </span>
            <p className="text-sm text-slate-600">
              {isDragOver
                ? (dragDropActiveText ?? t("shell.dropFileHere"))
                : (dragDropText ?? t("shell.dragAndDropFile"))}{" "}
              <span className="font-semibold text-blue-600">
                {browseText ?? t("shell.browseFiles")}
              </span>
            </p>
            <p className="text-xs text-slate-400">
              {fileRequirementsText ?? t("shell.fileRequirements")}
            </p>
          </div>
        )}
      </div>

      {error ? (
        <p className="mt-2 text-xs text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
