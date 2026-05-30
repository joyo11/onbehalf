"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/* ── Logo ────────────────────────────────────────────────────── */
export function ObLogo({ className = "", dot = true }: { className?: string; dot?: boolean }) {
  return (
    <div className={"flex items-center " + className}>
      <span
        className="font-display font-black tracking-tight"
        style={{ fontSize: "1.45rem", letterSpacing: "-0.02em" }}
      >
        onbehalf
      </span>
      {dot && (
        <span className="ml-[2px] mt-2 h-[6px] w-[6px] rounded-full bg-teal-500 self-end" />
      )}
    </div>
  );
}

/* ── Eyebrow ─────────────────────────────────────────────────── */
export function Eyebrow({
  children,
  className = "",
  tone = "mute",
}: {
  children: ReactNode;
  className?: string;
  tone?: "mute" | "teal" | "panel";
}) {
  const c = tone === "teal" ? "text-teal-600" : tone === "panel" ? "text-panel-dim" : "text-ink-faint";
  return (
    <p className={"text-[11px] font-bold uppercase tracking-[0.15em] " + c + " " + className}>
      {children}
    </p>
  );
}

/* ── Company avatar tile ─────────────────────────────────────── */
export function CompanyTile({
  letter,
  color,
  size = 44,
  radius = 12,
}: {
  letter: string;
  color: string;
  size?: number;
  radius?: number;
}) {
  return (
    <div
      className="flex items-center justify-center font-display font-bold text-white shrink-0"
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: color,
        fontSize: size * 0.42,
      }}
    >
      {letter}
    </div>
  );
}

export const BRAND: Record<string, { letter: string; color: string }> = {
  Linear: { letter: "L", color: "#5E6AD2" },
  GitLab: { letter: "G", color: "#2B3550" },
  Reddit: { letter: "R", color: "#2E5E3A" },
  Datadog: { letter: "D", color: "#6C4FD6" },
  Anthropic: { letter: "A", color: "#D4744A" },
  Asana: { letter: "A", color: "#F06A6A" },
  Stripe: { letter: "S", color: "#635BFF" },
  Notion: { letter: "N", color: "#2F2F2F" },
};

export function brandFor(company: string): { letter: string; color: string } {
  if (BRAND[company]) return BRAND[company];
  const palette = ["#5E6AD2", "#2B3550", "#2E5E3A", "#6C4FD6", "#D4744A", "#635BFF", "#0D9488", "#7A8B3F"];
  let h = 0;
  for (let i = 0; i < company.length; i++) h = (h * 31 + company.charCodeAt(i)) >>> 0;
  return {
    letter: (company[0] ?? "?").toUpperCase(),
    color: palette[h % palette.length],
  };
}

/* ── Handwritten ribbon ─────────────────────────────────────── */
export function HandNote({
  children,
  className = "",
  sign,
  tilt = -2.5,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  sign?: string;
  tilt?: number;
  delay?: number;
}) {
  return (
    <div
      className={"inline-flex flex-col ob-hand-in " + className}
      style={{ transform: `rotate(${tilt}deg)`, transitionDelay: delay + "ms" }}
    >
      <span className="font-hand text-teal-700 leading-[1.05]" style={{ fontSize: "1.7rem" }}>
        {children}
      </span>
      {sign && (
        <span className="font-hand text-ink-mute self-end mt-0.5" style={{ fontSize: "1.25rem" }}>
          {sign}
        </span>
      )}
    </div>
  );
}

/* ── StatusPill (morphing colors per state) ─────────────────── */
export type Status =
  | "matching"
  | "queued"
  | "tailoring"
  | "submitting"
  | "submitted"
  | "confirmed"
  | "needshuman"
  | "failed"
  | "draft"
  | "pending";

export const STATUS_META: Record<
  Status,
  { label: string; dot: string; bg: string; fg: string; pulse?: boolean; solid?: boolean }
