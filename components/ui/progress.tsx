type ProgressProps = {
  value?: number;
  max?: number;
  className?: string;
};

export function Progress({ value = 0, max = 100, className = "" }: ProgressProps) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className={`h-1.5 w-full rounded-full bg-[#EFEDE7] overflow-hidden ${className}`}>
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${pct}%`, background: "var(--accent)" }}
      />
    </div>
  );
}
