import type { CSSProperties } from "react";

type LeadHunterLogoProps = {
  className?: string;
  showWordmark?: boolean;
  size?: "sm" | "md" | "lg";
};

const LOGO_SIZES = {
  sm: { icon: 32, wordmark: "text-base" },
  md: { icon: 38, wordmark: "text-lg" },
  lg: { icon: 46, wordmark: "text-xl" },
} as const;

export default function LeadHunterLogo({
  className = "",
  showWordmark = true,
  size = "md",
}: LeadHunterLogoProps) {
  const dimensions = LOGO_SIZES[size];
  const iconStyle = {
    "--logo-size": `${dimensions.icon}px`,
  } as CSSProperties;

  return (
    <span
      className={`inline-flex min-w-0 items-center gap-2.5 ${className}`}
      aria-label={showWordmark ? "LeadHunter" : "LeadHunter home"}
    >
      <svg
        aria-hidden="true"
        className="h-[var(--logo-size)] w-[var(--logo-size)] shrink-0"
        style={iconStyle}
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="leadhunter-pin" x1="8" y1="5" x2="37" y2="41" gradientUnits="userSpaceOnUse">
            <stop stopColor="#2B7FFF" />
            <stop offset="1" stopColor="#0B4FDB" />
          </linearGradient>
          <filter id="leadhunter-shadow" x="2" y="2" width="44" height="44" colorInterpolationFilters="sRGB">
            <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#1463FF" floodOpacity="0.18" />
          </filter>
        </defs>
        <path
          d="M24 4C14.61 4 7 11.45 7 20.64c0 11.98 13.18 21.24 16.05 23.12.58.38 1.32.38 1.9 0C27.82 41.88 41 32.62 41 20.64 41 11.45 33.39 4 24 4Z"
          fill="url(#leadhunter-pin)"
          filter="url(#leadhunter-shadow)"
        />
        <circle cx="24" cy="20.5" r="8.5" fill="white" fillOpacity="0.98" />
        <circle cx="24" cy="20.5" r="4.6" stroke="#1463FF" strokeWidth="2.2" />
        <circle cx="24" cy="20.5" r="1.9" fill="#1463FF" />
        <path
          d="M30.5 13.5h6v6"
          stroke="#16A34A"
          strokeWidth="2.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="m29.8 20.2 6.7-6.7"
          stroke="#16A34A"
          strokeWidth="2.7"
          strokeLinecap="round"
        />
      </svg>

      {showWordmark ? (
        <span className={`${dimensions.wordmark} whitespace-nowrap font-extrabold tracking-[-0.035em]`}>
          <span className="text-[var(--text-primary)]">Lead</span>
          <span className="text-[var(--accent)]">Hunter</span>
        </span>
      ) : null}
    </span>
  );
}
