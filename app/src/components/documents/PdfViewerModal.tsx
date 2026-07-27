"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

interface PdfViewerModalProps {
  documentId: string;
  pageNumber?: number;
  highlightText?: string;
  documentTitle?: string;
  onClose: () => void;
}

export function PdfViewerModal({
  documentId,
  pageNumber: initialPage = 1,
  highlightText,
  documentTitle,
  onClose,
}: PdfViewerModalProps) {
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState(1.2);
  const [pageInput, setPageInput] = useState("1");
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const renderGenerationRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let blobUrl: string | null = null;

    setLoading(true);
    setPdfDoc(null);
    setError(null);

    async function loadPdf() {
      try {
        const { fetchDocumentPreviewUrl } = await import(
          "@/services/documents.service"
        );
        blobUrl = await fetchDocumentPreviewUrl(documentId);
        if (cancelled) {
          URL.revokeObjectURL(blobUrl);
          return;
        }

        const loadingTask = pdfjsLib.getDocument(blobUrl);
        const doc = await loadingTask.promise;
        if (cancelled) {
          doc.destroy();
          URL.revokeObjectURL(blobUrl);
          return;
        }

        const targetPage = Math.min(Math.max(initialPage, 1), doc.numPages);
        setPdfDoc(doc);
        setTotalPages(doc.numPages);
        setCurrentPage(targetPage);
        setPageInput(String(targetPage));
        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load PDF");
          setLoading(false);
        }
      }
    }

    void loadPdf();

    return () => {
      cancelled = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [documentId, initialPage]);

  const renderPage = useCallback(
    async (pageNum: number, generation: number) => {
      if (!pdfDoc) return;

      const page = await pdfDoc.getPage(pageNum);
      if (generation !== renderGenerationRef.current) return;

      const viewport = page.getViewport({ scale });

      const canvasEl = document.createElement("canvas");
      canvasEl.width = viewport.width;
      canvasEl.height = viewport.height;
      canvasEl.style.width = "100%";
      canvasEl.style.height = "auto";
      canvasEl.style.display = "block";

      const container = canvasContainerRef.current;
      const textLayerEl = textLayerRef.current;
      if (!container || !textLayerEl) return;

      container.innerHTML = "";
      container.appendChild(canvasEl);

      const ctx = canvasEl.getContext("2d");
      if (!ctx) return;

      await page.render({ canvasContext: ctx, viewport }).promise;
      if (generation !== renderGenerationRef.current) return;

      const textContent = await page.getTextContent();
      if (generation !== renderGenerationRef.current) return;

      textLayerEl.innerHTML = "";
      const canvasRect = canvasEl.getBoundingClientRect();
      textLayerEl.style.width = `${canvasRect.width}px`;
      textLayerEl.style.height = `${canvasRect.height}px`;

      const scaleX = canvasRect.width / viewport.width;
      const scaleY = canvasRect.height / viewport.height;

      const spans: HTMLSpanElement[] = [];

      for (const item of textContent.items) {
        if (!("str" in item) || !item.str) continue;

        const tx = pdfjsLib.Util.transform(
          pdfjsLib.Util.transform(viewport.transform, item.transform),
          [1, 0, 0, -1, 0, 0],
        );

        const span = document.createElement("span");
        span.textContent = item.str;
        span.style.position = "absolute";
        span.style.left = `${tx[4] * scaleX}px`;
        span.style.top = `${tx[5] * scaleY}px`;
        span.style.fontSize = `${Math.sqrt(item.transform[2] ** 2 + item.transform[3] ** 2) * scaleY}px`;
        span.style.fontFamily = item.fontName ?? "sans-serif";
        span.style.color = "transparent";
        span.style.whiteSpace = "pre";
        span.style.lineHeight = "1";
        span.style.pointerEvents = "none";

        textLayerEl.appendChild(span);
        spans.push(span);
      }

      if (highlightText && spans.length > 0) {
        highlightTextInLayer(textLayerEl, spans, highlightText);
      }
    },
    [pdfDoc, scale, highlightText],
  );

  useEffect(() => {
    if (pdfDoc && !loading) {
      const generation = ++renderGenerationRef.current;
      void renderPage(currentPage, generation);
    }
  }, [pdfDoc, currentPage, loading, renderPage]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT") return;

      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        setCurrentPage((p) => Math.max(1, p - 1));
      }
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        setCurrentPage((p) => Math.min(totalPages, p + 1));
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, totalPages]);

  function goToPage() {
    const num = parseInt(pageInput, 10);
    if (!isNaN(num) && num >= 1 && num <= totalPages) {
      setCurrentPage(num);
    } else {
      setPageInput(String(currentPage));
    }
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex flex-col bg-surface"
      role="dialog"
      aria-modal="true"
      aria-label={`PDF viewer: ${documentTitle ?? "Document"}`}
    >
      <div className="flex items-center justify-between border-b border-outline-variant/30 bg-surface-container-low px-4 py-2">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onClose}
            className="shrink-0 rounded-full p-2 text-on-surface-variant transition-colors hover:bg-surface-container-high"
            aria-label="Close"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
          <h2 className="truncate text-title-md font-semibold text-on-surface">
            {documentTitle ?? "Document"}
          </h2>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setScale((s) => Math.max(0.5, s - 0.2))}
            className="rounded-full p-2 text-on-surface-variant transition-colors hover:bg-surface-container-high"
            aria-label="Zoom out"
          >
            <span className="material-symbols-outlined">zoom_out</span>
          </button>
          <span className="min-w-[3rem] text-center text-sm text-on-surface-variant">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={() => setScale((s) => Math.min(3, s + 0.2))}
            className="rounded-full p-2 text-on-surface-variant transition-colors hover:bg-surface-container-high"
            aria-label="Zoom in"
          >
            <span className="material-symbols-outlined">zoom_in</span>
          </button>

          <div className="mx-2 h-6 w-px bg-outline-variant/30" />

          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
            className="rounded-full p-2 text-on-surface-variant transition-colors hover:bg-surface-container-high disabled:opacity-30"
            aria-label="Previous page"
          >
            <span className="material-symbols-outlined">chevron_left</span>
          </button>

          <div className="flex items-center gap-1 text-sm text-on-surface">
            <input
              type="number"
              min={1}
              max={totalPages}
              value={pageInput}
              onChange={(e) => setPageInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") goToPage();
              }}
              onBlur={goToPage}
              className="w-12 rounded border border-outline-variant/30 bg-surface px-1 py-0.5 text-center text-sm text-on-surface outline-none focus:border-primary"
            />
            <span className="text-on-surface-variant">/ {totalPages}</span>
          </div>

          <button
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage >= totalPages}
            className="rounded-full p-2 text-on-surface-variant transition-colors hover:bg-surface-container-high disabled:opacity-30"
            aria-label="Next page"
          >
            <span className="material-symbols-outlined">chevron_right</span>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-gray-800 flex items-start justify-center p-4">
        {loading && (
          <div className="flex flex-col items-center justify-center gap-3 pt-32 text-on-surface-variant">
            <span className="h-8 w-8 animate-spin rounded-full border-3 border-primary border-t-transparent" />
            <p className="text-sm">Loading document...</p>
          </div>
        )}
        {error && (
          <div className="flex flex-col items-center justify-center gap-3 pt-32 text-error">
            <span className="material-symbols-outlined text-[40px]">error</span>
            <p className="text-sm">{error}</p>
            <button
              onClick={onClose}
              className="mt-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:bg-primary/90"
            >
              Close
            </button>
          </div>
        )}
        {!loading && !error && (
          <div className="relative inline-block shadow-2xl">
            <div ref={canvasContainerRef} className="relative" />
            <div
              ref={textLayerRef}
              className="pointer-events-none absolute left-0 top-0"
              style={{ overflow: "hidden" }}
            />
          </div>
        )}
      </div>

      <div className="flex items-center justify-center border-t border-outline-variant/30 bg-surface-container-low px-4 py-2 text-xs text-on-surface-variant">
        <span>Arrow keys to navigate</span>
        <span className="mx-2">·</span>
        <span>ESC to close</span>
        {highlightText && (
          <>
            <span className="mx-2">·</span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-yellow-300" />
              Highlighted text
            </span>
          </>
        )}
      </div>
    </div>
  );
}

