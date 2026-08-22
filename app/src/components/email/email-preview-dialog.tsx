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
  createdAt?: string;
  scheduledFor?: string | null;
  sentAt?: string | null;
  lastAttemptAt?: string | null;
  attemptCount?: number;
  providerMessageId?: string | null;
  correlationId?: string | null;
  errorCategory?: string | null;
  attempts?: Array<{ attemptNumber: number; state: string; startedAt: string; completedAt?: string | null }>;
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
          <dl className="grid grid-cols-1 gap-2 border-t border-outline-variant pt-4 text-sm text-on-surface-variant sm:grid-cols-2">
            {data.createdAt ? <div><dt className="font-semibold text-on-surface">Created</dt><dd>{new Date(data.createdAt).toLocaleString()}</dd></div> : null}
            {data.scheduledFor ? <div><dt className="font-semibold text-on-surface">Scheduled</dt><dd>{new Date(data.scheduledFor).toLocaleString()}</dd></div> : null}
            {data.sentAt ? <div><dt className="font-semibold text-on-surface">Sent</dt><dd>{new Date(data.sentAt).toLocaleString()}</dd></div> : null}
            {data.lastAttemptAt ? <div><dt className="font-semibold text-on-surface">Last attempt</dt><dd>{new Date(data.lastAttemptAt).toLocaleString()}</dd></div> : null}
            {data.attemptCount !== undefined ? <div><dt className="font-semibold text-on-surface">Attempts</dt><dd>{data.attemptCount}</dd></div> : null}
            {data.providerMessageId ? <div><dt className="font-semibold text-on-surface">Provider message ID</dt><dd>{data.providerMessageId}</dd></div> : null}
            {data.correlationId ? <div><dt className="font-semibold text-on-surface">Trace / correlation ID</dt><dd>{data.correlationId}</dd></div> : null}
            {data.errorCategory ? <div><dt className="font-semibold text-on-surface">Failure category</dt><dd>{data.errorCategory}</dd></div> : null}
          </dl>
          {data.attempts?.length ? <div className="mt-4 border-t border-outline-variant pt-4 text-sm text-on-surface-variant"><p className="font-semibold text-on-surface">Attempts</p>{data.attempts.map((attempt) => <p key={attempt.attemptNumber}>#{attempt.attemptNumber} — {attempt.state}</p>)}</div> : null}
        </div>
      </div>
    </dialog>
  );
}
