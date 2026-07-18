"use client";

import { useState, useCallback } from "react";
import * as processingService from "@/services/processing.service";
import type {
  OcrPageResultView,
  DocumentQualityView,
  OcrLanguage,
} from "@/types/api/processing.types";

export interface UseOcrResult {
  ocrPages: OcrPageResultView[];
  quality: DocumentQualityView | null;
  isLoadingOcrPages: boolean;
  isLoadingQuality: boolean;
  isTriggeringOcr: boolean;
  isRetryingOcr: boolean;
  isReviewing: boolean;
  error: string | null;
  triggerOcr: (documentId: string, options?: {
    version?: number;
    language?: OcrLanguage;
    pageNumbers?: number[];
  }) => Promise<void>;
  retryOcr: (documentId: string, options?: {
    version?: number;
    pageNumbers?: number[];
  }) => Promise<void>;
  refreshOcrPages: (documentId: string, version?: number) => Promise<void>;
  refreshQuality: (documentId: string, version?: number) => Promise<void>;
  reviewQuality: (documentId: string, decision: "approved" | "rejected" | "retry", options?: {
    version?: number;
    notes?: string;
    pageNumbers?: number[];
  }) => Promise<void>;
}

export function useOcr(): UseOcrResult {
  const [ocrPages, setOcrPages] = useState<OcrPageResultView[]>([]);
  const [quality, setQuality] = useState<DocumentQualityView | null>(null);
  const [isLoadingOcrPages, setIsLoadingOcrPages] = useState(false);
  const [isLoadingQuality, setIsLoadingQuality] = useState(false);
  const [isTriggeringOcr, setIsTriggeringOcr] = useState(false);
  const [isRetryingOcr, setIsRetryingOcr] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshOcrPages = useCallback(async (documentId: string, version?: number) => {
    setIsLoadingOcrPages(true);
    setError(null);
    try {
      const res = await processingService.getOcrPageResults(documentId, version);
      setOcrPages(res.data.pages);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load OCR results");
    } finally {
      setIsLoadingOcrPages(false);
    }
  }, []);

  const refreshQuality = useCallback(async (documentId: string, version?: number) => {
    setIsLoadingQuality(true);
    setError(null);
    try {
      const res = await processingService.getDocumentQuality(documentId, version);
      setQuality(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load quality assessment");
    } finally {
      setIsLoadingQuality(false);
    }
  }, []);

  const triggerOcr = useCallback(async (documentId: string, options?: {
    version?: number;
    language?: OcrLanguage;
    pageNumbers?: number[];
  }) => {
    setIsTriggeringOcr(true);
    setError(null);
    try {
      await processingService.triggerOcrProcessing(documentId, options);
      await refreshOcrPages(documentId, options?.version);
      await refreshQuality(documentId, options?.version);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to trigger OCR processing");
    } finally {
      setIsTriggeringOcr(false);
    }
  }, [refreshOcrPages, refreshQuality]);

  const retryOcr = useCallback(async (documentId: string, options?: {
    version?: number;
    pageNumbers?: number[];
  }) => {
    setIsRetryingOcr(true);
    setError(null);
    try {
      await processingService.retryOcrPages(documentId, options);
      await refreshOcrPages(documentId, options?.version);
      await refreshQuality(documentId, options?.version);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to retry OCR processing");
    } finally {
      setIsRetryingOcr(false);
    }
  }, [refreshOcrPages, refreshQuality]);

  const reviewQuality = useCallback(async (documentId: string, decision: "approved" | "rejected" | "retry", options?: {
    version?: number;
    notes?: string;
    pageNumbers?: number[];
  }) => {
    setIsReviewing(true);
    setError(null);
    try {
      await processingService.reviewDocumentQuality(documentId, decision, options);
      await refreshQuality(documentId, options?.version);
      await refreshOcrPages(documentId, options?.version);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit review");
    } finally {
      setIsReviewing(false);
    }
  }, [refreshQuality, refreshOcrPages]);

  return {
    ocrPages,
    quality,
    isLoadingOcrPages,
    isLoadingQuality,
    isTriggeringOcr,
    isRetryingOcr,
    isReviewing,
    error,
    triggerOcr,
    retryOcr,
    refreshOcrPages,
    refreshQuality,
    reviewQuality,
  };
}
