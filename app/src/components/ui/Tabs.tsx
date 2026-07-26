"use client";

import { createContext, useCallback, useContext, useRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface TabsContextValue {
  active: string;
  onSelect: (id: string) => void;
}

const TabsContext = createContext<TabsContextValue>({ active: "", onSelect: () => {} });

export interface TabsProps {
  active: string;
  onChange: (id: string) => void;
  children: ReactNode;
  /** Optional content rendered after the tab bar but still inside the context provider (e.g. TabPanels). */
  panels?: ReactNode;
  className?: string;
  /** Optional aria-label for the tablist. */
  ariaLabel?: string;
}

export function Tabs({ active, onChange, children, panels, className, ariaLabel }: TabsProps) {
  return (
    <TabsContext.Provider value={{ active, onSelect: onChange }}>
      <div role="tablist" aria-label={ariaLabel} className={cn("flex gap-1 overflow-x-auto scrollbar-none", className)}>
        {children}
      </div>
      {panels}
    </TabsContext.Provider>
  );
}

export interface TabProps {
  id: string;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  /** Optional leading icon name. */
  icon?: string;
}

export function Tab({ id, children, className, disabled, icon }: TabProps) {
  const { active, onSelect } = useContext(TabsContext);
  const isActive = active === id;
  const ref = useRef<HTMLButtonElement>(null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onSelect(id);
      }
    },
    [id, onSelect],
  );

  return (
    <button
      ref={ref}
      role="tab"
      id={`tab-${id}`}
      aria-selected={isActive}
      aria-controls={`tabpanel-${id}`}
      tabIndex={isActive ? 0 : -1}
      disabled={disabled}
      onClick={() => onSelect(id)}
      onKeyDown={handleKeyDown}
      className={cn(
        "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-3.5 py-2 text-label-md font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2",
        isActive
          ? "bg-primary text-on-primary shadow-sm"
          : "text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface",
        disabled && "pointer-events-none opacity-50",
        className,
      )}
    >
      {icon ? (
        <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      {children}
    </button>
  );
}

export interface TabPanelProps {
  id: string;
  children: ReactNode;
  className?: string;
}

export function TabPanel({ id, children, className }: TabPanelProps) {
  const { active } = useContext(TabsContext);
  if (active !== id) return null;
  return (
    <div
      role="tabpanel"
      id={`tabpanel-${id}`}
      aria-labelledby={`tab-${id}`}
      tabIndex={0}
      className={cn("focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2", className)}
    >
      {children}
    </div>
  );
}
