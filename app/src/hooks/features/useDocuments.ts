"use client";

import { useState, useEffect, useCallback } from "react";
import type { DocumentView, DocumentVersionView } from "@/types/api/documents.types";
import * as documentsService from "@/services/documents.service";
import { getDocumentUploadErrorKey } from "@/lib/document-upload-errors";

export interface SearchFilters {
  search?: string;
  status?: string;
  category?: string;
  classification?: string;
  isArchived?: boolean;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export function useDocuments() {
  const [documents, setDocuments] = useState<DocumentView[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<{ existingDocumentId: string; existingTitle: string } | null>(null);

  const [filters, setFilters] = useState<SearchFilters>({ isArchived: false });

  const [selectedDocument, setSelectedDocument] = useState<DocumentView | null>(null);
  const [versions, setVersions] = useState<DocumentVersionView[]>([]);
  const [isLoadingVersions, setIsLoadingVersions] = useState(false);

  const fetchDocuments = useCallback(async (currentPage = 1, currentFilters?: SearchFilters) => {
    setError(null);

    try {
      const response = await documentsService.listDocuments(currentPage, 20, currentFilters ?? filters);
      const { documents: docs, pagination } = response.data;

      setDocuments(docs);
      setPage(pagination.page);
      setTotalPages(pagination.totalPages);
      setTotalRecords(pagination.totalRecords);
    } catch {
      setError("common.error");
    }
  }, [filters]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);

      try {
        const response = await documentsService.listDocuments(1, 20, filters);
        if (cancelled) return;

        const { documents: docs, pagination } = response.data;
        setDocuments(docs);
        setPage(pagination.page);
        setTotalPages(pagination.totalPages);
        setTotalRecords(pagination.totalRecords);
      } catch {
        if (!cancelled) setError("common.error");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [filters]);

  // Auto-poll document status while any document is being processed by background workers
  const hasProcessingDocs = documents.some(
    (doc) =>
      doc.status === "processing" ||
      doc.status === "uploaded" ||
      doc.status === "uploading",
  );

  useEffect(() => {
    if (!hasProcessingDocs) return;

    const intervalId = setInterval(async () => {
      try {
        const response = await documentsService.listDocuments(page, 20, filters);
        const { documents: docs, pagination } = response.data;
        setDocuments(docs);
        setTotalPages(pagination.totalPages);
        setTotalRecords(pagination.totalRecords);

        setSelectedDocument((prev) => {
          if (!prev) return null;
          const updated = docs.find((d) => d.id === prev.id);
          return updated ?? prev;
        });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("Auto-polling document status failed:", err);
      }
    }, 3000);

    return () => clearInterval(intervalId);
  }, [hasProcessingDocs, page, filters]);

  async function upload(
    file: File,
    metadata: {
      title: string;
      description?: string;
      tags?: string;
      categoryId?: string;
      departmentId?: string;
      classificationId?: string;
    },
  ) {
    setIsUploading(true);
    setUploadError(null);
    setUploadProgress(0);
    setDuplicateWarning(null);

    try {
      const result = await documentsService.uploadDocument(file, metadata, (progress) => {
        setUploadProgress(progress);
      });

      if (result.data.duplicateWarning) {
        setDuplicateWarning(result.data.duplicateWarning);
      }

      setUploadProgress(null);
      setIsUploading(false);
      fetchDocuments(1, { ...filters, isArchived: false });
    } catch (error) {
      setUploadProgress(null);
      setIsUploading(false);
      const errorKey = getDocumentUploadErrorKey(error);
      setUploadError(
        errorKey ?? (error instanceof Error ? error.message : "documents.uploadError"),
      );
    }
  }

  async function remove(id: string) {
    try {
      await documentsService.deleteDocument(id);
      setSelectedDocument(null);
      fetchDocuments(page);
    } catch (err) {
        // eslint-disable-next-line no-console
        console.error("Failed to soft-delete document:", err);
    }
  }

  async function permanentDelete(id: string) {
    try {
      await documentsService.permanentDeleteDocument(id);
      setSelectedDocument(null);
      fetchDocuments(page);
    } catch (err) {
        // eslint-disable-next-line no-console
        console.error("Failed to permanently delete document:", err);
    }
  }

  async function archive(id: string) {
    try {
      await documentsService.archiveDocument(id);
      setSelectedDocument(null);
      fetchDocuments(page, filters);
    } catch (err) {
        // eslint-disable-next-line no-console
        console.error("Failed to archive document:", err);
    }
  }

  async function restore(id: string) {
    try {
      await documentsService.restoreDocument(id);
      setSelectedDocument(null);
      fetchDocuments(page, filters);
    } catch (err) {
        // eslint-disable-next-line no-console
        console.error("Failed to restore document:", err);
    }
  }

  async function replace(id: string, file: File, changeDescription?: string) {
    try {
      await documentsService.replaceDocument(id, file, changeDescription);
      loadVersions(id);
      fetchDocuments(page, filters);
    } catch (err) {
        // eslint-disable-next-line no-console
        console.error("Failed to replace document:", err);
    }
  }

  async function loadVersions(documentId: string) {
    setIsLoadingVersions(true);
    try {
      const response = await documentsService.listDocumentVersions(documentId);
      setVersions(response.data.versions);
    } catch {
      setVersions([]);
    } finally {
      setIsLoadingVersions(false);
    }
  }

  function openDrawer(doc: DocumentView) {
    setSelectedDocument(doc);
    loadVersions(doc.id);
  }

  function closeDrawer() {
    setSelectedDocument(null);
    setVersions([]);
  }

  function updateFilters(newFilters: SearchFilters) {
    setFilters(newFilters);
    setPage(1);
  }

  async function goToPage(newPage: number) {
    if (newPage < 1 || newPage > totalPages) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await documentsService.listDocuments(newPage, 20, filters);
      const { documents: docs, pagination } = response.data;

      setDocuments(docs);
      setPage(pagination.page);
      setTotalPages(pagination.totalPages);
      setTotalRecords(pagination.totalRecords);
    } catch {
      setError("common.error");
    } finally {
      setIsLoading(false);
    }
  }

  return {
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
    fetchDocuments,
    openDrawer,
    closeDrawer,
    updateFilters,
    loadVersions,
  };
}
