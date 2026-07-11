"use client";

import { useAuth } from "@/providers/auth-provider";
import {
  DashboardPage as DashboardPageShell,
  DashboardPageHeader,
} from "@/components/ui/DashboardPage";

export default function DashboardPage() {
  const auth = useAuth();

  if (auth.status !== "authenticated") return null;

  return (
    <DashboardPageShell>
      <DashboardPageHeader
        title="System Overview"
        description="Real-time performance and repository metrics for DocuMind AI."
        actions={
          <div className="grid w-full grid-cols-1 gap-sm min-[390px]:grid-cols-2 sm:flex sm:w-auto sm:flex-wrap">
            <button className="flex min-h-10 items-center justify-center gap-2 rounded-lg border border-outline px-4 py-2 text-label-md font-bold transition-colors hover:bg-surface-container-high">
              <span className="material-symbols-outlined text-[18px]">
                calendar_today
              </span>
              Last 24 Hours
            </button>
            <button className="flex min-h-10 items-center justify-center gap-2 rounded-lg bg-secondary-container px-4 py-2 text-label-md font-bold text-on-secondary-container transition-opacity hover:opacity-90">
              <span className="material-symbols-outlined text-[18px]">
                download
              </span>
              Export PDF
            </button>
          </div>
        }
      />

      {/* Bento Grid Metrics */}
      <div className="grid min-w-0 auto-rows-auto grid-cols-1 items-start gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4 xl:gap-5">
        {/* Card 1: Total Docs */}
        <div className="col-span-1 flex min-h-0 min-w-0 flex-col rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-4 shadow-sm transition-transform hover:-translate-y-1 lg:p-5">
          <div className="mb-3 flex items-start justify-between">
            <div className="p-3 bg-primary-container text-on-primary-container rounded-xl">
              <span
                className="material-symbols-outlined"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                folder_open
              </span>
            </div>
            <span className="text-on-tertiary-container bg-tertiary-fixed-dim/20 px-2 py-1 rounded-md text-label-sm font-bold flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">
                trending_up
              </span>{" "}
              +12%
            </span>
          </div>
          <div>
            <p className="text-label-md text-on-surface-variant">
              Total Documents
            </p>
            <h3 className="break-words text-headline-lg font-bold leading-none text-primary sm:text-display-lg">
              1,284
            </h3>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 bg-tertiary-fixed-dim rounded-full" />
                <span className="text-label-sm text-on-surface-variant">
                  Ready: 1,240
                </span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 bg-secondary-fixed-dim rounded-full" />
                <span className="text-label-sm text-on-surface-variant">
                  Processing: 44
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Card 2: AI Interaction */}
        <div className="col-span-1 flex min-h-0 min-w-0 flex-col rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-4 shadow-sm transition-transform hover:-translate-y-1 lg:p-5">
          <div className="mb-3 flex items-start justify-between">
            <div className="p-3 bg-secondary-container text-on-secondary-container rounded-xl">
              <span
                className="material-symbols-outlined"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                forum
              </span>
            </div>
            <span className="text-on-secondary-container bg-secondary-fixed-dim/20 px-2 py-1 rounded-md text-label-sm font-bold">
              Daily Avg: 840
            </span>
          </div>
          <div>
            <p className="text-label-md text-on-surface-variant">
              Total Questions
            </p>
            <h3 className="break-words text-headline-lg font-bold leading-none text-primary sm:text-display-lg">
              15.2k
            </h3>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="p-2 bg-surface-container rounded-lg">
                <p className="text-[10px] uppercase font-bold text-on-surface-variant">
                  Answered
                </p>
                <p className="text-label-md font-bold text-primary">14.8k</p>
              </div>
              <div className="p-2 bg-surface-container rounded-lg">
                <p className="text-[10px] uppercase font-bold text-on-surface-variant">
                  Unanswered
                </p>
                <p className="text-label-md font-bold text-error">320</p>
              </div>
            </div>
          </div>
        </div>

        {/* Card 3: Performance */}
        <div className="col-span-1 flex min-h-0 min-w-0 flex-col rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-4 shadow-sm transition-transform hover:-translate-y-1 lg:p-5">
          <div className="mb-3 flex items-start justify-between">
            <div className="p-3 bg-tertiary-fixed text-on-tertiary-fixed rounded-xl">
              <span
                className="material-symbols-outlined"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                bolt
              </span>
            </div>
          </div>
          <div>
            <p className="text-label-md text-on-surface-variant">
              Avg Response Time
            </p>
            <h3 className="break-words text-headline-lg font-bold leading-none text-primary sm:text-display-lg">
              1.2s
            </h3>
            <p className="mt-3 flex items-center gap-1 text-label-sm text-on-surface-variant">
              <span className="material-symbols-outlined text-[16px] text-tertiary-fixed-dim">
                verified
              </span>{" "}
              Optimized via Vector Cache
            </p>
          </div>
        </div>

        {/* Card 4: Costs */}
        <div className="col-span-1 flex min-h-0 min-w-0 flex-col rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-4 shadow-sm transition-transform hover:-translate-y-1 lg:p-5">
          <div className="mb-3 flex items-start justify-between">
            <div className="p-3 bg-primary text-on-primary rounded-xl">
              <span
                className="material-symbols-outlined"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                payments
              </span>
            </div>
            <button className="text-on-primary-container text-label-sm hover:underline">
              Billing Details
            </button>
          </div>
          <div>
            <p className="text-label-md text-on-surface-variant">
              Estimated AI Cost
            </p>
            <h3 className="break-words text-headline-lg font-bold leading-none text-primary sm:text-display-lg">
              $142.50
            </h3>
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-container">
              <div className="h-full bg-primary w-[65%]" />
            </div>
            <p className="mt-2 text-[10px] text-on-surface-variant">
              65% of monthly budget reached
            </p>
          </div>
        </div>

        {/* System Health Widget */}
        <div className="col-span-1 min-h-0 min-w-0 rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-4 shadow-sm sm:col-span-2 lg:p-5">
          <div className="mb-4 flex min-w-0 flex-col gap-3 min-[390px]:flex-row min-[390px]:items-center min-[390px]:justify-between">
            <h2 className="flex min-w-0 items-center gap-2 text-title-lg font-bold text-primary">
              <span className="material-symbols-outlined">
                health_and_safety
              </span>
              System Health
            </h2>
            <span className="flex w-fit items-center gap-1 rounded-full bg-tertiary-container/30 px-3 py-1 text-label-sm font-bold text-tertiary-fixed-dim">
              <span className="w-2 h-2 bg-tertiary-fixed-dim rounded-full animate-pulse" />
              All Systems Operational
            </span>
          </div>
          <div className="grid auto-rows-auto grid-cols-1 items-start gap-3 sm:grid-cols-2">
            <div className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-outline-variant/20 bg-surface-container-low p-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="material-symbols-outlined text-primary-container">
                  api
                </span>
                <span className="min-w-0 break-words text-body-md font-medium">
                  API Endpoint
                </span>
              </div>
              <span className="text-label-md text-tertiary-fixed-dim font-bold">
                Online
              </span>
            </div>
            <div className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-outline-variant/20 bg-surface-container-low p-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="material-symbols-outlined text-primary-container">
                  database
                </span>
                <span className="text-body-md font-medium">MongoDB Atlas</span>
              </div>
              <span className="text-label-md text-tertiary-fixed-dim font-bold">
                Connected
              </span>
            </div>
            <div className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-outline-variant/20 bg-surface-container-low p-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="material-symbols-outlined text-primary-container">
                  hub
                </span>
                <span className="text-body-md font-medium">Vector DB</span>
              </div>
              <span className="text-label-md text-tertiary-fixed-dim font-bold">
                Connected
              </span>
            </div>
            <div className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-outline-variant/20 bg-surface-container-low p-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="material-symbols-outlined text-primary-container">
                  psychology_alt
                </span>
                <span className="text-body-md font-medium">LLM Provider</span>
              </div>
              <span className="text-label-md text-tertiary-fixed-dim font-bold">
                Active
              </span>
            </div>
          </div>
        </div>

        {/* Recent Activity Feed */}
        <div className="col-span-1 flex min-h-0 min-w-0 flex-col rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-4 shadow-sm sm:col-span-2 lg:p-5">
          <div className="mb-4 flex min-w-0 items-center justify-between gap-3">
            <h4 className="text-title-lg font-bold text-primary flex items-center gap-2">
              <span className="material-symbols-outlined">history</span>
              Recent Activity
            </h4>
            <button className="text-on-primary-container text-label-md hover:underline">
              View All
            </button>
          </div>
          <div className="space-y-2">
            <div className="flex gap-4 p-3 hover:bg-surface-container-low rounded-xl transition-colors cursor-pointer">
              <div className="w-10 h-10 rounded-full bg-secondary-container flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-on-secondary-container text-[20px]">
                  upload_file
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-body-sm text-on-surface leading-relaxed">
                  <span className="font-bold">Sarah Jenkins</span> uploaded{" "}
                  <span className="text-primary font-medium underline">
                    Q4_Financial_Report.pdf
                  </span>
                </p>
                <p className="text-[12px] text-on-surface-variant mt-0.5">
                  8 minutes ago • 14.2 MB • Processing
                </p>
              </div>
              <span className="w-2 h-2 bg-secondary-fixed-dim rounded-full self-center shrink-0" />
            </div>

            <div className="flex gap-4 p-3 hover:bg-surface-container-low rounded-xl transition-colors cursor-pointer">
              <div className="w-10 h-10 rounded-full bg-tertiary-container flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-on-tertiary-container text-[20px]">
                  question_answer
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-body-sm text-on-surface leading-relaxed">
                  <span className="font-bold">Mark Thompson</span> asked: What
                  are our compliance protocols for GDPR?
                </p>
                <p className="text-[12px] text-on-surface-variant mt-0.5">
                  22 minutes ago • Source: Compliance_Manual_v2.pdf
                </p>
              </div>
              <span className="w-2 h-2 bg-tertiary-fixed-dim rounded-full self-center shrink-0" />
            </div>

            <div className="flex gap-4 p-3 hover:bg-surface-container-low rounded-xl transition-colors cursor-pointer">
              <div className="w-10 h-10 rounded-full bg-primary-container flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-on-primary-container text-[20px]">
                  person_add
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-body-sm text-on-surface leading-relaxed">
                  <span className="font-bold">System Admin</span> added{" "}
                  <span className="font-medium">Jessica Wu</span> to the
                  Engineering group.
                </p>
                <p className="text-[12px] text-on-surface-variant mt-0.5">
                  1 hour ago
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* AI Insight Section */}
      <section className="relative mt-6 min-w-0 overflow-hidden rounded-3xl bg-primary-container p-4 text-on-primary sm:p-lg lg:mt-8 lg:p-xl">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center gap-lg w-full">
          <div className="flex min-w-0 flex-1 items-start gap-4">
            <div className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-tertiary text-on-tertiary sm:flex">
              <span
                className="material-symbols-outlined"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                auto_awesome
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <span className="inline-block bg-tertiary text-on-tertiary px-3 py-1 rounded-full text-label-sm font-bold mb-3">
                AI SUGGESTION
              </span>
              <h3 className="text-headline-md font-bold mb-2">
                Knowledge Gaps Detected
              </h3>
              <p className="text-body-md leading-relaxed text-on-primary-container max-w-2xl">
                Users are frequently asking about Project Phoenix, which has 0
                relevant documents. Consider uploading the project charter to
                improve response accuracy.
              </p>
            </div>
          </div>
          <button className="w-full shrink-0 bg-surface text-primary px-8 py-4 rounded-2xl text-label-md font-bold shadow-xl hover:bg-secondary-container transition-all hover:scale-105 md:w-auto">
            Address Gaps Now
          </button>
        </div>
      </section>

      <footer className="mt-8 flex min-w-0 flex-col items-center justify-between gap-4 border-t border-outline-variant/30 px-0 py-6 text-center text-on-surface-variant sm:flex-row sm:text-start">
        <p className="text-label-sm">
          © {new Date().getFullYear()} DocuMind AI Enterprise. All rights
          reserved.
        </p>
        <div className="flex flex-wrap justify-center gap-x-lg gap-y-2 sm:justify-end">
          <a
            href="#"
            className="text-label-sm hover:text-primary transition-colors"
          >
            Privacy Policy
          </a>
          <a
            href="#"
            className="text-label-sm hover:text-primary transition-colors"
          >
            Terms of Service
          </a>
          <a
            href="#"
            className="text-label-sm hover:text-primary transition-colors"
          >
            Support
          </a>
        </div>
      </footer>
    </DashboardPageShell>
  );
}
