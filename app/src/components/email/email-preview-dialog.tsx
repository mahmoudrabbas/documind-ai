"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/Button";

export interface EmailPreviewData {
  subject: string;
  recipientEmail: string;
  templateId: string;
  state: string;
  variables: Record<string, unknown> | null;
}

interface EmailPreviewDialogProps {
  isOpen: boolean;
  onClose: () => void;
  data: EmailPreviewData | null;
}

export function EmailPreviewDialog({ isOpen, onClose, data }: EmailPreviewDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

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
        <h2 className="text-title-lg font-bold">Preview: {data.subject}</h2>
        <Button variant="ghost" onClick={onClose} aria-label="Close">
          Close
        </Button>
      </div>
      <div className="flex-1 overflow-auto bg-surface-container p-6">
        <div className="mx-auto w-full max-w-[600px] rounded bg-white p-6 shadow-sm">
          <p className="mb-2 text-sm text-on-surface-variant">
            <span className="font-semibold text-on-surface">Recipient:</span>{" "}
            {data.recipientEmail}
          </p>
          <p className="mb-2 text-sm text-on-surface-variant">
            <span className="font-semibold text-on-surface">Template ID:</span>{" "}
            {data.templateId}
          </p>
          <p className="mb-4 text-sm text-on-surface-variant">
            <span className="font-semibold text-on-surface">Status:</span>{" "}
            {data.state}
          </p>
          <h4 className="mb-2 text-sm font-semibold text-on-surface">
            Template Variables:
          </h4>
          {data.variables ? (
            <pre className="whitespace-pre-wrap rounded-lg bg-surface-container p-4 text-xs text-on-surface-variant">
              {JSON.stringify(data.variables, null, 2)}
            </pre>
          ) : (
            <p className="text-sm text-on-surface-variant">No variables available</p>
          )}
        </div>
      </div>
    </dialog>
  );
}
