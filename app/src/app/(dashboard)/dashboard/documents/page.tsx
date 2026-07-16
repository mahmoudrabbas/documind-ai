"use client";

import { useState } from "react";
import { useI18n } from "@/providers/i18n-provider";
import { useAuth } from "@/providers/auth-provider";
import { useDocuments } from "@/hooks/features/useDocuments";
import { FileDropzone } from "@/components/ui/FileDropzone";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  DashboardPage,
  DashboardPageHeader,
  DashboardPanel,
} from "@/components/ui/DashboardPage";
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
  const auth = useAuth();
  const isCompanyAdmin = auth.status === "authenticated" && auth.user.role === "COMPANY_ADMIN";
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
    <DashboardPage dir={dir}>
      <DashboardPageHeader
        eyebrow={
          <div className="inline-flex w-fit items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-primary">
            <span className="material-symbols-outlined text-[16px]">
              folder
            </span>
            Knowledge base
          </div>
        }
        title={t("documents.title")}
        description={t("documents.subtitle")}
        actions={
          <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest px-4 py-3 text-sm shadow-sm">
            <p className="font-semibold text-on-surface">Upload and organize</p>
            <p className="mt-1 max-w-xs text-on-surface-variant">
              Keep your documents structured so answers stay accurate and
              searchable.
            </p>
          </div>
        }
      />

      {isCompanyAdmin ? (
        <div className="mb-6 grid auto-rows-auto items-start gap-3 sm:gap-4 xl:grid-cols-[1.05fr_0.95fr] xl:gap-5">
          <DashboardPanel>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="text-title-lg font-bold text-primary">
                  {t("documents.upload")}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-on-surface-variant">
                  Add a file, enrich it with metadata, and let the system prepare
                  it for retrieval.
                </p>
              </div>
              <div className="shrink-0 rounded-full bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
                New upload
              </div>
            </div>

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
              <div className="mt-4 space-y-4 rounded-2xl border border-outline-variant/30 bg-surface-container p-4">
                <div>
                  <label
                    htmlFor="doc-title"
                    className="mb-2 block text-label-md font-bold text-on-surface-variant"
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
                    className="mb-2 block text-label-md font-bold text-on-surface-variant"
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
                    className="mb-2 block text-label-md font-bold text-on-surface-variant"
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

                <div className="flex flex-wrap gap-3 pt-2">
                  <Button onClick={handleUpload}>{t("documents.upload")}</Button>
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
              <p
                className="mt-4 rounded-xl border border-error/20 bg-error-container p-3 text-sm text-on-error-container"
                role="alert"
              >
                {uploadError}
              </p>
            ) : null}
          </DashboardPanel>

          <DashboardPanel className="group relative overflow-hidden bg-gradient-to-br from-surface-container via-surface-container-low to-surface-container-lowest transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-lg">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-secondary/10" />
            <div className="relative flex min-w-0 flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0 max-w-2xl">
                <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-primary">
                  <span className="material-symbols-outlined text-[16px]">
                    auto_awesome
                  </span>
                  AI-assisted prep
                </div>
                <h3 className="mt-4 text-title-md font-bold text-primary">
                  Turn uploads into sharper answers
                </h3>
                <p className="mt-3 max-w-xl text-sm leading-relaxed text-on-surface-variant">
                  Strong titles, clear descriptions, and thoughtful tags help the
                  retrieval layer surface the right context faster.
                </p>

                <div className="mt-5 flex flex-wrap gap-2">
                  <span className="rounded-full border border-outline-variant/40 bg-surface/70 px-3 py-1 text-xs font-medium text-on-surface-variant">
                    Better retrieval
                  </span>
                  <span className="rounded-full border border-outline-variant/40 bg-surface/70 px-3 py-1 text-xs font-medium text-on-surface-variant">
                    Cleaner context
                  </span>
                  <span className="rounded-full border border-outline-variant/40 bg-surface/70 px-3 py-1 text-xs font-medium text-on-surface-variant">
                    Faster answers
                  </span>
                </div>
              </div>

              <div className="w-full rounded-2xl border border-outline-variant/40 bg-surface/80 p-4 shadow-sm backdrop-blur lg:max-w-[280px]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-label-sm font-semibold uppercase tracking-[0.2em] text-on-surface-variant">
                      Next step
                    </p>
                    <p className="mt-1 text-title-sm font-semibold text-on-surface">
                      Preview suggestions
                    </p>
                  </div>
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <span className="material-symbols-outlined text-[22px]">
                      bolt
                    </span>
                  </div>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-on-surface-variant">
                  A thoughtful upload makes downstream AI answers more reliable
                  and easier to trust.
                </p>
                <div className="mt-4 flex items-center justify-between rounded-xl border border-outline-variant/30 bg-surface-container-low px-3 py-2 text-sm text-on-surface">
                  <span>Ready to refine</span>
                  <span className="text-primary">↗</span>
                </div>
              </div>
            </div>
          </DashboardPanel>
        </div>
      ) : null}

      <DashboardPanel padding="none">
        <div className="border-b border-outline-variant/30 bg-surface-container-low/50 px-lg py-md">
          <h2 className="text-title-lg font-bold text-primary">
            {t("nav.documents")}
          </h2>
        </div>

        {error ? (
          <div className="p-6 text-center sm:p-8">
            <p className="mb-4 text-sm text-error">{t(error)}</p>
            <Button variant="outline" onClick={() => goToPage(page)}>
              {t("common.retry")}
            </Button>
          </div>
        ) : null}

        {isLoading ? (
          <div className="space-y-3 p-4 sm:p-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton
                key={i}
                className="h-16 w-full rounded-xl bg-surface-container"
              />
            ))}
          </div>
        ) : null}

        {!isLoading && !error && documents.length === 0 ? (
          <div className="p-6 text-center sm:p-10">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-surface-container-low">
              <span className="material-symbols-outlined text-[32px] text-outline">
                folder_off
              </span>
            </div>
            <p className="mb-2 text-title-md font-bold text-on-surface">
              {t("documents.noDocuments")}
            </p>
            <p className="mx-auto max-w-sm text-body-sm leading-relaxed text-on-surface-variant">
              {t("documents.noDocumentsHint")}
            </p>
          </div>
        ) : null}

        {!isLoading && !error && documents.length > 0 ? (
          <div className="max-w-full overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-start text-sm">
              <thead className="border-b border-outline-variant/30 bg-surface-container-low">
                <tr>
                  <th className="px-lg py-4 text-label-sm font-bold uppercase tracking-wider text-on-surface-variant">
                    {t("documents.tableName")}
                  </th>
                  <th className="px-lg py-4 text-label-sm font-bold uppercase tracking-wider text-on-surface-variant">
                    {t("documents.tableSize")}
                  </th>
                  <th className="px-lg py-4 text-label-sm font-bold uppercase tracking-wider text-on-surface-variant">
                    {t("documents.tableType")}
                  </th>
                  <th className="px-lg py-4 text-label-sm font-bold uppercase tracking-wider text-on-surface-variant">
                    {t("documents.tableStatus")}
                  </th>
                  <th className="px-lg py-4 text-label-sm font-bold uppercase tracking-wider text-on-surface-variant">
                    {t("documents.tableDate")}
                  </th>
                  <th className="px-lg py-4 text-end text-label-sm font-bold uppercase tracking-wider text-on-surface-variant">
                    {t("documents.tableActions")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/30 bg-surface-container-lowest">
                {documents.map((doc) => (
                  <tr
                    key={doc.id}
                    className="cursor-default transition-colors hover:bg-surface-container-low/50 group"
                  >
                    <td className="max-w-xs truncate px-lg py-4 font-bold text-on-surface">
                      <div className="flex items-center gap-3">
                        <span
                          className="material-symbols-outlined text-secondary"
                          style={{ fontVariationSettings: "'FILL' 1" }}
                        >
                          description
                        </span>
                        <span className="truncate">
                          {doc.metadata.title || doc.fileName}
                        </span>
                      </div>
                    </td>
                    <td className="px-lg py-4 text-body-sm text-on-surface-variant">
                      {getFileSizeLabel(doc.fileSize)}
                    </td>
                    <td className="px-lg py-4">
                      <span className="inline-flex items-center rounded-md border border-outline-variant/30 bg-surface-container px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider text-on-surface-variant">
                        {doc.mimeType.split("/").pop() ?? "-"}
                      </span>
                    </td>
                    <td className="px-lg py-4">
                      <Badge
                        status={
                          STATUS_BADGE_MAP[doc.status] as
                            "success" | "info" | "warning" | "error" | undefined
                        }
                      >
                        {t(
                          `documents.status${doc.status.charAt(0).toUpperCase() + doc.status.slice(1)}`,
                        )}
                      </Badge>
                    </td>
                    <td className="px-lg py-4 whitespace-nowrap text-body-sm text-on-surface-variant">
                      {new Date(doc.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-lg py-4 text-end">
                      {isCompanyAdmin ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-error transition-opacity hover:bg-error-container hover:text-on-error-container md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
                          isLoading={deletingId === doc.id}
                          onClick={async () => {
                            setDeletingId(doc.id);
                            await remove(doc.id);
                            setDeletingId(null);
                          }}
                        >
                          <span className="material-symbols-outlined text-[20px]">
                            delete
                          </span>
                        </Button>
                      ) : (
                        <span className="text-xs text-on-surface-variant">
                          Read only
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {totalPages > 1 ? (
          <div className="flex flex-col gap-3 border-t border-outline-variant/30 bg-surface-container-lowest px-4 py-4 min-[390px]:flex-row min-[390px]:items-center min-[390px]:justify-between sm:px-lg">
            <p className="rounded-full bg-surface-container-low px-3 py-1 text-label-sm font-medium text-on-surface-variant">
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
                <span className="material-symbols-outlined me-1 text-[18px] rtl:rotate-180">
                  chevron_left
                </span>
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
                <span className="material-symbols-outlined ms-1 text-[18px] rtl:rotate-180">
                  chevron_right
                </span>
              </Button>
            </div>
          </div>
        ) : null}
      </DashboardPanel>
    </DashboardPage>
  );
}
