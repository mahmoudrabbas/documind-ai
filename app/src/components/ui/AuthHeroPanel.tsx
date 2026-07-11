// components/ui/AuthHeroPanel.tsx
//
// Standalone recreation of the Stitch "floating documents" visual:
// two floating document cards, a central AI answer bubble, and dashed
// connector lines drawn between them to suggest the assistant linking
// evidence across your documents. No client-side JS needed — the drift
// animation and the "flowing" connector dashes are both pure CSS, so this
// can stay a server component.

export function AuthHeroPanel() {
  return (
    <aside className="relative hidden flex-1 items-center justify-center overflow-hidden bg-surface-dim p-2xl lg:flex">
      {/* Dot-grid background */}
      <div
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage: "radial-gradient(#0F2A3D 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />

      {/* Oversized watermark icon */}
      <span
        className="material-symbols-outlined pointer-events-none absolute select-none text-[400px] text-primary opacity-[0.03]"
        style={{ fontVariationSettings: "'wght' 200" }}
      >
        lock
      </span>

      <div className="relative h-[600px] w-full max-w-2xl">
        {/* Connector lines — drawn first so cards sit on top */}
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full"
          viewBox="0 0 600 600"
          preserveAspectRatio="none"
        >
          <path
            d="M150 150 Q 300 250 400 300"
            fill="none"
            stroke="#0F2A3D"
            strokeWidth="2"
            strokeDasharray="4 4"
            opacity="0.2"
          />
          <path
            d="M500 500 Q 400 400 350 350"
            fill="none"
            stroke="#0F2A3D"
            strokeWidth="2"
            strokeDasharray="4 4"
            opacity="0.2"
          />
          {/* Teal "signal" traveling along the same paths — this is the
              flowing link between the cards and the AI answer. */}
          <path
            d="M150 150 Q 300 250 400 300"
            fill="none"
            stroke="#0a9fa1"
            strokeWidth="2"
            strokeDasharray="6 14"
            className="animate-flow"
          />
          <path
            d="M500 500 Q 400 400 350 350"
            fill="none"
            stroke="#0a9fa1"
            strokeWidth="2"
            strokeDasharray="6 14"
            className="animate-flow"
          />
        </svg>

        {/* Document card 1 — top left */}
        <div
          className="card-shadow animate-float absolute left-10 top-10 z-20 w-64 rounded-xl bg-white p-md"
          style={{ animationDelay: "-1s" }}
        >
          <div className="mb-sm flex items-center gap-sm">
            <span className="material-symbols-outlined text-3xl text-error">
              picture_as_pdf
            </span>
            <div className="overflow-hidden">
              <p className="truncate text-label-md text-on-surface">
                Q4_Market_Report.pdf
              </p>
              <p className="text-[10px] text-outline">Size: 4.2MB • 82 Pages</p>
            </div>
          </div>
          <div className="h-2 w-full rounded-full bg-surface-container">
            <div className="h-full w-3/4 rounded-full bg-on-tertiary-container" />
          </div>
          <p className="mt-xs text-[10px] font-bold text-on-tertiary-container">
            Parsed &amp; Indexed
          </p>
        </div>

        {/* AI answer bubble — center */}
        <div className="card-shadow animate-float ai-glow absolute left-1/2 top-1/2 z-30 w-80 -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-tertiary-container/10 p-lg">
          <div className="mb-md flex items-start gap-sm">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary">
              <span
                className="material-symbols-outlined text-sm text-white"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                smart_toy
              </span>
            </div>
            <p className="text-body-sm leading-relaxed text-primary">
              "The growth projection for 2024 is estimated at 12.5%, primarily
              driven by expansion into the EMEA region."
            </p>
          </div>
          <div className="flex items-center gap-xs rounded-lg border border-secondary-container bg-secondary-container/30 px-sm py-xs">
            <span className="material-symbols-outlined text-sm text-secondary">
              description
            </span>
            <span className="text-[11px] font-bold text-on-secondary-container">
              Source: Annual_Review.pdf (Page 42)
            </span>
          </div>
        </div>

        {/* Document card 2 — bottom right */}
        <div
          className="card-shadow animate-float absolute bottom-12 right-10 z-20 w-56 rounded-xl bg-white p-md"
          style={{ animationDelay: "-3s" }}
        >
          <div className="mb-sm flex items-center gap-sm">
            <span className="material-symbols-outlined text-3xl text-primary">
              description
            </span>
            <div className="overflow-hidden">
              <p className="truncate text-label-md text-on-surface">
                Legal_Contract_v2.doc
              </p>
              <p className="text-[10px] text-outline">Added 2h ago</p>
            </div>
          </div>
          <div className="mt-sm flex gap-xs">
            <span className="h-2 w-2 rounded-full bg-secondary" />
            <span className="h-2 w-2 rounded-full bg-secondary" />
            <span className="h-2 w-2 rounded-full bg-outline-variant" />
          </div>
        </div>
      </div>

      {/* Bottom caption */}
      <div className="absolute bottom-16 left-1/2 max-w-sm -translate-x-1/2 text-center">
        <h3 className="mb-xs text-title-lg text-primary">
          Enterprise Security First
        </h3>
        <p className="text-body-sm text-on-surface-variant">
          Your documents never leave your secure DocuMind environment. Our AI
          runs in a sandboxed private cloud.
        </p>
      </div>

      <style>{`
        .card-shadow {
          box-shadow: 0px 4px 12px rgba(15, 42, 61, 0.04);
        }
        .ai-glow {
          background: linear-gradient(135deg, #e8f7f7 0%, #ffffff 100%);
        }
        .animate-float {
          animation: auth-hero-float 6s ease-in-out infinite;
        }
        @keyframes auth-hero-float {
          0% { transform: translateY(0px); }
          50% { transform: translateY(-10px); }
          100% { transform: translateY(0px); }
        }
        .animate-flow {
          animation: auth-hero-flow 2.5s linear infinite;
        }
        @keyframes auth-hero-flow {
          to { stroke-dashoffset: -40; }
        }
        @media (prefers-reduced-motion: reduce) {
          .animate-float, .animate-flow {
            animation: none;
          }
        }
      `}</style>
    </aside>
  );
}

export default AuthHeroPanel;
