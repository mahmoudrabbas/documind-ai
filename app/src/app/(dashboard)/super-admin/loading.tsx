import {
  DashboardPage,
  DashboardPageHeader,
  DashboardPanel,
} from "@/components/ui/DashboardPage";

export default function Loading() {
  return (
    <DashboardPage>
      <DashboardPageHeader title="Loading…" />
      <DashboardPanel>
        <div className="space-y-3" role="status">
          {[1, 2, 3].map((item) => (
            <div
              key={item}
              className="h-14 animate-pulse rounded-xl bg-surface-container"
            />
          ))}
          <span className="sr-only">Loading</span>
        </div>
      </DashboardPanel>
    </DashboardPage>
  );
}
