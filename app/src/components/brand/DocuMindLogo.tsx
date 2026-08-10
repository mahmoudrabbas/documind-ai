import type { HTMLAttributes } from "react";

export type DocuMindLogoVariant = "full" | "icon";
export type DocuMindLogoTone = "default" | "on-primary";

const BRAND_NAVY = "#0b1f3a";
const BRAND_BLUE = "#1688f5";
const BRAND_DEEP_BLUE = "#0757b5";
const BRAND_LIGHT_BLUE = "#e5f2ff";

type DocuMindLogoProps = HTMLAttributes<HTMLSpanElement> & {
  variant?: DocuMindLogoVariant;
  tone?: DocuMindLogoTone;
};

function LogoMark({ tone }: { tone: DocuMindLogoTone }) {
  const documentColor = BRAND_BLUE;
  const networkColor = tone === "on-primary" ? "#ffffff" : BRAND_LIGHT_BLUE;
  const signalColor = tone === "on-primary" ? "#ffffff" : BRAND_BLUE;

  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      className="h-full w-full"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M15 5.5h12.5L35 13v24.5c0 2.2-1.8 4-4 4H15c-2.2 0-4-1.8-4-4v-28c0-2.2 1.8-4 4-4Z"
        fill={documentColor}
        stroke={BRAND_DEEP_BLUE}
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path
        d="M27.5 5.5V13H35"
        stroke={networkColor}
        strokeWidth="2.5"
        strokeLinejoin="round"
      />

      <g
        fill={signalColor}
        stroke={signalColor}
        strokeWidth="2.5"
        strokeLinecap="round"
      >
        <path d="M3.5 17h5m-5 7h5m-5 7h5" />
      </g>
      <g
        fill="none"
        stroke={networkColor}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M25 25 19 16m6 9 15-13m-15 13 17-2m-17 2 12 13m-12-13-8 9" />
      </g>
      <g fill={networkColor}>
        <circle cx="19" cy="16" r="2.8" />
        <circle cx="40" cy="12" r="2.8" />
        <circle cx="42" cy="23" r="2.8" />
        <circle cx="37" cy="38" r="2.8" />
        <circle cx="17" cy="34" r="2.8" />
        <circle cx="25" cy="25" r="4" />
      </g>
    </svg>
  );
}

export function DocuMindLogo({
  variant = "full",
  tone = "default",
  className = "",
  ...props
}: DocuMindLogoProps) {
  if (variant === "icon") {
    return (
      <span
        {...props}
        role="img"
        aria-label="DocuMind AI"
        className={`inline-flex h-8 w-8 shrink-0 ${className}`}
      >
        <LogoMark tone={tone} />
      </span>
    );
  }

  return (
    <span
      {...props}
      className={`inline-flex min-w-0 items-center gap-2.5 ${className}`}
    >
      <span className="h-9 w-9 shrink-0">
        <LogoMark tone={tone} />
      </span>
      <span
        className="truncate text-lg font-bold tracking-tight"
        style={{ color: tone === "on-primary" ? "#ffffff" : BRAND_NAVY }}
      >
        DocuMind{" "}
        <span style={{ color: tone === "on-primary" ? "#9bcfff" : BRAND_BLUE }}>
          AI
        </span>
      </span>
    </span>
  );
}

export default DocuMindLogo;
