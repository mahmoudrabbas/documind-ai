import {
  DashboardPage,
  DashboardPageHeader,
  DashboardPanel,
} from "@/components/ui/DashboardPage";

export default function AnalyticsPage() {
  return (
    <DashboardPage>
      <DashboardPageHeader
        title="Performance Analytics"
        description="Real-time insights across your knowledge ecosystem."
      />

      <DashboardPanel className="flex flex-col items-center py-8 text-center sm:py-10">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-secondary-container/50">
          <span className="material-symbols-outlined text-[40px] text-secondary">
            bar_chart
          </span>
        </div>
        <h2 className="mb-2 text-title-lg font-bold text-primary">
          Analytics Dashboard Coming Soon
        </h2>
        <p className="max-w-md text-body-md leading-relaxed text-on-surface-variant">
          We are building powerful new visualization tools to help you track
          knowledge gaps, user engagement, and document usage.
        </p>
      </DashboardPanel>
    </DashboardPage>
  );
}
