"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Ic } from "@/components/ob/icons";
import { brandFor, CompanyTile, Eyebrow } from "@/components/ob/primitives";
import type { MatchedJob } from "@/lib/jobs/queries";

export function MatchesList({ jobs }: { jobs: MatchedJob[] }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<string | null>(jobs[0]?.id ?? null);

  return (
    <div className="mt-6 space-y-3">
      {jobs.map((j) => (
        <JobCard
          key={j.id}
          job={j}
          expanded={expanded === j.id}
          onToggle={() => setExpanded(expanded === j.id ? null : j.id)}
          onTailor={() => router.push(`/review?jobId=${encodeURIComponent(j.id)}`)}
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
  const tone: "strong" | "okay" | "weak" =
    job.score >= 80 ? "strong" : job.score >= 65 ? "okay" : "weak";
  const ring = tone === "strong" ? "#0D9488" : tone === "okay" ? "#D97706" : "#928C7B";
  const brand = brandFor(job.company);

  return (
    <div
      className={
        "bg-white rounded-xl3 border ob-card-shadow overflow-hidden transition-colors " +
        (expanded ? "border-teal-500" : "border-sand-200 hover:border-ink/20")
      }
    >
      <button onClick={onToggle} className="w-full text-left p-5 flex items-start gap-4">
        <CompanyTile letter={brand.letter} color={brand.color} size={48} radius={12} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="font-display font-bold text-ink text-[17px] leading-snug">{job.role}</span>
            {job.score >= 88 && (
              <span className="inline-flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-[0.06em] px-2 py-0.5 rounded-full bg-teal-50 text-teal-700">
                Strong match
              </span>
            )}
          </div>
          <div className="text-[12.5px] text-ink-mute mt-1.5">
            {job.company} <Dot /> {job.location} <Dot /> {job.salary} <Dot /> {job.posted}
          </div>
          <div className="text-[13.5px] text-ink-soft mt-2.5 lh-body max-w-[640px] line-clamp-1">
            {job.summary}
          </div>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          <div className="text-right">
            <ScoreRing score={job.score} color={ring} />
            <div className="text-[10.5px] uppercase tracking-[0.08em] font-bold text-ink-mute mt-1">
              {tone === "strong" ? "Strong" : tone === "okay" ? "Good" : "Border"}
            </div>
          </div>
          <Ic.arrow
            className={"h-4 w-4 text-ink-faint transition-transform " + (expanded ? "rotate-90" : "")}
          />
        </div>
      </button>

      {expanded && (
        <div className="border-t border-sand-100 bg-sand-50/40 px-5 py-6">
          <div className="grid grid-cols-12 gap-7">
            <div className="col-span-12 md:col-span-8">
              <Eyebrow tone="teal" className="mb-2.5">
                Job description
              </Eyebrow>
              {job.jdBullets.length > 0 ? (
                <ul className="mt-3 space-y-3 text-[13.5px] lh-body max-w-[600px] text-ink-soft">
                  {job.jdBullets.map((line, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="text-ink-faint mt-1.5">•</span>
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-[13.5px] lh-body max-w-[600px] text-ink-soft">
                  {job.summary}
                </p>
              )}
            </div>
            <div className="col-span-12 md:col-span-4">
              <Eyebrow tone="teal" className="mb-2.5">
                Why this scored {job.score}
              </Eyebrow>
              <ul className="mt-3 space-y-2.5 text-[13px] lh-body">
                <Reason positive>Keyword overlap with your target roles</Reason>
                <Reason>Real-time JD pulled from {job.source}</Reason>
                <Reason>{job.posted}</Reason>
              </ul>

              <div className="mt-6 flex flex-col gap-2.5">
                <button
                  onClick={onTailor}
                  className="group w-full inline-flex items-center justify-center gap-2 rounded-full bg-teal-500 hover:bg-teal-600 text-white font-semibold text-[14px] py-2.5 transition-colors"
                >
                  <Ic.spark className="h-[15px] w-[15px]" />
                  Tailor &amp; apply
                </button>
                <a
                  href={job.applyUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-white border border-sand-200 text-ink hover:border-ink/30 font-semibold text-[13px] py-2.5 transition-colors"
                >
                  <Ic.ext className="h-[13px] w-[13px]" />
                  View original posting
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ScoreRing({ score, color }: { score: number; color: string }) {
  const r = 22;
  const C = 2 * Math.PI * r;
  return (
    <div className="relative h-14 w-14 inline-grid place-items-center">
      <svg className="absolute inset-0 -rotate-90" viewBox="0 0 56 56">
        <circle cx="28" cy="28" r={r} fill="none" stroke="#EDE7D6" strokeWidth="4.5" />
        <circle
          cx="28"
          cy="28"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="4.5"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - Math.min(100, Math.max(0, score)) / 100)}
        />
      </svg>
      <span className="font-display font-bold text-[15px]" style={{ color }}>
        {score}
      </span>
    </div>
  );
}

function Dot() {
  return <span className="text-sand-300 mx-1">·</span>;
}

function Reason({
  children,
  positive,
}: {
  children: ReactNode;
  positive?: boolean;
}) {
  const color = positive ? "#0D9488" : "#928C7B";
  return (
    <li className="flex items-start gap-2">
      <span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
      <span className="text-ink-soft">{children}</span>
    </li>
  );
}
