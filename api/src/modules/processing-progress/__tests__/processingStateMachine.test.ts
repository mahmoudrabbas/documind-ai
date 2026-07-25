import { describe, it, expect } from "vitest";
import {
  isValidRunTransition,
  isValidStageTransition,
  getNextStage,
  getStageProgress,
  computeOverallProgress,
  getSafeErrorInfo,
  PROCESSING_STAGES,
  STAGE_ORDER,
  STAGE_PROGRESS_WEIGHTS,
} from "../processingStateMachine.js";

describe("Processing State Machine", () => {
  describe("isValidRunTransition", () => {
    it("allows queued → running", () => {
      expect(isValidRunTransition("queued", "running")).toBe(true);
    });

    it("allows queued → paused", () => {
      expect(isValidRunTransition("queued", "paused")).toBe(true);
    });

    it("allows queued → canceled", () => {
      expect(isValidRunTransition("queued", "canceled")).toBe(true);
    });

    it("allows running → completed", () => {
      expect(isValidRunTransition("running", "completed")).toBe(true);
    });

    it("allows running → failed", () => {
      expect(isValidRunTransition("running", "failed")).toBe(true);
    });

    it("allows running → paused", () => {
      expect(isValidRunTransition("running", "paused")).toBe(true);
    });

    it("allows running → canceled", () => {
      expect(isValidRunTransition("running", "canceled")).toBe(true);
    });

    it("allows paused → failed", () => {
      expect(isValidRunTransition("paused", "failed")).toBe(true);
    });

    it("allows paused → canceled", () => {
      expect(isValidRunTransition("paused", "canceled")).toBe(true);
    });

    it("allows failed → queued (retry)", () => {
      expect(isValidRunTransition("failed", "queued")).toBe(true);
    });

    it("allows canceled → queued (reprocess)", () => {
      expect(isValidRunTransition("canceled", "queued")).toBe(true);
    });

    it("rejects completed → queued (no transition from terminal states)", () => {
      expect(isValidRunTransition("completed", "queued")).toBe(false);
    });

    it("rejects completed → running", () => {
      expect(isValidRunTransition("completed", "running")).toBe(false);
    });

    it("rejects failed → running (must go through queued)", () => {
      expect(isValidRunTransition("failed", "running")).toBe(false);
    });

    it("rejects canceled → running (must go through queued)", () => {
      expect(isValidRunTransition("canceled", "running")).toBe(false);
    });

    it("rejects running → queued (cannot go backwards)", () => {
      expect(isValidRunTransition("running", "queued")).toBe(false);
    });

    it("rejects failed → completed", () => {
      expect(isValidRunTransition("failed", "completed")).toBe(false);
    });

    it("rejects failed → canceled", () => {
      expect(isValidRunTransition("failed", "canceled")).toBe(false);
    });

    it("rejects queued → completed (must be running first)", () => {
      expect(isValidRunTransition("queued", "completed")).toBe(false);
    });

    it("rejects queued → failed (must be running first)", () => {
      expect(isValidRunTransition("queued", "failed")).toBe(false);
    });
  });

  describe("isValidStageTransition", () => {
    it("allows pending → running", () => {
      expect(isValidStageTransition("pending", "running")).toBe(true);
    });

    it("allows running → completed", () => {
      expect(isValidStageTransition("running", "completed")).toBe(true);
    });

    it("allows running → failed", () => {
      expect(isValidStageTransition("running", "failed")).toBe(true);
    });

    it("allows running → canceled", () => {
      expect(isValidStageTransition("running", "canceled")).toBe(true);
    });

    it("allows pending → canceled", () => {
      expect(isValidStageTransition("pending", "canceled")).toBe(true);
    });

    it("allows pending → skipped", () => {
      expect(isValidStageTransition("pending", "skipped")).toBe(true);
    });

    it("allows failed → skipped", () => {
      expect(isValidStageTransition("failed", "skipped")).toBe(true);
    });

    it("rejects completed → running (terminal state)", () => {
      expect(isValidStageTransition("completed", "running")).toBe(false);
    });

    it("rejects completed → failed", () => {
      expect(isValidStageTransition("completed", "failed")).toBe(false);
    });

    it("rejects completed → skipped", () => {
      expect(isValidStageTransition("completed", "skipped")).toBe(false);
    });

    it("rejects skipped → running", () => {
      expect(isValidStageTransition("skipped", "running")).toBe(false);
    });

    it("rejects canceled → running", () => {
      expect(isValidStageTransition("canceled", "running")).toBe(false);
    });

    it("rejects failed → completed", () => {
      expect(isValidStageTransition("failed", "completed")).toBe(false);
    });

    it("rejects failed → canceled", () => {
      expect(isValidStageTransition("failed", "canceled")).toBe(false);
    });
  });

  describe("getNextStage", () => {
    it("returns the first stage when currentStage is null", () => {
      expect(getNextStage(null)).toBe("security_scanning");
    });

    it("returns the next stage in order", () => {
      expect(getNextStage("security_scanning")).toBe("extraction");
      expect(getNextStage("extraction")).toBe("ocr");
      expect(getNextStage("ocr")).toBe("quality_review");
      expect(getNextStage("quality_review")).toBe("metadata_review");
      expect(getNextStage("metadata_review")).toBe("chunking");
      expect(getNextStage("chunking")).toBe("embedding");
      expect(getNextStage("embedding")).toBe("indexing");
      expect(getNextStage("indexing")).toBe("finalization");
    });

    it("returns null for the final stage", () => {
      expect(getNextStage("finalization")).toBe(null);
    });
  });

  describe("getStageProgress", () => {
    it("returns 0 when stageProgress is 0", () => {
      expect(getStageProgress("extraction", 0)).toBe(0);
    });

    it("returns the full weight when stageProgress is 100", () => {
      expect(getStageProgress("extraction", 100)).toBe(STAGE_PROGRESS_WEIGHTS.extraction);
      expect(getStageProgress("ocr", 100)).toBe(STAGE_PROGRESS_WEIGHTS.ocr);
    });

    it("calculates proportional progress correctly", () => {
      const result = getStageProgress("extraction", 50);
      expect(result).toBe(Math.round((50 / 100) * STAGE_PROGRESS_WEIGHTS.extraction));
    });

    it("rounds to nearest integer", () => {
      const result = getStageProgress("ocr", 33);
      expect(Number.isInteger(result)).toBe(true);
    });
  });

  describe("computeOverallProgress", () => {
    it("returns 0 when no stages are completed and no current stage", () => {
      expect(computeOverallProgress([], null, 0)).toBe(0);
    });

    it("computes progress from completed stages", () => {
      const result = computeOverallProgress(
        ["security_scanning", "extraction"],
        null,
        0,
      );
      const expected =
        STAGE_PROGRESS_WEIGHTS.security_scanning + STAGE_PROGRESS_WEIGHTS.extraction;
      expect(result).toBe(expected);
    });

    it("includes current stage partial progress", () => {
      const result = computeOverallProgress(
        ["security_scanning"],
        "extraction",
        50,
      );
      const expected =
        STAGE_PROGRESS_WEIGHTS.security_scanning +
        Math.round((50 / 100) * STAGE_PROGRESS_WEIGHTS.extraction);
      expect(result).toBe(expected);
    });

    it("caps at 100%", () => {
      const allStages = [...PROCESSING_STAGES];
      const result = computeOverallProgress(allStages, null, 0);
      expect(result).toBe(100);
    });

    it("returns 100 when all stages complete including current at 100%", () => {
      const completed = PROCESSING_STAGES.slice(0, -1);
      const result = computeOverallProgress(
        completed,
        PROCESSING_STAGES[PROCESSING_STAGES.length - 1],
        100,
      );
      expect(result).toBe(100);
    });

    it("never goes below 0", () => {
      expect(computeOverallProgress([], null, 0)).toBeGreaterThanOrEqual(0);
    });
  });

  describe("getSafeErrorInfo", () => {
    it("returns default when errorCode is null", () => {
      const result = getSafeErrorInfo(null, null);
      expect(result.title).toBe("Processing error");
      expect(result.retryable).toBe(true);
    });

    it("uses errorMessage when errorCode is null", () => {
      const result = getSafeErrorInfo(null, "Something went wrong");
      expect(result.description).toBe("Something went wrong");
    });

    it("returns extraction_failed info", () => {
      const result = getSafeErrorInfo("extraction_failed", "details");
      expect(result.title).toBe("Text extraction failed");
      expect(result.retryable).toBe(true);
    });

    it("returns ocr_failed info", () => {
      const result = getSafeErrorInfo("ocr_failed", null);
      expect(result.title).toBe("OCR processing failed");
      expect(result.retryable).toBe(true);
    });

    it("returns quality_review_required as non-retryable", () => {
      const result = getSafeErrorInfo("quality_review_required", null);
      expect(result.retryable).toBe(false);
    });

    it("returns encrypted_document as non-retryable", () => {
      const result = getSafeErrorInfo("encrypted_document", null);
      expect(result.retryable).toBe(false);
    });

    it("returns unsupported_format as non-retryable", () => {
      const result = getSafeErrorInfo("unsupported_format", null);
      expect(result.retryable).toBe(false);
    });

    it("returns file_not_found as non-retryable", () => {
      const result = getSafeErrorInfo("file_not_found", null);
      expect(result.retryable).toBe(false);
    });

    it("returns quota_exceeded as non-retryable", () => {
      const result = getSafeErrorInfo("quota_exceeded", null);
      expect(result.retryable).toBe(false);
    });

    it("returns resource_limit as retryable", () => {
      const result = getSafeErrorInfo("resource_limit", null);
      expect(result.retryable).toBe(true);
    });

    it("returns generic fallback for unknown errorCode", () => {
      const result = getSafeErrorInfo("unknown_error", "details");
      expect(result.title).toBe("Processing error");
      expect(result.retryable).toBe(true);
    });

    it("uses hardcoded description for known error codes", () => {
      const result = getSafeErrorInfo("extraction_failed", "custom message");
      expect(result.description).toBe("The document could not be parsed. The file may be corrupted or in an unsupported format.");
    });
  });

  describe("STAGE_ORDER consistency", () => {
    it("has unique order values for all stages", () => {
      const orders = Object.values(STAGE_ORDER);
      const uniqueOrders = new Set(orders);
      expect(uniqueOrders.size).toBe(orders.length);
    });

    it("order values start at 0 and are sequential", () => {
      const orders = Object.values(STAGE_ORDER).sort((a, b) => a - b);
      expect(orders[0]).toBe(0);
      for (let i = 1; i < orders.length; i++) {
        expect(orders[i]).toBe(orders[i - 1] + 1);
      }
    });

    it("weights sum to 100", () => {
      const totalWeight = Object.values(STAGE_PROGRESS_WEIGHTS).reduce(
        (sum, w) => sum + w,
        0,
      );
      expect(totalWeight).toBe(100);
    });
  });
});
