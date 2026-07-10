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
    <main dir={dir} className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {t("documents.title")}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {t("documents.subtitle")}
          </p>
        </div>

        {/* Upload Section */}
        <div className="mb-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">
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
            <div className="mt-6 space-y-4">
              <div>
                <label
                  htmlFor="doc-title"
                  className="block text-sm font-medium text-slate-700"
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
                  className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20"
                />
                {titleError ? (
                  <p className="mt-1 text-xs text-red-600">{titleError}</p>
                ) : null}
              </div>

              <div>
                <label
                  htmlFor="doc-description"
                  className="block text-sm font-medium text-slate-700"
                >
                  {t("documents.metadataDescription")}
                </label>
                <textarea
                  id="doc-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t("documents.metadataDescriptionPlaceholder")}
                  rows={2}
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <div>
                <label
                  htmlFor="doc-tags"
                  className="block text-sm font-medium text-slate-700"
                >
                  {t("documents.metadataTags")}
                </label>
                <input
                  id="doc-tags"
                  type="text"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder={t("documents.metadataTagsPlaceholder")}
                  className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20"
                />
                <p className="mt-1 text-xs text-slate-400">
                  {t("documents.metadataTagsHint")}
                </p>
              </div>

              <div className="flex gap-3">
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
            <div className="mt-6">
              <ProgressBar
                value={uploadProgress}
                label={t("documents.uploading")}
                size="md"
              />
            </div>
          ) : null}

          {uploadError ? (
            <p className="mt-3 text-sm text-red-600" role="alert">
              {uploadError}
            </p>
          ) : null}
        </div>

        {/* Document List */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-6 py-4">
            <h2 className="text-lg font-semibold text-slate-900">
              {t("nav.documents")}
            </h2>
          </div>

          {error ? (
            <div className="p-6 text-center">
              <p className="text-sm text-red-600">{t(error)}</p>
              <Button
                variant="ghost"
                className="mt-2"
                onClick={() => goToPage(page)}
              >
                {t("common.retry")}
              </Button>
            </div>
          ) : null}

          {isLoading ? (
            <div className="space-y-3 p-6">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-lg" />
              ))}
            </div>
          ) : null}

          {!isLoading && !error && documents.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-slate-500">{t("documents.noDocuments")}</p>
              <p className="mt-1 text-sm text-slate-400">
                {t("documents.noDocumentsHint")}
              </p>
            </div>
          ) : null}

          {!isLoading && !error && documents.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs uppercase tracking-wider text-slate-500">
                    <th className="px-6 py-3 font-medium">
                      {t("documents.tableName")}
                    </th>
                    <th className="px-6 py-3 font-medium">
                      {t("documents.tableSize")}
                    </th>
                    <th className="px-6 py-3 font-medium">
                      {t("documents.tableType")}
                    </th>
                    <th className="px-6 py-3 font-medium">
                      {t("documents.tableStatus")}
                    </th>
                    <th className="px-6 py-3 font-medium">
                      {t("documents.tableDate")}
                    </th>
                    <th className="px-6 py-3 font-medium">
                      {t("documents.tableActions")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {documents.map((doc) => (
                    <tr
                      key={doc.id}
                      className="transition-colors hover:bg-slate-50"
                    >
                      <td className="max-w-xs truncate px-6 py-4 font-medium text-slate-900">
                        {doc.metadata.title || doc.fileName}
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        {getFileSizeLabel(doc.fileSize)}
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        {doc.mimeType.split("/").pop()?.toUpperCase() ?? "-"}
                      </td>
                      <td className="px-6 py-4">
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
                      <td className="px-6 py-4 text-slate-600">
                        {new Date(doc.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4">
                        <Button
                          variant="ghost"
                          size="sm"
                          isLoading={deletingId === doc.id}
                          onClick={async () => {
                            setDeletingId(doc.id);
                            await remove(doc.id);
                            setDeletingId(null);
                          }}
                        >
                          {t("common.delete")}
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
            <div className="flex items-center justify-between border-t border-slate-200 px-6 py-4">
              <p className="text-sm text-slate-600">
                {t("common.page")} {page} / {totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => goToPage(page - 1)}
                >
                  {t("common.back")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => goToPage(page + 1)}
                >
                  {t("common.next")}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
