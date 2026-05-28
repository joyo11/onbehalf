"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, SectionLabel } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { MatchScore } from "@/components/ui/match-score";
import { Monogram } from "@/components/ui/monogram";
import { Textarea } from "@/components/ui/input";
import type { ScreenerAnswer } from "@/lib/prompts/screener-answers";
import type { TailoredBullet, TailoredSection } from "@/lib/prompts/tailor-resume";

type TailorPayload = {
  job: {
    id: string;
    company: string;
    title: string;
    location: string | null;
    applyUrl: string;
  };
  tailoring: { sections: TailoredSection[]; summary: string };
  coverLetter: { cover_letter: string; word_count: number };
  screeners: { answers: ScreenerAnswer[] };
};

export default function ReviewScreen() {
  return (
    <Suspense fallback={<ReviewSkeleton />}>
      <ReviewInner />
    </Suspense>
  );
}

function ReviewInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const jobId = sp.get("jobId");
  const [data, setData] = useState<TailorPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [coverDraft, setCoverDraft] = useState<string>("");

  useEffect(() => {
    if (!jobId) {
      setError("No job selected. Go back to Matches and pick a role.");
      return;
    }
    let cancelled = false;
    setData(null);
    setError(null);
    fetch("/api/tailor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId }),
    })
      .then(async (res) => {
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(json.error ?? `Failed (${res.status})`);
          return;
        }
        setData(json as TailorPayload);
        setCoverDraft(json.coverLetter.cover_letter);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Network error");
      });
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  if (error) {
    return (
      <div className="px-10 py-16 max-w-[760px] mx-auto">
        <Card className="p-8 text-center">
          <div className="h-14 w-14 rounded-card border border-error/30 bg-[#FBF5F5] flex items-center justify-center mx-auto mb-4">
            <Icon name="alert-circle" size={22} className="text-error" />
          </div>
          <h2 className="text-[17px] font-semibold">Couldn&apos;t tailor this job</h2>
          <p className="text-[13.5px] text-mute mt-2 max-w-md mx-auto">{error}</p>
          <div className="mt-5 flex items-center justify-center gap-2">
            <Link href="/matches">
              <Button variant="secondary">Back to matches</Button>
            </Link>
            <Link href="/onboarding">
              <Button variant="ghost">Update resume</Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  if (!data) return <ReviewSkeleton />;

  return (
    <div className="bg-sand">
      <ReviewHeader job={data.job} summary={data.tailoring.summary} />
      <div className="px-10 pt-7 pb-32 max-w-[1440px] mx-auto">
        <ReviewDiff sections={data.tailoring.sections} />
        <ReviewCover value={coverDraft} onChange={setCoverDraft} originalLength={data.coverLetter.word_count} />
        <ReviewScreeners answers={data.screeners.answers} />
      </div>
      <ReviewActionBar onApprove={() => router.push("/detail")} />
    </div>
  );
}

function ReviewSkeleton() {
  return (
    <div>
      <div className="border-b border-line bg-white px-10 py-6">
        <div className="max-w-[1440px] mx-auto flex items-center gap-6">
          <div className="shimmer w-14 h-14 rounded-md" />
          <div className="flex-1">
            <div className="shimmer h-5 w-2/3 rounded" />
            <div className="shimmer h-3 w-1/2 mt-2 rounded" />
          </div>
          <div className="shimmer w-14 h-14 rounded-full" />
        </div>
      </div>
      <div className="px-10 pt-7 max-w-[1440px] mx-auto">
        <SectionLabel className="mb-3">Tailoring your resume with Claude…</SectionLabel>
        <Card className="p-6 space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="shimmer h-3 w-full rounded" />
          ))}
        </Card>
      </div>
    </div>
  );
}

function ReviewHeader({
  job,
  summary,
}: {
  job: TailorPayload["job"];
  summary: string;
}) {
  return (
    <div className="border-b border-line bg-white">
      <div className="px-10 py-6 max-w-[1440px] mx-auto flex items-center gap-6">
        <Monogram name={job.company} size={56} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-[22px] font-semibold tracking-[-0.018em]">{job.title}</h1>
            <span
              className="inline-flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-[0.06em] px-1.5 py-0.5 rounded-sm"
              style={{ background: "var(--accent-soft)", color: "var(--accent-hi)" }}
            >
              <Icon name="sparkles" size={10} /> Tailored by Claude
            </span>
          </div>
          <div className="text-[13px] text-mute mt-1">
            {job.company}
            {job.location && (
              <>
                <Dot /> {job.location}
              </>
            )}
            <Dot />
            <a
              href={job.applyUrl}
              target="_blank"
              rel="noreferrer"
              className="text-mute hover:text-ink underline underline-offset-2"
            >
              View original posting
            </a>
          </div>
          {summary && (
            <div className="text-[13px] text-ink/85 mt-2 lh-body max-w-[820px]">
              <span className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-mute mr-2">
                Summary
              </span>
              {summary}
            </div>
          )}
        </div>
        <MatchScore score={90} size={56} stroke={5} />
      </div>
    </div>
  );
}

