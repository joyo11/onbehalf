"use client";

import { useEffect, useState } from "react";

type MatchScoreProps = {
  score: number;
  size?: number;
  stroke?: number;
  label?: boolean;
};

export function MatchScore({ score, size = 44, stroke = 4, label = true }: MatchScoreProps) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const color = score >= 80 ? "var(--accent)" : score >= 65 ? "#D97706" : "#9C9C9C";
  const textColor = score >= 80 ? "var(--accent-hi)" : score >= 65 ? "#A86412" : "#5C5C5C";

  const [shown, setShown] = useState(0);
  useEffect(() => {
    let raf: number;
    let start: number | null = null;
    const dur = 900;
    const step = (t: number) => {
      if (start === null) start = t;
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(Math.round(eased * score));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [score]);

  const dash = c * (shown / 100);

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#EFEDE7" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
        />
      </svg>
      {label && (
        <span
          className="absolute font-semibold tabular"
          style={{ fontSize: size * 0.32, color: textColor }}
        >
          {shown}
        </span>
      )}
    </div>
  );
}

export function MatchScoreChip({ score }: { score: number }) {
  let band: { fg: string; bg: string };
  if (score >= 85) band = { fg: "#0F766E", bg: "#E6F2F0" };
  else if (score >= 75) band = { fg: "#92400E", bg: "#FBF1DC" };
  else band = { fg: "#52525B", bg: "#F1F1EE" };
  return (
    <span
      className="inline-flex items-center justify-center min-w-[34px] h-[22px] rounded-full text-[11.5px] font-semibold tabular px-1.5"
      style={{ color: band.fg, backgroundColor: band.bg }}
    >
      {score}
    </span>
  );
}
