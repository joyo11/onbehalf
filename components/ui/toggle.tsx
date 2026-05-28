"use client";

type ToggleProps = {
  checked: boolean;
  onChange?: (next: boolean) => void;
  label?: string;
};

export function Toggle({ checked, onChange, label }: ToggleProps) {
  return (
    <button
      type="button"
      onClick={() => onChange?.(!checked)}
      className="inline-flex items-center gap-2.5 text-sm focus-ring rounded-ctrl"
    >
      <span
        className="relative w-9 h-5 rounded-full transition-colors"
        style={{ background: checked ? "var(--accent)" : "#D6D3CC" }}
      >
        <span
          className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-card transition-all"
          style={{ left: checked ? "18px" : "2px" }}
        />
      </span>
      {label && <span className="text-ink">{label}</span>}
    </button>
  );
}
