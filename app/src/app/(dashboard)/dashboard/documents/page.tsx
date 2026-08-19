"use client";

import { useState, useCallback, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useI18n, useIntlLocale } from "@/providers/i18n-provider";
import { codeLabel } from "@/lib/i18n/code-label";
import { usePermissions } from "@/providers/permission-provider";
import { Permission } from "@/types/api/permissions.types";
import { useDocuments } from "@/hooks/features/useDocuments";
import { emitGuideTrigger } from "@/lib/copilot/guide-triggers";
import { FileDropzone } from "@/components/ui/FileDropzone";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { Select } from "@/components/ui/Select";
import { Alert } from "@/components/ui/Alert";
import {
  DashboardPage,
  DashboardPageHeader,
  DashboardPanel,
} from "@/components/ui/DashboardPage";
import { DocumentDetailDrawer } from "@/components/documents/DocumentDetailDrawer";
import { ClassificationBadge } from "@/components/documents/ClassificationBadge";
import { BatchPolicyDialog } from "@/components/documents/BatchPolicyDialog";
import {
  validateDocumentTitle,
  validateDocumentFile,
  getFileSizeLabel,
  getFileSizeParts,
} from "@/lib/validation";
import { getDocumentUploadOptions } from "@/services/documents.service";
import type { DocumentUploadOptionsResponse } from "@/types/api/documents.types";
import { formatFileType } from "@/lib/utils";

const STATUS_BADGE_MAP: Record<string, string> = {
  uploaded: "info",
  uploading: "warning",
  processing: "warning",
  processed: "success",
  failed: "error",
  canceled: "neutral",
  reprocessing: "warning",
};

