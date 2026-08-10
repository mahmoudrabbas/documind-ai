"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/Button";
import { useI18n } from "@/providers/i18n-provider";
import { codeLabel } from "@/lib/i18n/code-label";

export interface EmailPreviewData {
  subject: string;
  recipientEmail: string;
  templateId: string;
  state: string;
}

interface EmailPreviewDialogProps {
  isOpen: boolean;
  onClose: () => void;
  data: EmailPreviewData | null;
}

export function EmailPreviewDialog({ isOpen, onClose, data }: EmailPreviewDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const { t } = useI18n();

  useEffect(() => {
    if (isOpen) {
      dialogRef.current?.showModal();
    } else {
      dialogRef.current?.close();
    }
  }, [isOpen]);

  if (!isOpen || !data) return null;

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="backdrop:bg-black/50 fixed inset-0 m-auto flex w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-surface p-0 shadow-2xl backdrop:backdrop-blur-sm"
    >
      <div className="flex items-center justify-between border-b border-outline-variant p-4">
        <h2 className="text-title-lg font-bold">
          {t("emailPreview.title", { subject: data.subject })}
        </h2>
        <Button variant="ghost" onClick={onClose} aria-label={t("common.close")}>
          {t("common.close")}
        </Button>
      </div>
      <div className="flex-1 overflow-auto bg-surface-container p-6">
        <div className="mx-auto w-full max-w-[600px] rounded bg-white p-6 shadow-sm">
          <p className="mb-2 text-sm text-on-surface-variant">
            <span className="font-semibold text-on-surface">
              {t("emailPreview.recipient")}
            </span>{" "}
            {data.recipientEmail}
          </p>
          <p className="mb-2 text-sm text-on-surface-variant">
            <span className="font-semibold text-on-surface">
              {t("emailPreview.templateId")}
            </span>{" "}
            {data.templateId}
          </p>
          <p className="mb-4 text-sm text-on-surface-variant">
            <span className="font-semibold text-on-surface">
              {t("emailPreview.status")}
            </span>{" "}
            {codeLabel(t, "dashboard.emailState", data.state)}
          </p>
        </div>
      </div>
    </dialog>
  );
}
