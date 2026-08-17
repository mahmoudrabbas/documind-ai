"use client";

/**
 * Hero → first light section handoff.
 *
 * A compact dark-to-light band. The knowledge system's structural rules
 * loosen and document fragments detach, telling the "scattered sources"
 * story — then the band ends on the same light surface the next section
 * opens on. Everything here is decorative (`aria-hidden`); the statement
 * that follows lives in the light section as its opening headline.
 */

import { cn } from "@/lib/utils";
import { DocGlyph } from "./glyphs";

const FRAGS = [
  {
    label: "Procurement_Policy.pdf",
    className: "top-6 start-[22%] -rotate-[1.6deg] opacity-90",
  },
  {
    label: "Security_Policy.pdf",
    className: "top-[50px] start-[38%] rotate-[1.2deg] opacity-60",
  },
  {
    label: "Customer_Support_SLA.pdf",
    className: "top-[30px] end-[26%] rotate-[1.8deg] opacity-70",
  },
  {
    label: "P1 Incident Response",
    className: "top-[56px] end-[12%] -rotate-[1.4deg] opacity-50",
  },
  {
    label: "Role access · Dept scope · Policy",
    className: "top-[76px] start-[46%] -rotate-[0.6deg] opacity-40",
  },
];

export function HeroTransition() {
  return (
    <div className="relative h-[clamp(190px,25vw,300px)] overflow-hidden bg-gradient-to-b from-primary via-[#1c4a72] to-surface-container-lowest">
      {/* restrained cyan wash over the dark portion */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(420px_220px_at_80%_16%,rgba(99,216,218,0.07),transparent_70%)]"
      />
      {/* loosening structural rules */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute -start-5 top-[18px] h-px w-[84%] rotate-[0.5deg] bg-white/10" />
        <div className="absolute -start-5 top-[42px] h-px w-[68%] -rotate-[0.8deg] bg-white/10" />
        <div className="absolute start-[18%] top-[64px] h-px w-[52%] rotate-[1.1deg] bg-white/10" />
      </div>

      {/* document fragments detaching — plain text + glyph */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 hidden min-[560px]:block"
      >
        {FRAGS.map((frag) => (
          <span
            key={frag.label}
            className={cn(
              "absolute inline-flex items-center gap-2 whitespace-nowrap text-[13px] font-medium text-on-primary/60",
              frag.className,
            )}
          >
            <DocGlyph className="h-3.5 w-3.5 text-tertiary-fixed-dim" />
            <span dir="ltr">{frag.label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}