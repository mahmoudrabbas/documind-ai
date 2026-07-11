"use client";

import { useI18n } from "@/providers/i18n-provider";


export function AuthHeroPanel() {
  const { t } = useI18n();

  return (
    <aside className="hidden flex-1 relative overflow-hidden items-center justify-center bg-surface-dim p-2xl lg:flex">
      {/* Background Pattern */}
      <div 
        className="absolute inset-0 opacity-20" 
        style={{ backgroundImage: "radial-gradient(#0F2A3D 1px, transparent 1px)", backgroundSize: "32px 32px" }}
      />
      {/* Large Background Icon */}
      <span 
        className="material-symbols-outlined absolute text-[400px] text-primary opacity-[0.03] select-none" 
        style={{ fontVariationSettings: "'wght' 200" }}
      >
        lock
      </span>
      
      {/* Floating UI Elements */}
      <div className="relative w-full max-w-2xl h-[600px]">
        {/* Document Card 1 */}
        <div className="absolute top-10 left-10 w-64 bg-white p-md rounded-xl shadow-card z-20 transition-transform hover:-translate-y-1">
          <div className="flex items-center gap-sm mb-sm">
            <span className="material-symbols-outlined text-error text-3xl">picture_as_pdf</span>
            <div className="overflow-hidden">
              <p className="font-medium text-label-md text-on-surface truncate">Q4_Market_Report.pdf</p>
              <p className="text-[10px] text-outline">Size: 4.2MB • 82 Pages</p>
            </div>
          </div>
          <div className="h-2 bg-surface-container rounded-full w-full">
            <div className="h-full bg-on-tertiary-container rounded-full w-3/4" />
          </div>
          <p className="text-[10px] text-on-tertiary-container font-bold mt-xs">Parsed & Indexed</p>
        </div>

        {/* AI Chat Bubble */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 bg-surface-bright/80 backdrop-blur border border-tertiary-container/10 p-lg rounded-2xl shadow-card z-30 transition-transform hover:scale-[1.02]">
          <div className="flex items-start gap-sm mb-md">
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-white text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>smart_toy</span>
            </div>
            <div>
              <p className="text-body-sm text-primary leading-relaxed">
                "The growth projection for 2024 is estimated at 12.5%, primarily driven by expansion into the EMEA region."
              </p>
            </div>
          </div>
          <div className="flex items-center gap-xs px-sm py-xs bg-secondary-container/30 border border-secondary-container rounded-lg">
            <span className="material-symbols-outlined text-secondary text-sm">description</span>
            <span className="text-[11px] font-bold text-on-secondary-container">Source: Annual_Review.pdf (Page 42)</span>
          </div>
        </div>

        {/* Document Card 2 */}
        <div className="absolute bottom-12 right-10 w-56 bg-white p-md rounded-xl shadow-card z-20 transition-transform hover:-translate-y-1">
          <div className="flex items-center gap-sm mb-sm">
            <span className="material-symbols-outlined text-primary text-3xl">description</span>
            <div className="overflow-hidden">
              <p className="font-medium text-label-md text-on-surface truncate">Legal_Contract_v2.doc</p>
              <p className="text-[10px] text-outline">Added 2h ago</p>
            </div>
          </div>
          <div className="flex gap-xs mt-sm">
            <span className="w-2 h-2 rounded-full bg-secondary" />
            <span className="w-2 h-2 rounded-full bg-secondary" />
            <span className="w-2 h-2 rounded-full bg-outline-variant" />
          </div>
        </div>

        {/* Connecting "Intelligence" Lines */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-20" xmlns="http://www.w3.org/2000/svg">
          <path d="M150 150 Q 300 250 400 300" fill="none" stroke="#0F2A3D" strokeDasharray="4 4" strokeWidth="2" />
          <path d="M500 500 Q 400 400 350 350" fill="none" stroke="#0F2A3D" strokeDasharray="4 4" strokeWidth="2" />
        </svg>
      </div>

      {/* Bottom Quote/Feature */}
      <div className="absolute bottom-16 left-1/2 -translate-x-1/2 text-center max-w-sm">
        <h3 className="text-title-lg font-bold text-primary mb-xs">Enterprise Security First</h3>
        <p className="text-body-sm text-on-surface-variant">
          Your documents never leave your secure DocuMind environment. Our AI runs in a sandboxed private cloud.
        </p>
      </div>
    </aside>
  );
}