export default function DocumentsPage() {
  const { t, dir } = useI18n();
  const intlLocale = useIntlLocale();
  const permissions = usePermissions();
  const canCreate = permissions.can(Permission.DOCUMENTS_CREATE);
  const canDelete = permissions.can(Permission.DOCUMENTS_DELETE);
  const canArchive = permissions.can(Permission.DOCUMENTS_ARCHIVE);
  const canManageAccess = permissions.can(Permission.DOCUMENTS_MANAGE_ACCESS);
  const {
    documents,
    isLoading,
    error,
    page,
    totalPages,
    totalRecords,
    uploadProgress,
    isUploading,
    uploadError,
    duplicateWarning,
    filters,
    selectedDocument,
    versions,
    isLoadingVersions,
    upload,
    remove,
    permanentDelete,
    archive,
    restore,
    replace,
    goToPage,
    openDrawer,
    closeDrawer,
    updateFilters,
  } = useDocuments();

  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [classificationId, setClassificationId] = useState("");
  const [uploadOptions, setUploadOptions] = useState<DocumentUploadOptionsResponse["data"] | null>(null);
  const [optionsLoadFailed, setOptionsLoadFailed] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showBatchPolicy, setShowBatchPolicy] = useState(false);

  const [searchInput, setSearchInput] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [highlightPage, setHighlightPage] = useState<number | undefined>(undefined);

  const searchParams = useSearchParams();
  const deepLinkId = searchParams.get("id");
  const deepLinkPage = searchParams.get("page");

  useEffect(() => {
    if (!canCreate) return;
    let cancelled = false;

    getDocumentUploadOptions()
      .then((response) => {
        if (cancelled) return;
        setUploadOptions(response.data);
        setOptionsLoadFailed(false);
      })
      .catch(() => {
        if (!cancelled) setOptionsLoadFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [canCreate]);

  function retryLoadUploadOptions() {
    setOptionsLoadFailed(false);
    setUploadOptions(null);
    getDocumentUploadOptions()
      .then((response) => setUploadOptions(response.data))
      .catch(() => setOptionsLoadFailed(true));
  }

  useEffect(() => { setSelectedIds([]); setShowBatchPolicy(false); }, [filters, page]);

  useEffect(() => {
    if (!deepLinkId || isLoading || documents.length === 0) return;
    const match = documents.find((d) => d.id === deepLinkId);
    if (match) {
      openDrawer(match);
      if (deepLinkPage) {
        setHighlightPage(Number(deepLinkPage));
      }
    }
  }, [deepLinkId, deepLinkPage, isLoading, documents, openDrawer]);

  // Behavioral triggers (§: suggestions): a search that returns no results or
  // a failed upload prompts the copilot to offer the matching guide flow.
  useEffect(() => {
    if (isLoading || error || !filters.search || documents.length > 0) return;
    emitGuideTrigger("documents.search_zero_results");
  }, [isLoading, error, filters.search, documents.length]);

  useEffect(() => {
    if (uploadError) emitGuideTrigger("documents.upload_failed");
  }, [uploadError]);

  const handleSearch = useCallback(() => {
    updateFilters({ ...filters, search: searchInput || undefined, isArchived: showArchived });
  }, [searchInput, showArchived, filters, updateFilters]);

  const uploadConfig = uploadOptions?.upload;
  const maxFileSizeBytes = uploadConfig?.maxFileSizeBytes ?? 50 * 1024 * 1024;
  const fileExtensions = uploadConfig?.fileExtensions ?? [".pdf", ".docx", ".txt"];
  const formatsLabel = fileExtensions
    .map((ext) => ext.replace(/^\./, "").toUpperCase())
    .join(", ");
  const maxSizeParts = getFileSizeParts(maxFileSizeBytes);
  const maxSizeLabel = `${maxSizeParts.value} ${t(maxSizeParts.unitKey)}`;
  const fileRequirementsText = t("documents.fileRequirements", {
    formats: formatsLabel,
    maxSize: maxSizeLabel,
  });

  function resetForm() {
    setSelectedFiles([]);
    setTitle("");
    setDescription("");
    setTags("");
    setCategoryId("");
    setDepartmentId("");
    setClassificationId("");
    setFileError(null);
    setTitleError(null);
  }

  function handleFilesSelected(files: File[]) {
    const file = files[0];
    if (!file) return;

    setFileError(null);

    const fileErr = validateDocumentFile(file, {
      maxSizeBytes: maxFileSizeBytes,
      allowedMimeTypes: uploadConfig?.allowedMimeTypes,
      fileExtensions,
    });
    if (fileErr) {
      setFileError(
        fileErr === "documents.fileTooLarge"
          ? t(fileErr, { maxSize: maxSizeLabel })
          : t(fileErr),
      );
      return;
    }

    setSelectedFiles([file]);
  }

  async function handleUpload() {
    if (!canCreate) return;
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
      .map((tag) => tag.trim())
      .filter(Boolean);

    await upload(file, {
      title: title.trim(),
      description: description.trim(),
      tags: tagsArray.join(","),
      categoryId: categoryId || undefined,
      departmentId: departmentId || undefined,
      classificationId: classificationId || undefined,
    });
  }

  return (
    <DashboardPage dir={dir}>
      <DashboardPageHeader
        guideId="page-heading-documents"
        eyebrow={
          <div className="inline-flex w-fit items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-primary">
            <span className="material-symbols-outlined text-[16px]">folder</span>
            {t("documents.knowledgeBase")}
          </div>
        }
        title={t("documents.title")}
        description={t("documents.subtitle")}
        actions={
          <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest px-4 py-3 text-sm shadow-sm">
            <p className="font-semibold text-on-surface">{t("documents.uploadAndOrganize")}</p>
            <p className="mt-1 max-w-xs text-on-surface-variant">
              {t("documents.uploadAndOrganizeDesc")}
            </p>
          </div>
        }
      />

      {canCreate ? (
        <div className="mb-6 grid auto-rows-auto items-start gap-3 sm:gap-4 xl:grid-cols-[1.05fr_0.95fr] xl:gap-5">
          <DashboardPanel>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="text-title-lg font-bold text-primary">{t("documents.upload")}</h2>
                <p className="mt-2 text-sm leading-relaxed text-on-surface-variant">
                  {t("documents.uploadInstruction")}
                </p>
              </div>
              <div className="shrink-0 rounded-full bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">{t("documents.newUpload")}</div>
            </div>

            {optionsLoadFailed && !uploadOptions ? (
              <Alert variant="warning" title={t("documents.taxonomyOptionsErrorTitle")} className="mb-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span>{t("documents.taxonomyOptionsError")}</span>
                  <Button variant="outline" size="sm" onClick={retryLoadUploadOptions}>{t("documents.retryUploadOptions")}</Button>
                </div>
              </Alert>
            ) : null}

            <div data-guide-id="documents-dropzone">
              <FileDropzone
                guideId="documents-upload-button"
                onFilesSelected={handleFilesSelected}
                disabled={isUploading}
                error={fileError}
                accept={fileExtensions.join(",")}
                dragDropText={t("documents.dragDropText")}
                dragDropActiveText={t("documents.dragDropActive")}
                browseText={t("documents.browseFiles")}
                fileRequirementsText={fileRequirementsText}
              />
            </div>

            {selectedFiles.length > 0 && !isUploading ? (
              <div className="mt-4 space-y-4 rounded-2xl border border-outline-variant/30 bg-surface-container p-4">
                <div>
                  <label htmlFor="doc-title" className="mb-2 block text-label-md font-bold text-on-surface-variant">{t("documents.metadataTitle")}</label>
                  <input
                    id="doc-title"
                    type="text"
                    data-guide-id="documents-title-input"
                    value={title}
                    onChange={(e) => { setTitle(e.target.value); setTitleError(null); }}
                    placeholder={t("documents.metadataTitlePlaceholder")}
                    aria-invalid={Boolean(titleError)}
                    className="w-full rounded-lg border border-outline-variant bg-surface px-md py-sm transition-all outline-none focus:border-transparent focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
                  />
                  {titleError ? <p className="mt-1 text-xs text-error">{titleError}</p> : null}
                </div>
                <div>
                  <label htmlFor="doc-description" className="mb-2 block text-label-md font-bold text-on-surface-variant">{t("documents.metadataDescription")}</label>
                  <textarea
                    id="doc-description"
                    data-guide-id="documents-description-input"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder={t("documents.metadataDescriptionPlaceholder")}
                    rows={2}
                    className="w-full rounded-lg border border-outline-variant bg-surface px-md py-sm transition-all outline-none focus:border-transparent focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </div>
                <div>
                  <label htmlFor="doc-tags" className="mb-2 block text-label-md font-bold text-on-surface-variant">{t("documents.metadataTags")}</label>
                  <input
                    id="doc-tags"
                    type="text"
                    data-guide-id="documents-tags-input"
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                    placeholder={t("documents.metadataTagsPlaceholder")}
                    className="w-full rounded-lg border border-outline-variant bg-surface px-md py-sm transition-all outline-none focus:border-transparent focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
                  />
                  <p className="mt-1 text-xs text-outline">{t("documents.metadataTagsHint")}</p>
                </div>
                {uploadOptions ? (
                  <div className="rounded-xl border border-outline-variant/30 bg-surface-container-low p-4">
                    <div className="mb-3">
                      <p className="text-label-md font-bold text-on-surface">{t("documents.uploadTaxonomyTitle")}</p>
                      <p className="mt-1 text-xs text-on-surface-variant">{t("documents.uploadTaxonomyHint")}</p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      <Select
                        label={t("documents.classificationSensitivity")}
                        value={classificationId}
                        onChange={(e) => setClassificationId(e.target.value)}
                        placeholder={t("documents.notAssigned")}
                        options={uploadOptions.taxonomy.classifications.map((item) => ({
                          value: item.id,
                          label: item.level ? `${item.name} (${codeLabel(t, "documents.classificationLevel", item.level)})` : item.name,
                        }))}
                      />
                      <Select
                        label={t("documents.categoryLabel")}
                        value={categoryId}
                        onChange={(e) => setCategoryId(e.target.value)}
                        placeholder={t("documents.notAssigned")}
                        options={uploadOptions.taxonomy.categories.map((item) => ({ value: item.id, label: item.name }))}
                      />
                      <Select
                        label={t("documents.departmentLabel")}
                        value={departmentId}
                        onChange={(e) => setDepartmentId(e.target.value)}
                        placeholder={t("documents.notAssigned")}
                        options={uploadOptions.taxonomy.departments.map((item) => ({ value: item.id, label: item.name }))}
                      />
                    </div>
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-3 pt-2">
                  <Button data-guide-id="documents-upload-submit" onClick={handleUpload}>{t("documents.upload")}</Button>
                  <Button variant="ghost" onClick={resetForm}>{t("common.cancel")}</Button>
                </div>
              </div>
            ) : null}

            {isUploading && uploadProgress !== null ? (
              <div className="mt-8" data-guide-id="documents-upload-progress">
                <ProgressBar value={uploadProgress} label={t("documents.uploading")} size="md" />
              </div>
            ) : null}

            {uploadError ? (
              <p className="mt-4 rounded-xl border border-error/20 bg-error-container p-3 text-sm text-on-error-container" role="alert">{t(uploadError)}</p>
            ) : null}

            {duplicateWarning ? (
              <div className="mt-4 rounded-xl border border-warning/20 bg-warning-container p-3 text-sm text-on-warning-container" data-guide-id="documents-duplicate-warning">
                <p className="font-medium">{t("documents.duplicateDetected")}</p>
                <p className="mt-1 text-xs">{t("documents.duplicateHint", { title: duplicateWarning.existingTitle })}</p>
              </div>
            ) : null}

            <div className="mt-4 rounded-xl border border-outline-variant/30 bg-surface-container-low p-3 text-sm text-on-surface-variant">
              <strong className="text-on-surface">{t("documents.restrictedByDefaultTitle")}</strong>{" "}
              {t("documents.restrictedByDefaultDesc")}
            </div>
          </DashboardPanel>

          <DashboardPanel className="group relative overflow-hidden bg-gradient-to-br from-surface-container via-surface-container-low to-surface-container-lowest transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-lg">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-secondary/10" />
            <div className="relative flex min-w-0 flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0 max-w-2xl">
                <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-primary">
                  <span className="material-symbols-outlined text-[16px]">auto_awesome</span>
                  {t("documents.aiAssistedPrep")}
                </div>
                <h3 className="mt-4 text-title-md font-bold text-primary">{t("documents.turnUploadsTitle")}</h3>
                <p className="mt-3 max-w-xl text-sm leading-relaxed text-on-surface-variant">
                  {t("documents.turnUploadsDesc")}
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <span className="rounded-full border border-outline-variant/40 bg-surface/70 px-3 py-1 text-xs font-medium text-on-surface-variant">{t("documents.betterRetrieval")}</span>
                  <span className="rounded-full border border-outline-variant/40 bg-surface/70 px-3 py-1 text-xs font-medium text-on-surface-variant">{t("documents.cleanerContext")}</span>
                  <span className="rounded-full border border-outline-variant/40 bg-surface/70 px-3 py-1 text-xs font-medium text-on-surface-variant">{t("documents.fasterAnswers")}</span>
                </div>
              </div>
            </div>
          </DashboardPanel>
        </div>
      ) : null}

      <DashboardPanel padding="none">
        <div className="border-b border-outline-variant/30 bg-surface-container-low/50 px-lg py-md">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-title-lg font-bold text-primary">{t("nav.documents")}</h2>
              {totalRecords > 0 && (
                <p className="mt-1 text-sm text-on-surface-variant">{t("documents.totalCount", { count: String(totalRecords) })}</p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <span className="material-symbols-outlined absolute start-3 top-1/2 -translate-y-1/2 text-[18px] text-on-surface-variant">search</span>
                <input
                  type="text"
                  data-guide-id="documents-search-input"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  placeholder={t("documents.searchPlaceholder")}
                  className="w-full rounded-lg border border-outline-variant bg-surface py-2 ps-9 pe-3 text-sm outline-none focus:ring-2 focus:ring-primary sm:w-64"
                />
              </div>
              <Button size="sm" variant="outline" data-guide-id="documents-search-button" onClick={handleSearch}>
                <span className="material-symbols-outlined text-[18px]">search</span>
              </Button>
              {canArchive && (
                <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-outline-variant px-3 py-2 text-sm text-on-surface-variant hover:bg-surface-container-high" data-guide-id="documents-archived-filter">
                  <input
                    type="checkbox"
                    checked={showArchived}
                    onChange={(e) => {
                      setShowArchived(e.target.checked);
                      updateFilters({ ...filters, isArchived: e.target.checked });
                    }}
                    className="accent-primary"
                  />
                  {t("documents.showArchived")}
                </label>
              )}
            </div>
          </div>
          {canManageAccess && selectedIds.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl bg-primary/5 p-3" role="status">
              <strong>{t("documents.selectedCount", { selected: String(selectedIds.length), max: "50" })}</strong>
              <Button size="sm" onClick={() => setShowBatchPolicy(true)}>{t("documents.manageSelectedAccess")}</Button>
              <Button size="sm" variant="ghost" onClick={() => setSelectedIds([])}>{t("documents.clearSelection")}</Button>
            </div>
          )}
        </div>

        {error ? (
          <div className="p-6 text-center sm:p-8">
            <p className="mb-4 text-sm text-error">{t(error)}</p>
            <Button variant="outline" onClick={() => goToPage(page)}>{t("common.retry")}</Button>
          </div>
        ) : null}

        {isLoading ? (
          <div className="space-y-3 p-4 sm:p-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-xl bg-surface-container" />
            ))}
          </div>
        ) : null}

        {!isLoading && !error && documents.length === 0 ? (
          <div className="p-6 text-center sm:p-10">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-surface-container-low">
              <span className="material-symbols-outlined text-[32px] text-outline">{showArchived ? "archive" : canCreate ? "folder_off" : "lock"}</span>
            </div>
            {showArchived ? (
              <>
                <p className="mb-2 text-title-md font-bold text-on-surface">{t("documents.noArchived")}</p>
                <p className="mx-auto max-w-sm text-body-sm leading-relaxed text-on-surface-variant">{t("documents.noArchivedHint")}</p>
              </>
            ) : !canCreate && !canManageAccess ? (
              <>
                <p className="mb-2 text-title-md font-bold text-on-surface">{t("documents.noAccess")}</p>
                <p className="mx-auto max-w-sm text-body-sm leading-relaxed text-on-surface-variant">{t("documents.noAccessHint")}</p>
              </>
            ) : (
              <>
                <p className="mb-2 text-title-md font-bold text-on-surface">{t("documents.noDocuments")}</p>
                <p className="mx-auto max-w-sm text-body-sm leading-relaxed text-on-surface-variant">{t("documents.noDocumentsHint")}</p>
              </>
            )}
          </div>
        ) : null}

        {!isLoading && !error && documents.length > 0 ? (
          <div className="max-w-full overflow-x-auto" data-guide-id="documents-table">
            <table className="w-full min-w-[860px] border-collapse text-start text-sm">
              <thead className="border-b border-outline-variant/30 bg-surface-container-low">
                <tr>
                  {canManageAccess && <th className="p-4 text-start"><span className="sr-only">{t("common.select")}</span></th>}
                  <th className="px-lg py-4 text-label-sm font-bold uppercase tracking-wider text-on-surface-variant">{t("documents.tableName")}</th>
                  <th className="px-lg py-4 text-label-sm font-bold uppercase tracking-wider text-on-surface-variant">{t("documents.tableSize")}</th>
                  <th className="px-lg py-4 text-label-sm font-bold uppercase tracking-wider text-on-surface-variant">{t("documents.tableType")}</th>
                  <th className="px-lg py-4 text-label-sm font-bold uppercase tracking-wider text-on-surface-variant">{t("documents.tableStatus")}</th>
                  <th className="px-lg py-4 text-label-sm font-bold uppercase tracking-wider text-on-surface-variant">{t("taxonomy.classification")}</th>
                  <th className="px-lg py-4 text-label-sm font-bold uppercase tracking-wider text-on-surface-variant">{t("taxonomy.title")}</th>
                  <th className="px-lg py-4 text-label-sm font-bold uppercase tracking-wider text-on-surface-variant">{t("documents.version")}</th>
                  <th className="px-lg py-4 text-label-sm font-bold uppercase tracking-wider text-on-surface-variant">{t("documents.tableDate")}</th>
                  <th className="px-lg py-4 text-end text-label-sm font-bold uppercase tracking-wider text-on-surface-variant">{t("documents.tableActions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/30 bg-surface-container-lowest">
                {documents.map((doc) => (
                  <tr
                    key={doc.id}
                    className="cursor-pointer transition-colors hover:bg-surface-container-low/50 group"
                    onClick={() => openDrawer(doc)}
                  >
                    {canManageAccess && <td className="p-4" onClick={(event) => event.stopPropagation()}><input type="checkbox" aria-label={`Select ${doc.metadata.title || doc.fileName} for batch policy`} checked={selectedIds.includes(doc.id)} disabled={!selectedIds.includes(doc.id) && selectedIds.length >= 50} onChange={(event) => setSelectedIds((current) => event.target.checked ? [...current, doc.id].slice(0, 50) : current.filter((id) => id !== doc.id))} /></td>}
                    <td className="max-w-xs truncate px-lg py-4 font-bold text-on-surface">
                      <div className="flex items-center gap-3">
                        <span className="material-symbols-outlined text-secondary" style={{ fontVariationSettings: "'FILL' 1" }}>description</span>
                        <div className="min-w-0">
                          <span className="truncate block">{doc.metadata.title || doc.fileName}</span>
                          {doc.isArchived && (
                            <span className="text-xs text-on-surface-variant">
                              <span className="material-symbols-outlined me-0.5 align-middle text-[14px]">archive</span>
                              {t("documents.archived")}
                            </span>
                          )}
                          {doc.quarantineStatus === "quarantined" && (
                            <span className="text-xs text-error">{t("documents.quarantined")}</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-lg py-4 text-body-sm text-on-surface-variant">{getFileSizeLabel(doc.fileSize)}</td>
                    <td className="px-lg py-4">
                      <span className="inline-flex items-center rounded-md border border-outline-variant/30 bg-surface-container px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider text-on-surface-variant">
                        {formatFileType(doc.mimeType, doc.fileName)}
                      </span>
                    </td>
                    <td className="px-lg py-4"><ClassificationBadge level={doc.classification} /></td>
                    <td className="px-lg py-4 text-xs text-on-surface-variant"><div>{doc.category ?? t("documents.noCategory")}</div><div>{doc.department ?? t("documents.noDepartment")}</div></td>
                    <td className="px-lg py-4">
                      <Badge status={STATUS_BADGE_MAP[doc.status] as "success" | "info" | "warning" | "error" | undefined} label={codeLabel(t, "documents.status", doc.status)} />
                    </td>
                    <td className="px-lg py-4">
                      <span className="text-sm font-medium text-on-surface-variant">{doc.versionLabel}</span>
                    </td>
                    <td className="px-lg py-4 whitespace-nowrap text-body-sm text-on-surface-variant">{new Date(doc.createdAt).toLocaleDateString(intlLocale)}</td>
                    <td className="px-lg py-4 text-end">
                      {canDelete ? (
                        <div className="flex items-center justify-end gap-1" data-guide-id="documents-table-row-menu" onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-on-surface-variant hover:bg-surface-container-high"
                            onClick={() => openDrawer(doc)}
                            title={t("documents.viewDocument")}
                            data-guide-id="documents-view-button"
                          >
                            <span className="material-symbols-outlined text-[20px]">visibility</span>
                          </Button>
                          {!doc.deletedAt && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-error hover:bg-error-container hover:text-on-error-container"
                              isLoading={deletingId === doc.id}
                              onClick={async () => {
                                setDeletingId(doc.id);
                                await remove(doc.id);
                                setDeletingId(null);
                              }}
                              title={t("documents.deleteDocument")}
                            >
                              <span className="material-symbols-outlined text-[20px]">delete</span>
                            </Button>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-on-surface-variant">{t("taxonomy.readOnly")}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {totalPages > 1 ? (
          <div data-guide-id="documents-pagination" className="flex flex-col gap-3 border-t border-outline-variant/30 bg-surface-container-lowest px-4 py-4 min-[390px]:flex-row min-[390px]:items-center min-[390px]:justify-between sm:px-lg">
            <p className="rounded-full bg-surface-container-low px-3 py-1 text-label-sm font-medium text-on-surface-variant">
              {t("common.page")} {page} / {totalPages}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="border-outline-variant text-on-surface hover:bg-surface-container-low" disabled={page <= 1} onClick={() => goToPage(page - 1)}>
                <span className="material-symbols-outlined me-1 text-[18px] rtl:rotate-180">chevron_left</span>
                {t("common.back")}
              </Button>
              <Button variant="outline" size="sm" className="border-outline-variant text-on-surface hover:bg-surface-container-low" disabled={page >= totalPages} onClick={() => goToPage(page + 1)}>
                {t("common.next")}
                <span className="material-symbols-outlined ms-1 text-[18px] rtl:rotate-180">chevron_right</span>
              </Button>
            </div>
          </div>
        ) : null}
      </DashboardPanel>

      {selectedDocument && (
        <DocumentDetailDrawer
          document={selectedDocument}
          onClose={() => { closeDrawer(); setHighlightPage(undefined); }}
          onArchive={archive}
          onRestore={restore}
          onSoftDelete={remove}
          onPermanentDelete={permanentDelete}
          onReplace={replace}
          versions={versions}
          isLoadingVersions={isLoadingVersions}
          highlightPage={highlightPage}
        />
      )}
      {showBatchPolicy && <BatchPolicyDialog documents={documents.filter((document) => selectedIds.includes(document.id))} onClose={() => setShowBatchPolicy(false)} onComplete={() => { setShowBatchPolicy(false); setSelectedIds([]); void goToPage(page); }} />}
    </DashboardPage>
  );
}
