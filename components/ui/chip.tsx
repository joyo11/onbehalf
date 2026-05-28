import type { ReactNode } from "react";

type ChipProps = {
  children: ReactNode;
  onRemove?: () => void;
  tone?: "neutral" | "accent";
};

export function Chip({ children, onRemove, tone = "neutral" }: ChipProps) {
  const accentStyle = tone === "accent" ? { background: "var(--accent-soft)", color: "var(--accent-hi)" } : undefined;
  const toneCls = tone === "accent" ? "" : "bg-[#F2F1EC] text-ink";
  return (
    <span
      className={`inline-flex items-center gap-1.5 h-7 px-2.5 text-[12.5px] font-medium rounded-ctrl ${toneCls}`}
      style={accentStyle}
    >
      {children}
      {onRemove && (
        <button
          onClick={onRemove}
          className="text-mute hover:text-ink leading-none -mr-0.5 text-[15px]"
          aria-label="Remove"
        >
          ×
        </button>
      )}
    </span>
  );
}
