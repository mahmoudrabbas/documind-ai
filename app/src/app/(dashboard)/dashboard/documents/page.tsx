"use client";

import { useState } from "react";
import { useI18n } from "@/providers/i18n-provider";
import { useDocuments } from "@/hooks/features/useDocuments";
import { FileDropzone } from "@/components/ui/FileDropzone";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  validateDocumentTitle,
  validateFileType,
  validateFileSize,
  getFileSizeLabel,
} from "@/lib/validation";

const STATUS_BADGE_MAP: Record<string, string> = {
  uploaded: "info",
  uploading: "warning",
  processing: "warning",
  processed: "success",
  failed: "error",
};

export default function DocumentsPage() {
  const { t, dir } = useI18n();
  const {
    documents,
    isLoading,
    error,
    page,
    totalPages,
    uploadProgress,
    isUploading,
    uploadError,
    upload,
    remove,
    goToPage,
  } = useDocuments();

  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function resetForm() {
    setSelectedFiles([]);
    setTitle("");
    setDescription("");
    setTags("");
    setFileError(null);
    setTitleError(null);
  }

  function handleFilesSelected(files: File[]) {
    const file = files[0];
    if (!file) return;

    setFileError(null);

    const typeErr = validateFileType(file);
    if (typeErr) {
      setFileError(t(typeErr));
      return;
    }

    const sizeErr = validateFileSize(file);
    if (sizeErr) {
      setFileError(t(sizeErr));
      return;
    }

    setSelectedFiles([file]);
  }

  async function handleUpload() {
    const file = selectedFiles[0];
    if (!file) {
      setFileError(t("documents.fileRequired"));
      return;
    }

    setTitleError(null);
    const titleErr = validateDocumentTitle(title);
    if (titleErr) {
      setTitleError(t(titleErr));
      return;
    }

    const tagsArray = tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    await upload(file, {
      title: title.trim(),
      description: description.trim(),
      tags: tagsArray.join(","),
    });

    if (!uploadError) {
      resetForm();
    }
  }

  return (
    <main dir={dir} className="p-lg max-w-[1600px] mx-auto w-full flex-1">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4 mb-xl mt-6">
        <div>
          <h1 className="text-headline-lg font-bold text-primary">
            {t("documents.title")}
          </h1>
          <p className="mt-2 text-body-md text-on-surface-variant">
            {t("documents.subtitle")}
          </p>
        </div>
      </div>

      <div className="bg-surface-container-lowest p-lg rounded-3xl shadow-sm border border-outline-variant/30 mb-xl max-w-2xl">
        <h2 className="mb-6 text-title-lg font-bold text-primary">
          {t("documents.upload")}
        </h2>

          <FileDropzone
            onFilesSelected={handleFilesSelected}
            disabled={isUploading}
            error={fileError}
            dragDropText={t("documents.dragDropText")}
            dragDropActiveText={t("documents.dragDropActive")}
            browseText={t("documents.browseFiles")}
            fileRequirementsText={t("documents.fileRequirements")}
          />

          {selectedFiles.length > 0 && !isUploading ? (
            <div className="mt-8 space-y-6">
              <div>
                <label
                  htmlFor="doc-title"
                  className="block text-label-md font-bold text-on-surface-variant mb-2"
                >
                  {t("documents.metadataTitle")}
                </label>
                <input
                  id="doc-title"
                  type="text"
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    setTitleError(null);
                  }}
                  placeholder={t("documents.metadataTitlePlaceholder")}
                  aria-invalid={Boolean(titleError)}
                  className="w-full rounded-lg border border-outline-variant bg-surface px-md py-sm transition-all outline-none focus:border-transparent focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
                />
                {titleError ? (
                  <p className="mt-1 text-xs text-error">{titleError}</p>
                ) : null}
              </div>

              <div>
                <label
                  htmlFor="doc-description"
                  className="block text-label-md font-bold text-on-surface-variant mb-2"
                >
                  {t("documents.metadataDescription")}
                </label>
                <textarea
                  id="doc-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t("documents.metadataDescriptionPlaceholder")}
                  rows={2}
                  className="w-full rounded-lg border border-outline-variant bg-surface px-md py-sm transition-all outline-none focus:border-transparent focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
                />
              </div>

              <div>
                <label
                  htmlFor="doc-tags"
                  className="block text-label-md font-bold text-on-surface-variant mb-2"
                >
                  {t("documents.metadataTags")}
                </label>
                <input
                  id="doc-tags"
                  type="text"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder={t("documents.metadataTagsPlaceholder")}
                  className="w-full rounded-lg border border-outline-variant bg-surface px-md py-sm transition-all outline-none focus:border-transparent focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
                />
                <p className="mt-1 text-xs text-outline">
                  {t("documents.metadataTagsHint")}
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                <Button onClick={handleUpload}>
                  {t("documents.upload")}
                </Button>
                <Button variant="ghost" onClick={resetForm}>
                  {t("common.cancel")}
                </Button>
              </div>
            </div>
          ) : null}

          {isUploading && uploadProgress !== null ? (
            <div className="mt-8">
              <ProgressBar
                value={uploadProgress}
                label={t("documents.uploading")}
                size="md"
              />
            </div>
          ) : null}

          {uploadError ? (
            <p className="mt-4 text-sm text-error bg-error-container text-on-error-container p-3 rounded-xl border border-error/20" role="alert">
              {uploadError}
            </p>
          ) : null}
        </div>

        {/* Document List */}
        <div className="rounded-3xl border border-outline-variant/30 bg-surface-container-lowest shadow-sm overflow-hidden">
          <div className="border-b border-outline-variant/30 px-lg py-md bg-surface-container-low/50">
            <h2 className="text-title-lg font-bold text-primary">
              {t("nav.documents")}
            </h2>
          </div>

          {error ? (
            <div className="p-12 text-center">
              <p className="text-sm text-error mb-4">{t(error)}</p>
              <Button
                variant="outline"
                onClick={() => goToPage(page)}
              >
                {t("common.retry")}
              </Button>
            </div>
          ) : null}

          {isLoading ? (
            <div className="space-y-4 p-8">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-xl bg-surface-container" />
              ))}
            </div>
          ) : null}

          {!isLoading && !error && documents.length === 0 ? (
            <div className="p-16 text-center">
              <div className="w-16 h-16 bg-surface-container-low rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="material-symbols-outlined text-outline text-[32px]">folder_off</span>
              </div>
              <p className="text-title-md font-bold text-on-surface mb-2">{t("documents.noDocuments")}</p>
              <p className="text-body-sm text-on-surface-variant max-w-sm mx-auto">
                {t("documents.noDocumentsHint")}
              </p>
            </div>
          ) : null}

          {!isLoading && !error && documents.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead className="bg-surface-container-low border-b border-outline-variant/30">
                  <tr>
                    <th className="px-lg py-4 font-bold text-on-surface-variant text-label-sm uppercase tracking-wider">
                      {t("documents.tableName")}
                    </th>
                    <th className="px-lg py-4 font-bold text-on-surface-variant text-label-sm uppercase tracking-wider">
                      {t("documents.tableSize")}
                    </th>
                    <th className="px-lg py-4 font-bold text-on-surface-variant text-label-sm uppercase tracking-wider">
                      {t("documents.tableType")}
                    </th>
                    <th className="px-lg py-4 font-bold text-on-surface-variant text-label-sm uppercase tracking-wider">
                      {t("documents.tableStatus")}
                    </th>
                    <th className="px-lg py-4 font-bold text-on-surface-variant text-label-sm uppercase tracking-wider">
                      {t("documents.tableDate")}
                    </th>
                    <th className="px-lg py-4 font-bold text-on-surface-variant text-label-sm uppercase tracking-wider text-right">
                      {t("documents.tableActions")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/30 bg-surface-container-lowest">
                  {documents.map((doc) => (
                    <tr
                      key={doc.id}
                      className="transition-colors hover:bg-surface-container-low/50 group cursor-default"
                    >
                      <td className="max-w-xs truncate px-lg py-4 font-bold text-on-surface">
                        <div className="flex items-center gap-3">
                          <span className="material-symbols-outlined text-secondary" style={{ fontVariationSettings: "'FILL' 1" }}>
                            description
                          </span>
                          <span className="truncate">{doc.metadata.title || doc.fileName}</span>
                        </div>
                      </td>
                      <td className="px-lg py-4 text-on-surface-variant text-body-sm">
                        {getFileSizeLabel(doc.fileSize)}
                      </td>
                      <td className="px-lg py-4">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-bold bg-surface-container text-on-surface-variant uppercase tracking-wider border border-outline-variant/30">
                          {doc.mimeType.split("/").pop() ?? "-"}
                        </span>
                      </td>
                      <td className="px-lg py-4">
                        <Badge
                          status={
                            STATUS_BADGE_MAP[doc.status] as
                              | "success"
                              | "info"
                              | "warning"
                              | "error"
                              | undefined
                          }
                        >
                          {t(
                            `documents.status${doc.status.charAt(0).toUpperCase() + doc.status.slice(1)}`,
                          )}
                        </Badge>
                      </td>
                      <td className="px-lg py-4 text-on-surface-variant text-body-sm whitespace-nowrap">
                        {new Date(doc.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-lg py-4 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-error hover:bg-error-container hover:text-on-error-container"
                          isLoading={deletingId === doc.id}
                          onClick={async () => {
                            setDeletingId(doc.id);
                            await remove(doc.id);
                            setDeletingId(null);
                          }}
                        >
                          <span className="material-symbols-outlined text-[20px]">delete</span>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {/* Pagination */}
          {totalPages > 1 ? (
            <div className="flex items-center justify-between border-t border-outline-variant/30 px-lg py-md bg-surface-container-lowest">
              <p className="text-label-sm font-medium text-on-surface-variant bg-surface-container-low px-3 py-1 rounded-full">
                {t("common.page")} {page} / {totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="border-outline-variant text-on-surface hover:bg-surface-container-low"
                  disabled={page <= 1}
                  onClick={() => goToPage(page - 1)}
                >
                  <span className="material-symbols-outlined text-[18px] mr-1">chevron_left</span>
                  {t("common.back")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-outline-variant text-on-surface hover:bg-surface-container-low"
                  disabled={page >= totalPages}
                  onClick={() => goToPage(page + 1)}
                >
                  {t("common.next")}
                  <span className="material-symbols-outlined text-[18px] ml-1">chevron_right</span>
                </Button>
              </div>
            </div>
          ) : null}
        </div>
    </main>
  );
}
