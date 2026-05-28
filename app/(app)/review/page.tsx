"use client";

/*  Review screen — demo hero.
    Split layout: original ↔ tailored with hover-tooltip reasoning per diff.
    Cover letter editable, screener Q&A with confidence indicators.    */

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, SectionLabel } from "@/components/ui/card";
import { DiffLine } from "@/components/ui/diff";
import { Icon } from "@/components/ui/icon";
import { MatchScore } from "@/components/ui/match-score";
import { Monogram } from "@/components/ui/monogram";
import {
  REVIEW_COVER_LETTER,
  REVIEW_JOB,
  REVIEW_ORIGINAL,
  REVIEW_SCREENERS,
  REVIEW_TAILORED,
} from "@/lib/data";
import type { Confidence, ScreenerQ } from "@/lib/types";

export default function ReviewScreen() {
  const router = useRouter();
  return (
    <div className="bg-sand">
      <ReviewHeader />
      <div className="px-10 pt-7 pb-32 max-w-[1440px] mx-auto">
        <ReviewDiff />
        <ReviewCover />
        <ReviewScreeners />
      </div>
      <ReviewActionBar onApprove={() => router.push("/detail")} />
    </div>
  );
}

function ReviewHeader() {
  return (
    <div className="border-b border-line bg-white">
      <div className="px-10 py-6 max-w-[1440px] mx-auto flex items-center gap-6">
        <Monogram name={REVIEW_JOB.company} size={56} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-[22px] font-semibold tracking-[-0.018em]">{REVIEW_JOB.role}</h1>
            <span
              className="inline-flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-[0.06em] px-1.5 py-0.5 rounded-sm"
              style={{ background: "var(--accent-soft)", color: "var(--accent-hi)" }}
            >
              <Icon name="star" size={10} /> Strong match
            </span>
          </div>
          <div className="text-[13px] text-mute mt-1">
            {REVIEW_JOB.company} <Dot /> {REVIEW_JOB.location} <Dot /> {REVIEW_JOB.salary} <Dot />
            <a href="#" className="text-mute hover:text-ink underline underline-offset-2">
              View original posting
            </a>
          </div>
        </div>
        <div className="flex items-center gap-5">
          <div className="text-right">
            <div className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-mute">Match</div>
            <div className="flex items-baseline gap-1.5 justify-end mt-0.5">
              <span className="text-[28px] font-semibold tabular-nums" style={{ color: "var(--accent-hi)" }}>
                {REVIEW_JOB.score}
              </span>
              <span className="text-[12.5px] text-mute">/100</span>
            </div>
          </div>
          <MatchScore score={REVIEW_JOB.score} size={56} stroke={5} label={false} />
        </div>
      </div>
    </div>
  );
}

function Dot() {
  return <span className="text-[#D6D3CC] mx-1">·</span>;
}