function ReviewDiff({ sections }: { sections: TailoredSection[] }) {
  if (sections.length === 0) {
    return (
      <Card className="p-8 text-center">
        <p className="text-[13.5px] text-mute">No tailoring changes — your resume matched as-is.</p>
      </Card>
    );
  }
  return (
    <>
      <SectionLabel className="mb-3">Resume tailoring</SectionLabel>
      <div className="space-y-4">
        {sections.map((s, si) => (
          <Card key={`${s.section_id}-${si}`} className="p-5">
            <div className="text-[12.5px] uppercase tracking-[0.06em] font-semibold text-mute mb-3">
              Section {si + 1}
            </div>
            <ul className="space-y-3">
              {s.bullets.map((b, bi) => (
                <BulletDiff key={bi} b={b} />
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </>
  );
}

function BulletDiff({ b }: { b: TailoredBullet }) {
  const dropped = b.rewritten === null;
  const added = b.original === null;
  const changed = !dropped && !added && b.original !== b.rewritten;

  return (
    <li className="grid grid-cols-12 gap-4 text-[13.5px] leading-[1.55]">
      <div className="col-span-5">
        {b.original ? (
          <span className={dropped ? "text-ink-faint line-through" : "text-ink-soft"}>
            {b.original}
          </span>
        ) : (
          <span className="text-ink-faint italic">(new)</span>
        )}
      </div>
      <div className="col-span-1 flex items-start justify-center pt-1">
        <Icon
          name="arrow-right"
          size={14}
          className={dropped ? "text-ink-faint" : "text-accent"}
        />
      </div>
      <div className="col-span-6">
        {b.rewritten ? (
          <span
            className={
              added ? "text-ink" : changed ? "text-ink border-b border-accent" : "text-ink"
            }
          >
            {b.rewritten}
          </span>
        ) : (
          <span className="text-ink-faint italic">(dropped)</span>
        )}
        {b.reasoning && (
          <div className="text-[12px] text-ink-soft mt-1.5 flex items-start gap-1.5">
            <Icon name="info" size={11} className="mt-0.5 shrink-0" />
            {b.reasoning}
          </div>
        )}
      </div>
    </li>
  );
}

function ReviewCover({
  value,
  onChange,
  originalLength,
}: {
  value: string;
  onChange: (v: string) => void;
  originalLength: number;
}) {
  const words = value.trim().split(/\s+/).filter(Boolean).length;
  return (
    <>
      <SectionLabel className="mb-3 mt-10">Cover letter</SectionLabel>
      <Card className="p-5">
        <Textarea value={value} onChange={(e) => onChange(e.target.value)} rows={12} />
        <div className="mt-3 flex items-center justify-between text-[12px] text-mute">
          <span>
            <span className={words > 250 ? "text-error font-medium" : "text-ink"}>{words}</span> /
            250 words {originalLength ? `· Claude wrote ${originalLength}` : ""}
          </span>
          <span className="flex items-center gap-1.5">
            <Icon name="sparkles" size={12} style={{ color: "var(--accent)" }} />
            Drafted in your voice
          </span>
        </div>
      </Card>
    </>
  );
}

function ReviewScreeners({ answers }: { answers: ScreenerAnswer[] }) {
  return (
    <>
      <SectionLabel className="mb-3 mt-10">Screener answers</SectionLabel>
      <div className="space-y-3">
        {answers.map((a, i) => (
          <Card
            key={i}
            className="p-4"
            style={
              a.confidence === "low"
                ? { borderColor: "rgba(217, 119, 6, 0.45)" }
                : undefined
            }
          >
            <div className="text-[13px] font-medium text-ink">{a.question}</div>
            <div className="text-[13.5px] text-ink/85 mt-1.5 lh-body">{a.answer}</div>
            <div className="mt-2 flex items-center gap-1.5 text-[11.5px]">
              <span
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full font-medium"
                style={
                  a.confidence === "high"
                    ? { background: "#E7F4EA", color: "#15803D" }
                    : a.confidence === "medium"
                      ? { background: "#FBF1DC", color: "#92400E" }
                      : { background: "#FCEEDD", color: "#9A3412" }
                }
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={
                    a.confidence === "high"
                      ? { background: "#22C55E" }
                      : a.confidence === "medium"
                        ? { background: "#D97706" }
                        : { background: "#F97316" }
                  }
                />
                {a.confidence === "low"
                  ? "Low confidence — please review"
                  : a.confidence === "medium"
                    ? "Medium confidence"
                    : "High confidence"}
              </span>
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}

function ReviewActionBar({ onApprove }: { onApprove: () => void }) {
  return (
    <div className="fixed bottom-0 right-0 left-[244px] z-30 border-t border-line bg-white">
      <div className="px-10 py-3.5 max-w-[1440px] mx-auto flex items-center justify-between">
        <Link href="/matches">
          <Button variant="ghost" leading={<Icon name="x" size={14} />}>
            Skip
          </Button>
        </Link>
        <div className="flex items-center gap-2">
          <Button variant="secondary" leading={<Icon name="edit" size={13} />}>
            Edit before sending
          </Button>
          <Button variant="primary" onClick={onApprove} leading={<Icon name="check" size={14} />}>
            Approve &amp; submit
          </Button>
        </div>
      </div>
    </div>
  );
}

function Dot() {
  return <span className="text-[#D6D3CC] mx-1.5">·</span>;
}

// Keep ReactNode import used
const _keepImport: ReactNode = null;
void _keepImport;