function highlightTextInLayer(
  layer: HTMLDivElement,
  spans: HTMLSpanElement[],
  highlightText: string,
) {
  const target = highlightText.trim();
  if (!target) return;

  // Tokenize highlight text into words
  const highlightWords = tokenize(target);
  if (highlightWords.length === 0) return;

  // Tokenize each span into words, tracking which span each word came from
  const spanTexts = spans.map((s) => s.textContent ?? "");
  const pdfWords: { word: string; spanIdx: number }[] = [];

  for (let i = 0; i < spanTexts.length; i++) {
    const words = tokenize(spanTexts[i]);
    for (const word of words) {
      pdfWords.push({ word, spanIdx: i });
    }
  }

  if (pdfWords.length === 0) return;

  // Find the longest contiguous subsequence of highlight words in PDF words
  const match = findBestMatch(highlightWords, pdfWords);
  if (!match) return;

  // Collect unique span indices from the match
  const matchedSpanIndices = new Set<number>();
  for (let i = match.start; i < match.start + match.length; i++) {
    matchedSpanIndices.add(pdfWords[i].spanIdx);
  }

  applyHighlights(spans, matchedSpanIndices, layer);
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]+/gu, ""))
    .filter(Boolean);
}

function findBestMatch(
  highlightWords: string[],
  pdfWords: { word: string; spanIdx: number }[],
): { start: number; length: number } | null {
  const pdfWordStrings = pdfWords.map((w) => w.word);
  const hlLen = highlightWords.length;

  // Try exact match first, then with increasing allowed gaps
  for (let maxGaps = 0; maxGaps <= Math.min(3, Math.floor(hlLen / 4)); maxGaps++) {
    const result = findContiguousMatch(highlightWords, pdfWordStrings, maxGaps);
    if (result) return result;
  }

  // Final fallback: find the longest prefix of highlight words that appears in sequence
  return findLongestPrefixMatch(highlightWords, pdfWordStrings);
}

