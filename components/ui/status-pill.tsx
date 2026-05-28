import type { Status } from "@/lib/types";

type StatusMeta = {
  label: string;
  bg: string;
  fg: string;
  dot: string;
  pulse?: boolean;
};

export const STATUS_META: Record<Status, StatusMeta> = {
  queued: { label: "Queued", bg: "#F1F1EE", fg: "#52525B", dot: "#A1A1AA" },
  tailoring: { label: "Tailoring", bg: "#EEF6F4", fg: "#0F766E", dot: "#14B8A6", pulse: true },
  pending: { label: "Pending Review", bg: "#FBF1DC", fg: "#92400E", dot: "#D97706" },
  submitting: { label: "Submitting", bg: "#EEF1F8", fg: "#1E40AF", dot: "#3B82F6", pulse: true },
  submitted: { label: "Submitted", bg: "#E6F2F0", fg: "#0F766E", dot: "#0D9488" },
  confirmed: { label: "Confirmed", bg: "#E7F4EA", fg: "#15803D", dot: "#22C55E" },
  failed: { label: "Failed", bg: "#FBECEC", fg: "#B91C1C", dot: "#DC2626" },
  needsHuman: { label: "Needs Human", bg: "#FCEEDD", fg: "#9A3412", dot: "#F97316" },
  draft: { label: "Draft", bg: "#F1F1EE", fg: "#52525B", dot: "#A1A1AA" },
};

export const STATUSES: Status[] = [
  "queued",
  "tailoring",
  "pending",
  "submitting",
  "submitted",
  "confirmed",
  "failed",
  "needsHuman",
];

type StatusPillProps = {
  status: Status;
  size?: "sm" | "md";
  className?: string;
};

export function StatusPill({ status, size = "md", className = "" }: StatusPillProps) {
  const m = STATUS_META[status];
  const pad = size === "sm" ? "px-1.5 py-px text-[11px]" : "px-2 py-0.5 text-[12px]";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium whitespace-nowrap ${pad} ${className}`}
      style={{ backgroundColor: m.bg, color: m.fg }}
    >
      <span
        className="inline-block rounded-full"
        style={{
          width: 6,
          height: 6,
          backgroundColor: m.dot,
          animation: m.pulse ? "pulse-dot 1.6s ease-in-out infinite" : undefined,
        }}
      />
      {m.label}
    </span>
  );
}
