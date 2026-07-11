export default function AnalyticsPage() {
  return (
    <main className="p-lg max-w-[1600px] mx-auto w-full flex-1">
      <div className="mb-xl mt-6">
        <h1 className="text-headline-lg font-bold text-primary">
          Performance Analytics
        </h1>
        <p className="mt-2 max-w-2xl text-body-md leading-relaxed text-on-surface-variant">
          Real-time insights across your knowledge ecosystem.
        </p>
      </div>

      <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-3xl p-xl flex flex-col items-center justify-center min-h-[400px] shadow-sm">
        <div className="w-20 h-20 bg-secondary-container/50 rounded-full flex items-center justify-center mb-6">
          <span className="material-symbols-outlined text-[40px] text-secondary">
            bar_chart
          </span>
        </div>
        <h2 className="text-title-lg font-bold text-primary mb-2">
          Analytics Dashboard Coming Soon
        </h2>
        <p className="text-body-md leading-relaxed text-on-surface-variant max-w-md text-center">
          We're building powerful new visualization tools to help you track
          knowledge gaps, user engagement, and document usage.
        </p>
      </div>
    </main>
  );
}