function findContiguousMatch(
  highlightWords: string[],
  pdfWordStrings: string[],
  maxGaps: number,
): { start: number; length: number } | null {
  const hlLen = highlightWords.length;
  const pdfLen = pdfWordStrings.length;

  // Try matching starting at each PDF word position
  for (let pdfStart = 0; pdfStart <= pdfLen - hlLen; pdfStart++) {
    let hlIdx = 0;
    let gaps = 0;
    let pdfIdx = pdfStart;

    while (hlIdx < hlLen && pdfIdx < pdfLen) {
      if (highlightWords[hlIdx] === pdfWordStrings[pdfIdx]) {
        hlIdx++;
        pdfIdx++;
      } else {
        gaps++;
        if (gaps > maxGaps) break;
        pdfIdx++;
      }
    }

    if (hlIdx >= hlLen) {
      // Full match found — return the PDF range that was consumed
      return { start: pdfStart, length: pdfIdx - pdfStart };
    }
  }

  return null;
}

function findLongestPrefixMatch(
  highlightWords: string[],
  pdfWordStrings: string[],
): { start: number; length: number } | null {
  let bestStart = -1;
  let bestLength = 0;
  const hlLen = highlightWords.length;
  const pdfLen = pdfWordStrings.length;

  // Try matching progressively shorter prefixes (at least 5 words)
  for (let prefixLen = Math.min(hlLen, 30); prefixLen >= Math.min(5, hlLen); prefixLen--) {
    const prefix = highlightWords.slice(0, prefixLen);

    for (let pdfStart = 0; pdfStart <= pdfLen - prefixLen; pdfStart++) {
      let matched = 0;
      for (let k = 0; k < prefixLen; k++) {
        if (prefix[k] === pdfWordStrings[pdfStart + k]) {
          matched++;
        } else {
          break;
        }
      }

      if (matched > bestLength) {
        bestLength = matched;
        bestStart = pdfStart;
      }

      if (matched === prefixLen) break;
    }

    if (bestLength >= prefixLen) break;
  }

  if (bestStart === -1 || bestLength === 0) return null;
  return { start: bestStart, length: bestLength };
}

function applyHighlights(
  spans: HTMLSpanElement[],
  matchedSpanIndices: Set<number>,
  layer: HTMLDivElement,
) {
  if (matchedSpanIndices.size === 0) return;

  for (const idx of matchedSpanIndices) {
    const span = spans[idx];
    const rect = span.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;

    const mark = document.createElement("mark");
    mark.style.position = "absolute";
    mark.style.left = span.style.left;
    mark.style.top = span.style.top;
    mark.style.width = `${rect.width}px`;
    mark.style.height = `${rect.height}px`;
    mark.style.background = "rgba(250, 204, 21, 0.45)";
    mark.style.borderRadius = "2px";
    mark.style.pointerEvents = "none";
    mark.style.zIndex = "1";
    mark.className = "pdf-highlight";

    layer.appendChild(mark);
  }

  requestAnimationFrame(() => {
    const firstMark = layer.querySelector(".pdf-highlight");
    firstMark?.scrollIntoView({ block: "center", behavior: "smooth" });
  });
}
