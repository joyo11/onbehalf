"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, SectionLabel } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { MatchScore } from "@/components/ui/match-score";
import { Monogram } from "@/components/ui/monogram";
import type { MatchedJob } from "@/lib/jobs/queries";

export function MatchesList({ jobs }: { jobs: MatchedJob[] }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<string | null>(jobs[0]?.id ?? null);

  return (
    <div className="mt-5 space-y-3">
      {jobs.map((j) => (
        <JobCard
          key={j.id}
          job={j}
          expanded={expanded === j.id}
          onToggle={() => setExpanded(expanded === j.id ? null : j.id)}
          onTailor={() => router.push("/review")}
        />
      ))}
    </div>
  );
}

function JobCard({
  job,
  expanded,
  onToggle,
  onTailor,
}: {
  job: MatchedJob;
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
              <SectionLabel>Job description</SectionLabel>
              {job.jdBullets.length > 0 ? (
                <ul className="mt-3 space-y-3 text-[13.5px] lh-body max-w-[600px]">
                  {job.jdBullets.map((line, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="text-mute mt-1.5">•</span>
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-[13.5px] lh-body max-w-[600px] text-ink/85">{job.summary}</p>
              )}
            </div>
            <div className="col-span-4">
              <SectionLabel>Why this scored {job.score}</SectionLabel>
              <ul className="mt-3 space-y-2.5 text-[13px] lh-body">
                <ScoreReason positive>Keyword overlap with your target roles</ScoreReason>
                <ScoreReason>Real-time JD pulled from {job.source}</ScoreReason>
                <ScoreReason>{job.posted}</ScoreReason>
              </ul>

              <div className="mt-6 flex flex-col gap-2">
                <Button
                  variant="primary"
                  className="w-full"
                  onClick={onTailor}
                  leading={<Icon name="sparkles" size={14} />}
                >
                  Tailor &amp; apply
                </Button>
                <a
                  href={job.applyUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-ctrl font-medium h-9 px-3.5 text-[13px] bg-surface text-ink border border-line hover:border-ink/30 hover:bg-[#FBFAF6] shadow-subtle transition-colors"
                >
                  <Icon name="external" size={13} /> View original posting
                </a>
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
