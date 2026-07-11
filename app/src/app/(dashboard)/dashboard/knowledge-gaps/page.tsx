const highlights = [
  {
    title: "Recurring questions",
    description:
      "Surface the questions your team asks most often but cannot answer confidently.",
  },
  {
    title: "Priority recommendations",
    description:
      "Highlight the knowledge gaps that will have the biggest impact first.",
  },
  {
    title: "Suggested content",
    description:
      "Recommend the documents, FAQs, and updates that should be added next.",
  },
];

export default function KnowledgeGapsPage() {
  return (
    <DashboardPage>
      <DashboardPageHeader
        eyebrow={
          <div className="inline-flex w-fit items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-primary">
            <span className="material-symbols-outlined text-[16px]">
              psychology
            </span>
            AI insights
          </div>
        }
        title="Knowledge Gaps"
        description="Identify the missing information that keeps your team from answering questions confidently."
        actions={
          <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest px-4 py-3 text-sm shadow-sm">
            <p className="font-semibold text-on-surface">Next release</p>
            <p className="mt-1 max-w-xs text-on-surface-variant">
              Automatic gap detection and content suggestions are on the way.
            </p>
          </div>
        }
      />

      <div className="grid auto-rows-auto items-start gap-3 sm:gap-4 xl:grid-cols-[1.2fr_0.8fr] xl:gap-5">
        <DashboardPanel>
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="flex min-w-0 flex-1 items-start gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-error-container/60">
                <span className="material-symbols-outlined text-[32px] text-error">
                  troubleshoot
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-title-lg font-bold text-primary">
                  Knowledge gaps are almost here
                </h2>
                <p className="mt-2 max-w-xl text-body-md leading-relaxed text-on-surface-variant">
                  DocuMind AI will soon detect recurring questions that your
                  current knowledge base does not answer well, then suggest what
                  to add next.
                </p>
              </div>
            </div>
            <div className="inline-flex w-fit shrink-0 items-center rounded-full border border-outline-variant/40 bg-surface px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-on-surface-variant">
              Preview
            </div>
          </div>

          <div className="mt-5 grid auto-rows-auto items-start gap-3 md:grid-cols-3">
            {highlights.map((item) => (
              <div
                key={item.title}
                className="rounded-2xl border border-outline-variant/30 bg-surface-container p-4"
              >
                <p className="text-label-md font-semibold text-on-surface">
                  {item.title}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-on-surface-variant">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </DashboardPanel>

        <DashboardPanel tone="muted">
          <h3 className="text-title-md font-bold text-primary">
            What you can expect
          </h3>
          <ul className="mt-5 space-y-4 text-sm leading-relaxed text-on-surface-variant">
            <li className="flex gap-3">
              <span className="mt-0.5 shrink-0 text-primary">•</span>
              <span>
                Automatically find the questions your knowledge base leaves
                unanswered.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="mt-0.5 shrink-0 text-primary">•</span>
              <span>
                Prioritize gaps by frequency, business impact, and urgency.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="mt-0.5 shrink-0 text-primary">•</span>
              <span>
                Recommend the next content updates to close the gap quickly.
              </span>
            </li>
          </ul>

          <div className="mt-5 rounded-2xl border border-outline-variant/30 bg-surface px-4 py-3 text-sm leading-relaxed text-on-surface-variant">
            This area will become your action center for knowledge improvement
            once the feature launches.
          </div>
        </DashboardPanel>
      </div>
    </DashboardPage>
  );
}
import {
  DashboardPage,
  DashboardPageHeader,
  DashboardPanel,
} from "@/components/ui/DashboardPage";
