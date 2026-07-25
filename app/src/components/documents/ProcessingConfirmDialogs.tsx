"use client";

import { ConfirmDialog } from "@/components/ui";

interface RetryConfirmDialogProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading: boolean;
  stageName?: string;
  error?: string | null;
}

export function RetryConfirmDialog({
  open,
  onConfirm,
  onCancel,
  isLoading,
  stageName,
  error,
}: RetryConfirmDialogProps) {
  return (
    <ConfirmDialog
      open={open}
      title="Retry processing?"
      description={
        stageName
          ? `Retry the "${stageName}" stage. Attempts already completed stages will be skipped.`
          : "Retry processing from the current stage. Already-completed stages will be skipped."
      }
      variant="warning"
      confirmLabel="Retry"
      cancelLabel="Cancel"
      isLoading={isLoading}
      error={error}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}

interface ReprocessConfirmDialogProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading: boolean;
  fromStage?: string;
  error?: string | null;
}

export function ReprocessConfirmDialog({
  open,
  onConfirm,
  onCancel,
  isLoading,
  fromStage,
  error,
}: ReprocessConfirmDialogProps) {
  return (
    <ConfirmDialog
      open={open}
      title="Reprocess document?"
      description={
        fromStage
          ? `Reprocess this document starting from the "${fromStage}" stage. All subsequent stages will be re-run.`
          : "Reprocess this document from scratch. All processing stages will be re-run."
      }
      variant="warning"
      confirmLabel="Reprocess"
      cancelLabel="Cancel"
      isLoading={isLoading}
      error={error}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}

interface CancelConfirmDialogProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading: boolean;
  error?: string | null;
}

export function CancelConfirmDialog({
  open,
  onConfirm,
  onCancel,
  isLoading,
  error,
}: CancelConfirmDialogProps) {
  return (
    <ConfirmDialog
      open={open}
      title="Cancel processing?"
      description="Cancel the current processing run. Completed stages will be preserved; failed stages will need to be retried or the document reprocessed."
      variant="danger"
      confirmLabel="Cancel processing"
      cancelLabel="Keep running"
      isLoading={isLoading}
      error={error}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
