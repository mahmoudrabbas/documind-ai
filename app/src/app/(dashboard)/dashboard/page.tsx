"use client";

import { useAuth } from "@/providers/auth-provider";

export default function DashboardPage() {
  const auth = useAuth();
  
  if (auth.status !== "authenticated") return null;

  return (
    <div className="p-lg max-w-[1600px] mx-auto w-full flex-1">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4 mb-xl mt-6">
        <div>
          <h2 className="text-headline-lg font-bold text-primary">System Overview</h2>
          <p className="text-body-md text-on-surface-variant">Real-time performance and repository metrics for DocuMind AI.</p>
        </div>
        <div className="flex flex-wrap gap-sm">
          <button className="flex items-center gap-2 px-4 py-2 border border-outline rounded-lg text-label-md font-bold hover:bg-surface-container-high transition-colors">
            <span className="material-symbols-outlined text-[18px]">calendar_today</span>
            Last 24 Hours
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-secondary-container text-on-secondary-container rounded-lg text-label-md font-bold hover:opacity-90 transition-opacity">
            <span className="material-symbols-outlined text-[18px]">download</span>
            Export PDF
          </button>
        </div>
      </div>

      {/* Bento Grid Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        {/* Card 1: Total Docs */}
        <div className="col-span-1 bg-surface-container-lowest p-lg rounded-2xl shadow-sm border border-outline-variant/30 flex flex-col justify-between transition-transform hover:-translate-y-1">
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 bg-primary-container text-on-primary-container rounded-xl">
              <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>folder_open</span>
            </div>
            <span className="text-on-tertiary-container bg-tertiary-fixed-dim/20 px-2 py-1 rounded-md text-label-sm font-bold flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">trending_up</span> +12%
            </span>
          </div>
          <div>
            <p className="text-label-md text-on-surface-variant">Total Documents</p>
            <h3 className="text-display-lg font-bold text-primary leading-none">1,284</h3>
            <div className="mt-4 flex flex-wrap gap-4">
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 bg-tertiary-fixed-dim rounded-full" />
                <span className="text-label-sm text-on-surface-variant">Ready: 1,240</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 bg-secondary-fixed-dim rounded-full" />
                <span className="text-label-sm text-on-surface-variant">Processing: 44</span>
              </div>
            </div>
          </div>
        </div>

        {/* Card 2: AI Interaction */}
        <div className="col-span-1 bg-surface-container-lowest p-lg rounded-2xl shadow-sm border border-outline-variant/30 flex flex-col justify-between transition-transform hover:-translate-y-1">
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 bg-secondary-container text-on-secondary-container rounded-xl">
              <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>forum</span>
            </div>
            <span className="text-on-secondary-container bg-secondary-fixed-dim/20 px-2 py-1 rounded-md text-label-sm font-bold">
              Daily Avg: 840
            </span>
          </div>
          <div>
            <p className="text-label-md text-on-surface-variant">Total Questions</p>
            <h3 className="text-display-lg font-bold text-primary leading-none">15.2k</h3>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="p-2 bg-surface-container rounded-lg">
                <p className="text-[10px] uppercase font-bold text-on-surface-variant">Answered</p>
                <p className="text-label-md font-bold text-primary">14.8k</p>
              </div>
              <div className="p-2 bg-surface-container rounded-lg">
                <p className="text-[10px] uppercase font-bold text-on-surface-variant">Unanswered</p>
                <p className="text-label-md font-bold text-error">320</p>
              </div>
            </div>
          </div>
        </div>

        {/* Card 3: Performance */}
        <div className="col-span-1 bg-surface-container-lowest p-lg rounded-2xl shadow-sm border border-outline-variant/30 flex flex-col justify-between transition-transform hover:-translate-y-1">
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 bg-tertiary-fixed text-on-tertiary-fixed rounded-xl">
              <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>bolt</span>
            </div>
          </div>
          <div>
            <p className="text-label-md text-on-surface-variant">Avg Response Time</p>
            <h3 className="text-display-lg font-bold text-primary leading-none">1.2s</h3>
            <p className="mt-4 text-label-sm text-on-surface-variant flex items-center gap-1">
              <span className="material-symbols-outlined text-[16px] text-tertiary-fixed-dim">verified</span> Optimized via Vector Cache
            </p>
          </div>
        </div>

        {/* Card 4: Costs */}
        <div className="col-span-1 bg-surface-container-lowest p-lg rounded-2xl shadow-sm border border-outline-variant/30 flex flex-col justify-between transition-transform hover:-translate-y-1">
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 bg-primary text-on-primary rounded-xl">
              <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>payments</span>
            </div>
            <button className="text-on-primary-container text-label-sm hover:underline">Billing Details</button>
          </div>
          <div>
            <p className="text-label-md text-on-surface-variant">Estimated AI Cost</p>
            <h3 className="text-display-lg font-bold text-primary leading-none">$142.50</h3>
            <div className="mt-4 h-1.5 w-full bg-surface-container rounded-full overflow-hidden">
              <div className="h-full bg-primary w-[65%]" />
            </div>
            <p className="mt-2 text-[10px] text-on-surface-variant">65% of monthly budget reached</p>
          </div>
        </div>
        
        {/* System Health Widget */}
        <div className="col-span-1 md:col-span-2 bg-surface-container-lowest p-lg rounded-2xl shadow-sm border border-outline-variant/30">
          <div className="flex justify-between items-center mb-6">
            <h4 className="text-title-lg font-bold text-primary flex items-center gap-2">
              <span className="material-symbols-outlined">health_and_safety</span>
              System Health
            </h4>
            <span className="text-label-sm font-bold text-tertiary-fixed-dim bg-tertiary-container/30 px-3 py-1 rounded-full flex items-center gap-1">
              <span className="w-2 h-2 bg-tertiary-fixed-dim rounded-full animate-pulse" />
              All Systems Operational
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 bg-surface-container-low rounded-xl flex items-center justify-between border border-outline-variant/20">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-primary-container">api</span>
                <span className="text-body-md font-medium">API Endpoint</span>
              </div>
              <span className="text-label-md text-tertiary-fixed-dim font-bold">Online</span>
            </div>
            <div className="p-4 bg-surface-container-low rounded-xl flex items-center justify-between border border-outline-variant/20">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-primary-container">database</span>
                <span className="text-body-md font-medium">MongoDB Atlas</span>
              </div>
              <span className="text-label-md text-tertiary-fixed-dim font-bold">Connected</span>
            </div>
            <div className="p-4 bg-surface-container-low rounded-xl flex items-center justify-between border border-outline-variant/20">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-primary-container">hub</span>
                <span className="text-body-md font-medium">Vector DB</span>
              </div>
              <span className="text-label-md text-tertiary-fixed-dim font-bold">Connected</span>
            </div>
            <div className="p-4 bg-surface-container-low rounded-xl flex items-center justify-between border border-outline-variant/20">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-primary-container">psychology_alt</span>
                <span className="text-body-md font-medium">LLM Provider</span>
              </div>
              <span className="text-label-md text-tertiary-fixed-dim font-bold">Active</span>
            </div>
          </div>
        </div>

        {/* Recent Activity Feed */}
        <div className="col-span-1 md:col-span-2 bg-surface-container-lowest p-lg rounded-2xl shadow-sm border border-outline-variant/30 flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <h4 className="text-title-lg font-bold text-primary flex items-center gap-2">
              <span className="material-symbols-outlined">history</span>
              Recent Activity
            </h4>
            <button className="text-on-primary-container text-label-md hover:underline">View All</button>
          </div>
          <div className="space-y-4 flex-1">
            <div className="flex gap-4 p-3 hover:bg-surface-container-low rounded-xl transition-colors cursor-pointer">
              <div className="w-10 h-10 rounded-full bg-secondary-container flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-on-secondary-container text-[20px]">upload_file</span>
              </div>
              <div className="flex-1">
                <p className="text-body-sm text-on-surface"><span className="font-bold">Sarah Jenkins</span> uploaded <span className="text-primary font-medium underline">Q4_Financial_Report.pdf</span></p>
                <p className="text-[12px] text-on-surface-variant mt-0.5">8 minutes ago • 14.2 MB • Processing</p>
              </div>
              <span className="w-2 h-2 bg-secondary-fixed-dim rounded-full self-center" />
            </div>
            
            <div className="flex gap-4 p-3 hover:bg-surface-container-low rounded-xl transition-colors cursor-pointer">
              <div className="w-10 h-10 rounded-full bg-tertiary-container flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-on-tertiary-container text-[20px]">question_answer</span>
              </div>
              <div className="flex-1">
                <p className="text-body-sm text-on-surface"><span className="font-bold">Mark Thompson</span> asked: "What are our compliance protocols for GDPR?"</p>
                <p className="text-[12px] text-on-surface-variant mt-0.5">22 minutes ago • Source: Compliance_Manual_v2.pdf</p>
              </div>
              <span className="w-2 h-2 bg-tertiary-fixed-dim rounded-full self-center" />
            </div>
          </div>
        </div>
      </div>

      {/* AI Insight Section */}
      <section className="mt-xl p-lg bg-primary-container rounded-3xl relative overflow-hidden text-on-primary min-h-[200px] flex items-center">
        <div className="relative z-10 flex flex-col md:flex-row items-center gap-xl w-full">
          <div className="flex-1">
            <span className="bg-tertiary text-on-tertiary px-3 py-1 rounded-full text-label-sm font-bold mb-4 inline-block">
              AI SUGGESTION
            </span>
            <h3 className="text-headline-lg font-bold mb-2">Knowledge Gaps Detected</h3>
            <p className="text-body-md text-on-primary-container max-w-xl">
              Users are frequently asking about "Project Phoenix" which has 0 relevant documents. Consider uploading the project charter to improve response accuracy.
            </p>
          </div>
          <button className="bg-surface text-primary px-8 py-4 rounded-2xl text-label-md font-bold shadow-xl hover:bg-secondary-container transition-all hover:scale-105">
            Address Gaps Now
          </button>
        </div>
      </section>
      
      <footer className="p-lg mt-xl border-t border-outline-variant/30 flex flex-col sm:flex-row justify-between items-center text-on-surface-variant gap-4">
        <p className="text-label-sm">© {new Date().getFullYear()} DocuMind AI Enterprise. All rights reserved.</p>
        <div className="flex gap-lg">
          <a className="text-label-sm hover:text-primary transition-colors" href="#">Privacy Policy</a>
          <a className="text-label-sm hover:text-primary transition-colors" href="#">Terms of Service</a>
          <a className="text-label-sm hover:text-primary transition-colors" href="#">Support</a>
        </div>
      </footer>
    </div>
  );
}
