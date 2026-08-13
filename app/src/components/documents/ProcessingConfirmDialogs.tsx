"use client";

import { ConfirmDialog } from "@/components/ui";
import { useI18n } from "@/providers/i18n-provider";

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
  const { t } = useI18n();

  return (
    <ConfirmDialog
      open={open}
      title={t("documents.retryConfirmTitle")}
      description={
        stageName
          ? t("documents.retryConfirmWithStage", { stage: stageName })
          : t("documents.retryConfirmDefault")
      }
      variant="warning"
      confirmLabel={t("common.retry")}
      cancelLabel={t("common.cancel")}
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
  const { t } = useI18n();

  return (
    <ConfirmDialog
      open={open}
      title={t("documents.reprocessConfirmTitle")}
      description={
        fromStage
          ? t("documents.reprocessConfirmWithStage", { stage: fromStage })
          : t("documents.reprocessConfirmDefault")
      }
      variant="warning"
      confirmLabel={t("documents.reprocessConfirmAction")}
      cancelLabel={t("common.cancel")}
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
  const { t } = useI18n();

  return (
    <ConfirmDialog
      open={open}
      title={t("documents.cancelConfirmTitle")}
      description={t("documents.cancelConfirmDesc")}
      variant="danger"
      confirmLabel={t("documents.cancelConfirmAction")}
      cancelLabel={t("documents.cancelConfirmKeep")}
      isLoading={isLoading}
      error={error}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