> = {
  matching: { label: "Matching", dot: "#928C7B", bg: "#EDE7D6", fg: "#6B6859" },
  queued: { label: "Queued", dot: "#928C7B", bg: "#EDE7D6", fg: "#6B6859" },
  pending: { label: "Pending", dot: "#928C7B", bg: "#EDE7D6", fg: "#6B6859" },
  draft: { label: "Draft", dot: "#928C7B", bg: "#EDE7D6", fg: "#6B6859" },
  tailoring: { label: "Tailoring", dot: "#D97706", bg: "#FAE3C4", fg: "#B45F09" },
  submitting: { label: "Submitting", dot: "#0D9488", bg: "#CFF4EB", fg: "#0A6F66", pulse: true },
  submitted: { label: "Submitted", dot: "#FFFFFF", bg: "#0D9488", fg: "#FFFFFF", solid: true },
  confirmed: { label: "Confirmed", dot: "#7A8B3F", bg: "#E2E7C7", fg: "#54612C" },
  needshuman: { label: "Needs Human", dot: "#C53D2B", bg: "#F6D2C5", fg: "#A8341F" },
  failed: { label: "Failed", dot: "#C53D2B", bg: "#F6D2C5", fg: "#A8341F" },
};

export function StatusPill({ status, size = "md" }: { status: Status | string; size?: "sm" | "md" }) {
  const key = (status === "needsHuman" ? "needshuman" : status) as Status;
  const s = STATUS_META[key] ?? STATUS_META.queued;
  const pad = size === "sm" ? "px-2.5 py-1 text-[12px]" : "px-3 py-1.5 text-[13px]";
  return (
    <span
      className={
        "inline-flex items-center gap-2 rounded-full font-semibold whitespace-nowrap " +
        pad +
        (s.pulse ? " ob-pulse" : "")
      }
      style={{
        background: s.bg,
        color: s.fg,
        transition: "background-color 600ms ease, color 600ms ease",
      }}
    >
      <span
        className="h-2 w-2 rounded-full"
        style={{ background: s.dot, transition: "background-color 600ms ease" }}
      />
      {s.label}
    </span>
  );
}

/* ── Count-up hook ──────────────────────────────────────────── */
export function useCountUp(target: number, { duration = 800, start = true }: { duration?: number; start?: boolean } = {}) {
  const [val, setVal] = useState(0);
  const raf = useRef<number | null>(null);
  useEffect(() => {
    if (!start) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setVal(target);
      return;
    }
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(Math.round(eased * target));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [target, start, duration]);
  return val;
}

/* ── Confetti burst ─────────────────────────────────────────── */
type ConfettiPiece = {
  id: string;
  left: number;
  dx: string;
  dy: string;
  dr: string;
  delay: number;
  color: string;
  w: number;
  h: number;
  round: boolean;
};

export function ConfettiBurst({ fire }: { fire: boolean }) {
  const [pieces, setPieces] = useState<ConfettiPiece[]>([]);
  useEffect(() => {
    if (!fire) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const colors = ["#0D9488", "#9FE7D7", "#7A8B3F", "#D97706", "#1C1B17", "#E2E7C7"];
    const n = reduce ? 0 : 30;
    const arr: ConfettiPiece[] = Array.from({ length: n }).map((_, i) => {
      const ang = Math.random() * Math.PI - Math.PI / 2;
      const dist = 120 + Math.random() * 180;
      return {
        id: i + "-" + Date.now(),
        left: 50 + (Math.random() * 30 - 15),
        dx: Math.cos(ang) * dist * (Math.random() > 0.5 ? 1 : -1) + "px",
        dy: 140 + Math.random() * 220 + "px",
        dr: Math.random() * 720 - 360 + "deg",
        delay: Math.random() * 120,
        color: colors[i % colors.length],
        w: 6 + Math.random() * 6,
        h: 8 + Math.random() * 8,
        round: Math.random() > 0.6,
      };
    });
    setPieces(arr);
    const to = setTimeout(() => setPieces([]), 1800);
    return () => clearTimeout(to);
  }, [fire]);
  if (!pieces.length) return null;
  return (
    <div className="pointer-events-none absolute inset-0 overflow-visible z-30">
      {pieces.map((p) => (
        <span
          key={p.id}
          className="ob-confetti"
          style={
            {
              left: p.left + "%",
              width: p.w,
              height: p.h,
              background: p.color,
              borderRadius: p.round ? "99px" : "2px",
              "--dx": p.dx,
              "--dy": p.dy,
              "--dr": p.dr,
              animationDelay: p.delay + "ms",
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
