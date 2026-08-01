"use client";

import { cn } from "@/lib/utils";

interface CopilotTriggerProps {
  open: boolean;
  onClick: () => void;
}

export function CopilotTrigger({ open, onClick }: CopilotTriggerProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full shadow-modal transition-all duration-200 hover:scale-105 active:scale-95",
        open
          ? "bg-surface-container-high text-on-surface-variant"
          : "bg-primary text-on-primary",
      )}
      aria-label={open ? "Close copilot" : "Open AI Copilot"}
    >
      {open ? (
        <span className="material-symbols-outlined text-2xl">close</span>
      ) : (
        <span className="material-symbols-outlined text-2xl">smart_toy</span>
      )}
    </button>
  );
}
