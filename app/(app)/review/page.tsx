"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Ic } from "@/components/ob/icons";
import { brandFor, CompanyTile, Eyebrow } from "@/components/ob/primitives";
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
  const [approving, setApproving] = useState(false);

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
      <div className="max-w-[760px] mx-auto px-9 py-16">
        <div className="bg-white rounded-xl3 border border-coral-100 ob-card-shadow p-8 text-center">
          <div className="h-14 w-14 rounded-xl2 bg-coral-50 grid place-items-center mx-auto mb-4">
            <Ic.x className="h-6 w-6 text-coral-600" />
          </div>
          <h2 className="font-display font-bold text-[19px]">Couldn&apos;t tailor this job</h2>
          <p className="text-[14px] text-ink-mute mt-2 max-w-md mx-auto leading-relaxed">{error}</p>
          <div className="mt-6 flex items-center justify-center gap-2">
            <Link
              href="/matches"
              className="inline-flex items-center gap-2 rounded-full bg-sand-50 hover:bg-sand-100 border border-sand-200 text-ink-soft font-semibold text-[14px] px-5 py-2.5 transition-colors"
            >
              Back to matches
            </Link>
            <Link
              href="/onboarding"
              className="inline-flex items-center gap-2 rounded-full text-ink-soft hover:text-ink font-semibold text-[14px] px-5 py-2.5 transition-colors"
            >
              Update resume
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!data) return <ReviewSkeleton />;

  async function approve() {
    if (!data || approving) return;
    setApproving(true);
    try {
      const res = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: data.job.id,
          tailoringSummary: data.tailoring.summary,
          coverLetterText: coverDraft,
          screeners: data.screeners.answers,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? `Failed (${res.status})`);
        setApproving(false);
        return;
      }
      router.push(`/detail?id=${encodeURIComponent(json.applicationId)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
      setApproving(false);
    }
  }

  const brand = brandFor(data.job.company);

  return (
    <div>
      <div className="bg-white border-b border-sand-200">
        <div className="max-w-[1180px] mx-auto px-9 py-7 flex items-center gap-5">
          <CompanyTile letter={brand.letter} color={brand.color} size={56} radius={15} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1
                className="font-display font-black text-ink"
                style={{ fontSize: "1.6rem", lineHeight: 1.1, letterSpacing: "-0.02em" }}
              >
                {data.job.title}
              </h1>
              <span className="inline-flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.08em] px-2 py-0.5 rounded-full bg-teal-50 text-teal-700">
                <Ic.spark className="h-3 w-3" /> Tailored by Claude
              </span>
            </div>
            <p className="text-[13px] text-ink-mute mt-1">
              {data.job.company}
              {data.job.location ? ` · ${data.job.location}` : ""}
              {" · "}
              <a
                href={data.job.applyUrl}
                target="_blank"
                rel="noreferrer"
                className="text-ink-mute hover:text-ink underline underline-offset-2"
              >
                View original posting
              </a>
            </p>
            {data.tailoring.summary && (
              <p className="text-[13px] text-ink-soft mt-2.5 lh-body max-w-[820px]">
                <span className="text-[10.5px] uppercase tracking-[0.08em] font-bold text-ink-faint mr-2">
                  Summary
                </span>
                {data.tailoring.summary}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-[1180px] mx-auto px-9 pt-7 pb-32">
        <Diff sections={data.tailoring.sections} />
        <Cover value={coverDraft} onChange={setCoverDraft} originalLength={data.coverLetter.word_count} />
        <Screeners answers={data.screeners.answers} />
      </div>

      <div className="fixed bottom-0 right-0 left-[256px] z-30 border-t border-sand-200 bg-white">
        <div className="max-w-[1180px] mx-auto px-9 py-3.5 flex items-center justify-between">
          <Link
            href="/matches"
            className="inline-flex items-center gap-2 rounded-full text-ink-soft hover:text-ink text-[14px] font-semibold px-4 py-2 transition-colors"
          >
            <Ic.x className="h-4 w-4" /> Skip
          </Link>
          <div className="flex items-center gap-2">
            <button
              onClick={approve}
              disabled={approving}
              className="inline-flex items-center gap-2 rounded-full bg-teal-500 hover:bg-teal-600 disabled:opacity-60 text-white font-semibold text-[15px] px-6 py-2.5 transition-colors ob-card-shadow"
            >
              <Ic.check className="h-4 w-4" />
              {approving ? "Approving…" : "Approve & submit"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Diff({ sections }: { sections: TailoredSection[] }) {
  if (sections.length === 0) {
    return (
      <div className="bg-white rounded-xl3 border border-sand-200 ob-card-shadow p-8 text-center">
        <p className="text-[14px] text-ink-mute">No tailoring changes — your resume matched as-is.</p>
      </div>
    );
  }
  return (
    <>
      <Eyebrow tone="teal" className="mb-3">
        Resume tailoring
      </Eyebrow>
      <div className="space-y-4">
        {sections.map((s, si) => (
          <div
            key={`${s.section_id}-${si}`}
            className="bg-white rounded-xl3 border border-sand-200 ob-card-shadow p-5"
          >
            <div className="text-[10.5px] uppercase tracking-[0.08em] font-bold text-ink-faint mb-3">
              Section {si + 1}
            </div>
            <ul className="space-y-3">
              {s.bullets.map((b, bi) => (
                <BulletDiff key={bi} b={b} />
              ))}
            </ul>
          </div>
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
      <div className="col-span-12 md:col-span-5">
        {b.original ? (
          <span className={dropped ? "text-ink-faint line-through" : "text-ink-mute"}>
            {b.original}
          </span>
        ) : (
          <span className="text-ink-faint italic">(new)</span>
        )}
      </div>
      <div className="hidden md:flex md:col-span-1 items-start justify-center pt-1">
        <Ic.arrow className={"h-4 w-4 " + (dropped ? "text-ink-faint" : "text-teal-500")} />
      </div>
      <div className="col-span-12 md:col-span-6">
        {b.rewritten ? (
          <span
            className={added ? "text-ink" : changed ? "text-ink border-b border-teal-500" : "text-ink"}
          >
            {b.rewritten}
          </span>
        ) : (
          <span className="text-ink-faint italic">(dropped)</span>
        )}
        {b.reasoning && (
          <div className="text-[12px] text-ink-mute mt-1.5 flex items-start gap-1.5">
            <Ic.spark className="h-3 w-3 mt-0.5 text-teal-500 shrink-0" />
            {b.reasoning}
          </div>
        )}
      </div>
    </li>
  );
}

function Cover({
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
      <Eyebrow tone="teal" className="mt-10 mb-3">
        Cover letter
      </Eyebrow>
      <div className="bg-white rounded-xl3 border border-sand-200 ob-card-shadow p-5">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={14}
          className="w-full text-[14px] text-ink leading-relaxed bg-transparent resize-none outline-none focus:ring-0 placeholder:text-ink-faint"
        />
        <div className="mt-3 flex items-center justify-between text-[12px] text-ink-mute">
          <span>
            <span className={words > 250 ? "text-coral-600 font-semibold" : "text-ink font-medium"}>
              {words}
            </span>{" "}
            / 250 words {originalLength ? `· Claude wrote ${originalLength}` : ""}
          </span>
          <span className="flex items-center gap-1.5">
            <Ic.spark className="h-3 w-3 text-teal-500" />
            Drafted in your voice
          </span>
        </div>
      </div>
    </>
  );
}

function Screeners({ answers }: { answers: ScreenerAnswer[] }) {
  return (
    <>
      <Eyebrow tone="teal" className="mt-10 mb-3">
        Screener answers
      </Eyebrow>
      <div className="space-y-3">
        {answers.map((a, i) => (
          <div
            key={i}
            className="bg-white rounded-xl3 border ob-card-shadow p-4"
            style={
              a.confidence === "low"
                ? { borderColor: "rgba(217, 119, 6, 0.45)" }
                : { borderColor: "#DCD4BF" }
            }
          >
            <p className="text-[13px] font-bold text-ink">{a.question}</p>
            <p className="text-[13.5px] text-ink-soft mt-1.5 lh-body">{a.answer}</p>
            <div className="mt-2 flex items-center gap-1.5">
              <span
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full font-bold text-[11px]"
                style={
                  a.confidence === "high"
                    ? { background: "#E2E7C7", color: "#54612C" }
                    : a.confidence === "medium"
                      ? { background: "#FAE3C4", color: "#B45F09" }
                      : { background: "#F6D2C5", color: "#A8341F" }
                }
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={
                    a.confidence === "high"
                      ? { background: "#7A8B3F" }
                      : a.confidence === "medium"
                        ? { background: "#D97706" }
                        : { background: "#C53D2B" }
                  }
                />
                {a.confidence === "low"
                  ? "Low confidence — please review"
                  : a.confidence === "medium"
                    ? "Medium confidence"
                    : "High confidence"}
              </span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function ReviewSkeleton() {
  return (
    <div>
      <div className="bg-white border-b border-sand-200">
        <div className="max-w-[1180px] mx-auto px-9 py-7 flex items-center gap-5">
          <div className="shimmer w-14 h-14 rounded-xl2" />
          <div className="flex-1">
            <div className="shimmer h-6 w-2/3 rounded" />
            <div className="shimmer h-3 w-1/2 mt-2 rounded" />
          </div>
        </div>
      </div>
      <div className="max-w-[1180px] mx-auto px-9 pt-7">
        <Eyebrow tone="teal" className="mb-3">
          Tailoring your resume with Claude…
        </Eyebrow>
        <div className="bg-white rounded-xl3 border border-sand-200 ob-card-shadow p-6 space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="shimmer h-3 w-full rounded" />
          ))}
        </div>
      </div>
    </div>
  );
}
