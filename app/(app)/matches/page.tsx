"use client";

/*  Job match list — ranked cards, click to expand. */

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, SectionLabel } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { MatchScore } from "@/components/ui/match-score";
import { Monogram } from "@/components/ui/monogram";
import { JOBS } from "@/lib/data";
import type { Job } from "@/lib/types";

export default function MatchesScreen() {
  const router = useRouter();
  const [expanded, setExpanded] = useState<string | null>("j-lin-1");
  const sorted = [...JOBS].sort((a, b) => b.score - a.score);

  return (
    <div className="px-10 py-9 max-w-[1100px] mx-auto">
      <div className="flex items-start justify-between">
        <div>
          <SectionLabel>Run #248 · just now</SectionLabel>
          <h1 className="mt-2 text-[30px] font-semibold tracking-[-0.022em]">
            I found 12 matches. 4 are unusually strong.
          </h1>
          <p className="mt-2 text-[14px] text-mute lh-body max-w-[600px]">
            Ranked by overall match. Click a card to read the JD and approve tailoring, or use bulk actions below.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" leading={<Icon name="cards" size={14} />}>
            Compact view
          </Button>
          <Button variant="primary" leading={<Icon name="bolt" size={14} />}>
            Auto-apply top 4
          </Button>
        </div>
      </div>

      <div className="mt-7 flex items-center justify-between text-[12.5px] text-mute">
        <div className="flex items-center gap-2">
          <FilterChip label="All" count={12} active />
          <FilterChip label="Strong (85+)" count={4} />
          <FilterChip label="Good (70–84)" count={5} />
          <FilterChip label="Borderline" count={3} />
        </div>
        <div className="flex items-center gap-3">
          <span>Sort by</span>
          <button className="flex items-center gap-1 text-ink font-medium hover:underline">
            Match score <Icon name="chevron-down" size={12} />
          </button>
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {sorted.map((j) => (
          <JobCard
            key={j.id}
            job={j}
            expanded={expanded === j.id}
            onToggle={() => setExpanded(expanded === j.id ? null : j.id)}
            onTailor={() => router.push("/review")}
          />
        ))}
      </div>
    </div>
  );
}

function FilterChip({ label, count, active }: { label: string; count?: number; active?: boolean }) {
  return (
    <button
      className={`h-7 px-2.5 text-[12px] font-medium rounded-sm transition-colors flex items-center gap-1.5 ${
        active ? "bg-ink text-white" : "text-mute hover:text-ink border border-line bg-white"
      }`}
    >
      {label}
      {count !== undefined && (
        <span className={`tabular-nums ${active ? "text-white/70" : "text-mute"}`}>{count}</span>
      )}
    </button>
  );
}

function JobCard({
  job,
  expanded,
  onToggle,
  onTailor,
}: {
  job: Job;
  expanded: boolean;
  onToggle: () => void;
  onTailor: () => void;
}) {
  const scoreTone = job.score >= 80 ? "strong" : job.score >= 65 ? "okay" : "weak";
  return (
    <Card
      className={`overflow-hidden transition-colors ${expanded ? "" : "hover:border-line-hi"}`}
      style={expanded ? { borderColor: "var(--accent)" } : undefined}
    >
      <button onClick={onToggle} className="w-full text-left p-5 flex items-start gap-4">
        <Monogram name={job.company} size={48} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5">
            <span className="text-[15px] font-semibold">{job.role}</span>
            {job.score >= 88 && (
              <span
                className="inline-flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-[0.06em] px-1.5 py-0.5 rounded-sm"
                style={{ background: "var(--accent-soft)", color: "var(--accent-hi)" }}
              >
                <Icon name="star" size={10} /> Strong match
              </span>
            )}
          </div>
          <div className="text-[12.5px] text-mute mt-1">
            {job.company} <Dot /> {job.location} <Dot /> {job.salary} <Dot /> {job.posted}
          </div>
          <div className="text-[13.5px] text-ink mt-2.5 lh-body max-w-[640px] line-clamp-1">
            {job.summary}
          </div>
        </div>
        <div className="flex items-center gap-5 shrink-0">
          <div className="text-right">
            <MatchScore score={job.score} size={56} stroke={5} />
            <div className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-mute mt-1">
              {scoreTone === "strong" ? "Strong" : scoreTone === "okay" ? "Good" : "Borderline"}
            </div>
          </div>
          <Icon
            name="chevron-down"
            size={18}
            className={`text-mute transition-transform ${expanded ? "rotate-180" : ""}`}
          />
        </div>
      </button>

      {expanded && (
        <div className="border-t border-line bg-[#FBFAF7] px-5 py-6 anim-pop">
          <div className="grid grid-cols-12 gap-8">
            <div className="col-span-8">
              <SectionLabel>Full job description</SectionLabel>
              <ul className="mt-3 space-y-3 text-[13.5px] lh-body max-w-[600px]">
                {job.jd.map((line, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="text-mute mt-1.5">•</span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="col-span-4">
              <SectionLabel>Why this scored {job.score}</SectionLabel>
              <ul className="mt-3 space-y-2.5 text-[13px] lh-body">
                <ScoreReason positive>Matches 7 of 9 must-have skills</ScoreReason>
                <ScoreReason positive>Salary within your range</ScoreReason>
                <ScoreReason positive>Location matches &ldquo;Remote (US)&rdquo;</ScoreReason>
                <ScoreReason>Posted &lt; 24h ago — earlier-bird advantage</ScoreReason>
                {job.score < 80 && (
                  <ScoreReason negative>Seniority signal mixed — JD asks for 8+ yrs</ScoreReason>
                )}
              </ul>

              <div className="mt-6 flex flex-col gap-2">
                <Button variant="primary" className="w-full" onClick={onTailor} leading={<Icon name="sparkles" size={14} />}>
                  Tailor &amp; apply
                </Button>
                <Button variant="secondary" className="w-full" leading={<Icon name="external" size={13} />}>
                  View original posting
                </Button>
                <button className="text-[12.5px] text-mute hover:text-ink mt-1">Skip this job</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

function Dot() {
  return <span className="text-[#D6D3CC] mx-1">·</span>;
}

function ScoreReason({
  children,
  positive,
  negative,
}: {
  children: ReactNode;
  positive?: boolean;
  negative?: boolean;
}) {
  const color = positive ? "var(--accent)" : negative ? "#DC2626" : "#9C9C9C";
  return (
    <li className="flex items-start gap-2">
      <span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
      <span className="text-ink/90">{children}</span>
    </li>
  );
}
