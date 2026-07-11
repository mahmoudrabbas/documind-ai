"use client";

import Link from "next/link";
import { useI18n } from "@/providers/i18n-provider";

export default function CompanyDashboardPage() {
  const { t, dir } = useI18n();

  return (
    <main dir={dir} className="min-h-screen bg-[#001524] text-slate-100">
      <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-8 rounded-[2rem] border border-[#083256] bg-[#061e2d] p-8 shadow-sm shadow-slate-950/40">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
            <div className="space-y-3">
              <div className="inline-flex items-center rounded-full bg-blue-500/10 px-4 py-1 text-sm font-semibold text-blue-300">
                Overview
              </div>
              <div>
                <h1 className="text-3xl font-semibold tracking-tight text-white">
                  System Overview
                </h1>
                <p className="mt-2 text-sm text-slate-300">
                  Real-time performance and repository metrics for DocuMind AI.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-slate-900">
                Last 24 Hours
              </button>
              <Link
                href="/dashboard/documents"
                className="rounded-2xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-blue-500/20 transition hover:bg-blue-700"
              >
                Export PDF
              </Link>
            </div>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.4fr_0.9fr]">
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-2">
            <div className="rounded-[2rem] border border-[#083256] bg-slate-950 p-6 shadow-sm shadow-slate-950/30">
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
                Total Documents
              </p>
              <p className="mt-4 text-4xl font-semibold text-white">1,284</p>
              <div className="mt-4 flex flex-wrap gap-3 text-sm text-slate-400">
                <span className="rounded-2xl bg-slate-900 px-3 py-2">
                  Ready: 1,240
                </span>
                <span className="rounded-2xl bg-slate-900 px-3 py-2">
                  Processing: 44
                </span>
              </div>
            </div>

            <div className="rounded-[2rem] border border-[#083256] bg-slate-950 p-6 shadow-sm shadow-slate-950/30">
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
                Total Questions
              </p>
              <p className="mt-4 text-4xl font-semibold text-white">15.2k</p>
              <div className="mt-4 grid gap-2 text-sm text-slate-400 sm:grid-cols-2">
                <span className="rounded-2xl bg-slate-900 px-3 py-2">
                  Answered: 14.8k
                </span>
                <span className="rounded-2xl bg-slate-900 px-3 py-2">
                  Unanswered: 320
                </span>
              </div>
            </div>

            <div className="rounded-[2rem] border border-[#083256] bg-slate-950 p-6 shadow-sm shadow-slate-950/30">
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
                Avg Response Time
              </p>
              <p className="mt-4 text-4xl font-semibold text-white">1.2s</p>
              <p className="mt-4 text-sm text-slate-400">
                Optimized via Vector Cache
              </p>
            </div>

            <div className="rounded-[2rem] border border-[#083256] bg-slate-950 p-6 shadow-sm shadow-slate-950/30">
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
                Estimated AI Cost
              </p>
              <p className="mt-4 text-4xl font-semibold text-white">$142.50</p>
              <p className="mt-4 text-sm text-slate-400">
                65% of monthly budget reached
              </p>
            </div>
          </div>

          <div className="grid gap-6">
            <div className="rounded-[2rem] border border-[#083256] bg-slate-950 p-6 shadow-sm shadow-slate-950/30">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-white">
                    System Health
                  </p>
                  <p className="mt-1 text-sm text-slate-400">
                    All key services are operating normally.
                  </p>
                </div>
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                  All Systems Operational
                </span>
              </div>

              <div className="mt-6 grid gap-4">
                {[
                  { title: "API Endpoint", status: "Online", tone: "emerald" },
                  { title: "MongoDB Atlas", status: "Connected", tone: "sky" },
                  { title: "Vector DB", status: "Connected", tone: "sky" },
                  { title: "LLM Provider", status: "Active", tone: "emerald" },
                ].map((item) => (
                  <div
                    key={item.title}
                    className="flex items-center justify-between rounded-3xl bg-[#071c2d] px-4 py-4"
                  >
                    <div>
                      <p className="text-sm font-medium text-white">
                        {item.title}
                      </p>
                      <p className="mt-1 text-sm text-slate-400">
                        {item.title === "LLM Provider"
                          ? "OpenAI Proxy"
                          : "Service status"}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${item.tone === "emerald" ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"}`}
                    >
                      {item.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[2rem] border border-[#083256] bg-slate-950 p-6 shadow-sm shadow-slate-950/30">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-white">
                    Recent Activity
                  </p>
                  <p className="mt-1 text-sm text-slate-400">
                    Latest workspace updates and uploads.
                  </p>
                </div>
                <Link
                  href="/dashboard/users"
                  className="text-sm font-semibold text-blue-300 hover:text-blue-200"
                >
                  View All
                </Link>
              </div>

              <div className="mt-6 space-y-4">
                {[
                  {
                    title: "Sarah Jenkins uploaded Q4_Financial_Report.pdf",
                    subtitle: "8 minutes ago · 14.2 MB · Processing",
                  },
                  {
                    title:
                      "Mark Thompson asked: 'What are our compliance protocols for GDPR?'",
                    subtitle:
                      "22 minutes ago · Source: Compliance Manual v2.pdf",
                  },
                  {
                    title:
                      "System Admin added Jessica Wu to the Engineering group.",
                    subtitle: "1 hour ago",
                  },
                ].map((item) => (
                  <div
                    key={item.title}
                    className="rounded-3xl bg-[#071c2d] p-4"
                  >
                    <p className="text-sm font-semibold text-white">
                      {item.title}
                    </p>
                    <p className="mt-2 text-sm text-slate-400">
                      {item.subtitle}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-[2rem] bg-blue-950 p-8 text-white shadow-xl shadow-slate-950/30">
          <div className="grid gap-6 lg:grid-cols-[1.6fr_0.9fr] lg:items-center">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-300">
                AI suggestion
              </p>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight text-white">
                Knowledge Gaps Detected
              </h2>
              <p className="mt-3 max-w-xl text-sm text-slate-300">
                Users are frequently asking about “Project Phoenix” which has 0
                relevant documents. Consider uploading the project charter to
                improve response accuracy.
              </p>
            </div>
            <div className="flex items-center justify-end">
              <Link
                href="/dashboard/knowledge-gaps"
                className="inline-flex rounded-3xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 transition hover:bg-blue-700"
              >
                Address Gaps Now
              </Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