/* ---------- Diff: original vs tailored bullets ---------- */
function ReviewDiff() {
  return (
    <section>
      <div className="flex items-center justify-between">
        <div>
          <SectionLabel>Resume bullets · experience</SectionLabel>
          <h2 className="mt-2 text-[20px] font-semibold tracking-[-0.018em]">
            I rewrote 4 of 5 bullets. <span className="text-mute font-normal">Hover any change to see why.</span>
          </h2>
        </div>
        <div className="flex items-center gap-4 text-[12px] text-mute">
          <LegendDot color="var(--accent)" label="Added" />
          <LegendDot color="#DC2626" label="Removed" />
          <LegendDot color="#D6D3CC" label="Unchanged" />
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-5">
        <Card className="overflow-hidden">
          <DiffColHeader label="Original" sub="from maya_chen_resume.pdf" />
          <ul className="px-6 py-5 space-y-4 text-[13.5px] lh-body" style={{ color: "#7B7B7B" }}>
            {REVIEW_ORIGINAL.map((line, i) => (
              <li key={i} className="flex gap-3">
                <span className="text-[#C8C5BE] mt-1.5">•</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="overflow-hidden" style={{ borderColor: "var(--accent)", borderWidth: 1.5 }}>
          <DiffColHeader label="Tailored for Linear" sub="4 changes · hover any highlight to see reasoning" accent />
          <ul className="px-6 py-5 space-y-4 text-[13.5px] lh-body">
            {REVIEW_TAILORED.map((segments, i) => (
              <li key={i} className="flex gap-3">
                <span style={{ color: "var(--accent)" }} className="mt-1.5">•</span>
                <span>
                  <DiffLine segments={segments} />
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="mt-4 flex items-center gap-2 text-[12.5px] text-mute">
        <Icon name="sparkles" size={13} style={{ color: "var(--accent)" }} />
        Every change passes your voice filter — bullets read like you wrote them.
        <button className="ml-auto text-mute hover:text-ink underline underline-offset-2">Revert all changes</button>
      </div>
    </section>
  );
}

function DiffColHeader({ label, sub, accent }: { label: string; sub: string; accent?: boolean }) {
  return (
    <div
      className="px-6 py-4 border-b border-line flex items-center justify-between"
      style={accent ? { background: "var(--accent-soft)" } : { background: "#FBFAF7" }}
    >
      <div>
        <div className="text-[13px] font-semibold" style={{ color: accent ? "var(--accent-hi)" : "#1A1A1A" }}>
          {label}
        </div>
        <div
          className="text-[11.5px] mt-0.5"
          style={{ color: accent ? "var(--accent-hi)" : "#6B6B6B", opacity: accent ? 0.85 : 1 }}
        >
          {sub}
        </div>
      </div>
      <button className="text-mute hover:text-ink">
        <Icon name="edit" size={14} />
      </button>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="w-2 h-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

/* ---------- Cover letter ---------- */
function ReviewCover() {
  const [text, setText] = useState<string>(REVIEW_COVER_LETTER);
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const tooLong = words > 280;
  return (
    <section className="mt-10">
      <div className="flex items-center justify-between">
        <div>
          <SectionLabel>Cover letter</SectionLabel>
          <h2 className="mt-2 text-[20px] font-semibold tracking-[-0.018em]">
            I drafted this in your voice. Edit anything before you send.
          </h2>
        </div>
        <div className="flex items-center gap-2 text-[12.5px]">
          <button className="text-mute hover:text-ink flex items-center gap-1.5">
            <Icon name="sparkles" size={13} /> Rewrite tighter
          </button>
          <span className="text-mute">·</span>
          <button className="text-mute hover:text-ink flex items-center gap-1.5">
            <Icon name="sparkles" size={13} /> Make it warmer
          </button>
        </div>
      </div>

      <Card className="mt-4 overflow-hidden">
        <div className="px-5 py-3 border-b border-line flex items-center justify-between bg-[#FBFAF7]">
          <span className="text-[12.5px] text-mute">
            To: <span className="text-ink font-medium">careers@linear.app</span>
            <Dot /> Re: Senior Product Engineer, Workflows
          </span>
          <span
            className={`text-[12px] tabular-nums font-medium ${tooLong ? "text-error" : ""}`}
            style={!tooLong ? { color: "var(--accent-hi)" } : undefined}
          >
            {words} / 250 words {tooLong && "· too long"}
          </span>
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={14}
          className="w-full p-6 text-[13.5px] lh-body bg-white outline-none resize-none focus:bg-white"
          style={{ fontFamily: "Inter", whiteSpace: "pre-wrap" }}
        />
      </Card>
    </section>
  );
}

/* ---------- Screener Q&A ---------- */
function ReviewScreeners() {
  const [open, setOpen] = useState<Set<number>>(new Set([3])); // medium confidence one open
  const toggle = (i: number) => {
    const next = new Set(open);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    setOpen(next);
  };
  return (
    <section className="mt-10">
      <div className="flex items-center justify-between">
        <div>
          <SectionLabel>Screener questions · {REVIEW_SCREENERS.length} found</SectionLabel>
          <h2 className="mt-2 text-[20px] font-semibold tracking-[-0.018em]">
            I drafted answers from your profile.{" "}
            <span className="text-mute font-normal">2 are worth a second look.</span>
          </h2>
        </div>
        <div className="flex items-center gap-4 text-[12px] text-mute">
          <LegendDot color="var(--accent)" label="High confidence" />
          <LegendDot color="#D97706" label="Worth reviewing" />
          <LegendDot color="#DC2626" label="Low confidence" />
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {REVIEW_SCREENERS.map((s, i) => (
          <ScreenerCard key={i} q={s} open={open.has(i)} onToggle={() => toggle(i)} />
        ))}
      </div>
    </section>
  );
}

const CONFIDENCE: Record<Confidence, { label: string; color: string; bg: string; dot: string }> = {
  high: { label: "High confidence", color: "var(--accent-hi)", bg: "var(--accent-soft)", dot: "var(--accent)" },
  medium: { label: "Worth reviewing", color: "#A86412", bg: "#FDF3E1", dot: "#D97706" },
  low: { label: "Low confidence", color: "#9C2222", bg: "#FBE9E9", dot: "#DC2626" },
};

function ScreenerCard({ q, open, onToggle }: { q: ScreenerQ; open: boolean; onToggle: () => void }) {
  const c = CONFIDENCE[q.confidence];
  const lowOrMed = q.confidence !== "high";
  return (
    <Card
      className="overflow-hidden"
      style={lowOrMed ? { borderColor: q.confidence === "low" ? "#F4D4D4" : "#F1E2C1" } : undefined}
    >
      <button onClick={onToggle} className="w-full p-4 flex items-start gap-4 text-left">
        <span
          className="mt-0.5 inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded-sm text-[10.5px] font-semibold uppercase tracking-[0.06em] shrink-0"
          style={{ background: c.bg, color: c.color }}
        >
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: c.dot }} />
          {c.label}
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-[14px] font-medium">{q.q}</div>
          {!open && <div className="text-[13px] text-mute mt-1 lh-body line-clamp-1">{q.a}</div>}
        </div>
        <Icon
          name="chevron-down"
          size={16}
          className={`text-mute shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="px-4 pb-4 anim-pop">
          <div className="ml-[140px] pl-5 border-l-2" style={{ borderColor: c.dot }}>
            <textarea
              defaultValue={q.a}
              rows={Math.max(3, Math.ceil(q.a.length / 90))}
              className="w-full p-3 rounded-sm border border-line bg-[#FBFAF7] text-[13.5px] lh-body outline-none focus:bg-white focus-ring"
            />
            <div className="mt-3 flex items-center justify-between text-[12px]">
              <div className="flex items-center gap-3">
                <button className="text-mute hover:text-ink flex items-center gap-1.5">
                  <Icon name="sparkles" size={12} /> Regenerate
                </button>
                <button className="text-mute hover:text-ink flex items-center gap-1.5">
                  <Icon name="edit" size={12} /> Use a previous answer
                </button>
              </div>
              {lowOrMed && (
                <span className="text-[12px]" style={{ color: c.color }}>
                  {q.confidence === "low"
                    ? "I guessed here — please double-check."
                    : "Your call — I leaned conservative."}
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

/* ---------- Action bar (sticky bottom) ---------- */
function ReviewActionBar({ onApprove }: { onApprove: () => void }) {
  return (
    <div className="fixed bottom-0 left-[244px] right-0 z-30 bg-white/95 backdrop-blur border-t border-line">
      <div className="px-10 py-3.5 max-w-[1440px] mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Icon name="check-circle" size={16} style={{ color: "var(--accent)" }} />
          <div className="text-[13px]">
            Resume rewritten <Dot /> Cover letter drafted <Dot /> 6 of 6 screeners answered
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" leading={<Icon name="x" size={14} />}>
            Skip
          </Button>
          <Button variant="secondary">Save draft</Button>
          <Button variant="primary" size="lg" onClick={onApprove} leading={<Icon name="paper-plane" size={14} />}>
            Approve &amp; submit
          </Button>
        </div>
      </div>
    </div>
  );
}
