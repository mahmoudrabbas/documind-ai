"use client";

import { useState, useEffect, useCallback } from "react";
import type { DocumentView } from "@/types/api/documents.types";
import * as documentsService from "@/services/documents.service";

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

  const fetchDocuments = useCallback(async (currentPage = 1) => {
    setError(null);

    try {
      const response = await documentsService.listDocuments(currentPage);
      const { documents: docs, pagination } = response.data;

      setDocuments(docs);
      setPage(pagination.page);
      setTotalPages(pagination.totalPages);
      setTotalRecords(pagination.totalRecords);
    } catch {
      setError("common.error");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);

      try {
        const response = await documentsService.listDocuments(1);
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
  }, []);

  async function upload(
    file: File,
    metadata: { title: string; description?: string; tags?: string },
  ) {
    setIsUploading(true);
    setUploadError(null);
    setUploadProgress(0);

    try {
      await documentsService.uploadDocument(file, metadata, (progress) => {
        setUploadProgress(progress);
      });

      setUploadProgress(null);
      setIsUploading(false);
      fetchDocuments(1);
    } catch (error) {
      setUploadProgress(null);
      setIsUploading(false);
      setUploadError(
        error instanceof Error ? error.message : "documents.uploadError",
      );
    }
  }

  async function remove(id: string) {
    try {
      await documentsService.deleteDocument(id);
      fetchDocuments(page);
    } catch {
      setError("common.error");
    }
  }

  async function goToPage(newPage: number) {
    if (newPage < 1 || newPage > totalPages) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await documentsService.listDocuments(newPage);
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
    upload,
    remove,
    goToPage,
    fetchDocuments,
  };
}
