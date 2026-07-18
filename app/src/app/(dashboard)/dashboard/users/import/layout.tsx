"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { DashboardPage } from "@/components/ui/DashboardPage";
import { ImportErrorBoundary } from "@/components/domain/import-error-boundary";

const TABS = [
  { label: "New Import", href: "/dashboard/users/import" },
  { label: "History", href: "/dashboard/users/import/history" },
] as const;

export default function ImportLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <DashboardPage>
      <nav className="mb-6 flex items-center gap-6 border-b border-outline-variant">
        {TABS.map((tab) => {
          const isActive = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={isActive ? "page" : undefined}
              className={
                isActive
                  ? "border-b-2 border-tertiary-container pb-3 text-label-md font-bold text-primary"
                  : "pb-3 text-label-md text-on-surface-variant transition-opacity hover:text-on-surface"
              }
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
      <ImportErrorBoundary>{children}</ImportErrorBoundary>
    </DashboardPage>
  );
}
