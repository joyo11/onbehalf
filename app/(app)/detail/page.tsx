"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { Ic } from "@/components/ob/icons";
import {
  brandFor,
  CompanyTile,
  ConfettiBurst,
  Eyebrow,
  StatusPill,
} from "@/components/ob/primitives";
import type { Status } from "@/lib/types";

type EventRow = {
  id: string;
  step: string;
  payload: Record<string, unknown> | null;
  createdAt: string;
};

type ResolvedField = {
  label: string;
  value: string | null;
  source: string;
  confidence: string;
  reason: string;
};

type DetailPayload = {
  application: {
    id: string;
    status: Status;
    matchScore: number;
    tailoringSummary: string;
    coverLetterText: string | null;
    submittedAt: string | null;
    failureReason: string | null;
    customAnswersJson: {
      needsHumanReason?: string;
      resolvedFields?: ResolvedField[];
      botBlockSignal?: string;
      botBlockDetail?: string;
    } | null;
  };
  job: {
    id: string;
    company: string;
    title: string;
    location: string | null;
    applyUrl: string;
  };
  events: EventRow[];
};

export default function DetailScreen() {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <DetailInner />
    </Suspense>
  );
}

function DetailInner() {
  const sp = useSearchParams();
  const id = sp.get("id");
  const [data, setData] = useState<DetailPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confetti, setConfetti] = useState(false);
  const [approving, setApproving] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);
  const confettiFiredRef = useRef(false);

  async function onApproveSubmit() {
    if (!id) return;
    setApproving(true);
    setApproveError(null);
    try {
      const res = await fetch("/api/approve-submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicationId: id }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setApproveError(json.error ?? `Approve failed (${res.status})`);
      }
    } catch {
      setApproveError("Network error.");
    } finally {
      setApproving(false);
    }
  }

  useEffect(() => {
    if (!id) {
      setError("No application selected.");
      return;
    }
    // No more auto-fire of /api/submit on mount — the user explicitly
    // clicks Tailor, then Apply, then submits from the extension.
    let cancelled = false;
    async function tick() {
      try {
        const res = await fetch(`/api/applications/${encodeURIComponent(id!)}`, {
          cache: "no-store",
        });
        if (!res.ok) {
          if (res.status === 404) setError("Application not found.");
          return;
        }
        const json = (await res.json()) as DetailPayload;
        if (cancelled) return;
        setData(json);
        if (
          (json.application.status === "submitted" || json.application.status === "confirmed") &&
          !confettiFiredRef.current
        ) {
          confettiFiredRef.current = true;
          setConfetti(true);
          setTimeout(() => setConfetti(false), 1900);
        }
      } catch {
        // try again next tick
      }
    }
    void tick();
    const handle = setInterval(tick, 2000);
    return () => {
      cancelled = true;
      clearInterval(handle);
    };
  }, [id]);

  if (error) {
    return (
      <div className="max-w-[760px] mx-auto px-9 py-16">
        <div className="bg-white rounded-xl3 border border-sand-200 ob-card-shadow p-8 text-center">
          <h2 className="font-display font-bold text-[17px]">{error}</h2>
          <div className="mt-5">
            <Link
              href="/tracker"
              className="inline-flex items-center gap-2 rounded-full bg-sand-50 hover:bg-sand-100 border border-sand-200 text-ink-soft font-semibold text-[14px] px-5 py-2.5 transition-colors"
            >
              Back to tracker
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!data) return <DetailSkeleton />;

  const showThanks = data.application.status === "submitted" || data.application.status === "confirmed";
  const step = mapStatusToStep(data.application.status);
  const brand = brandFor(data.job.company);

  return (
    <div className="max-w-[1180px] mx-auto px-5 sm:px-9 py-6 sm:py-8">
      <div className="flex flex-wrap items-center gap-2 text-[14px] font-semibold mb-6">
        <Link
          href="/tracker"
          className="inline-flex items-center gap-1.5 text-ink-mute hover:text-ink transition-colors"
        >
          <Ic.back className="h-4 w-4" /> Tracker
        </Link>
        <span className="text-ink-faint">·</span>
        <Link
          href="/dashboard"
          className="text-ink-mute hover:text-ink transition-colors"
        >
          Dashboard
        </Link>
      </div>

      <div
        className="ob-hand-in font-hand text-teal-700 mb-1 ml-1"
        style={{ fontSize: "1.5rem", transform: "rotate(-1.5deg)" }}
      >
        Your agent is working ✦
      </div>
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 sm:gap-6 mb-7">
        <div className="flex items-center gap-4 min-w-0">
          <CompanyTile letter={brand.letter} color={brand.color} size={52} radius={14} />
          <div className="min-w-0">
            <h1
              className="font-display font-black text-ink leading-[1.12]"
              style={{ fontSize: "clamp(1.3rem, 2.1vw, 1.9rem)", letterSpacing: "-0.02em" }}
            >
              {data.job.title}
            </h1>
            <p className="text-[14px] text-ink-mute mt-1.5 break-words">
              {data.job.company}
              {data.job.location ? ` · ${data.job.location}` : ""}
            </p>
          </div>
        </div>
        <div className="sm:shrink-0">
          <StatusPill status={data.application.status} />
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_350px] gap-6 items-start">
        {/* LEFT: staged tailor → apply card */}
        <div className="relative">
          <ConfettiBurst fire={confetti} />
          <StagedActionCard
            applicationId={data.application.id}
            jobId={data.job.id}
            jobApplyUrl={data.job.applyUrl}
            jobCompany={data.job.company}
            status={data.application.status}
            tailoringSummary={data.application.tailoringSummary}
            coverLetterText={data.application.coverLetterText}
          />
        </div>

        {/* RIGHT: progress + payoff */}
        <div className="space-y-5">
          <div className="bg-white rounded-xl3 border border-sand-200 ob-card-shadow p-6">
            <div className="flex items-center justify-between mb-5">
              <p className="font-display font-bold text-ink text-[17px]">Progress</p>
              <span className="font-mono text-[12px] text-ink-faint">
                step {Math.min(step + 1, PIPELINE.length)} / {PIPELINE.length}
              </span>
            </div>
            {PIPELINE.map((s, i) => (
              <TimelineStep key={s.key} s={s} idx={i} step={step} />
            ))}
          </div>

          {data.application.status === "needsHuman" && (
            <NeedsHumanCard
              applicationId={data.application.id}
              reason={data.application.customAnswersJson?.needsHumanReason ?? data.application.failureReason ?? "unknown"}
              resolvedFields={data.application.customAnswersJson?.resolvedFields ?? []}
              onApprove={onApproveSubmit}
              approving={approving}
              approveError={approveError}
              applyUrl={data.job.applyUrl}
              botBlockSignal={data.application.customAnswersJson?.botBlockSignal}
              hasPreSubmitScreenshot={data.events.some(
                (e) => e.step === "screenshot_pre_submit",
              )}
              hasPostSubmitScreenshot={data.events.some(
                (e) => e.step === "screenshot_post_submit",
              )}
            />
          )}

          {showThanks && (
            <div className="ob-sticker relative bg-teal-50 border border-teal-200 rounded-xl3 p-6 origin-top-left">
              <div className="absolute -top-3 -right-3 h-11 w-11 rounded-full bg-teal-500 text-white grid place-items-center ob-card-shadow">
                <Ic.check className="h-6 w-6" />
              </div>
              <Eyebrow tone="teal" className="mb-2">
                Submitted for real
              </Eyebrow>
              <p
                className="font-display font-bold text-teal-800 leading-tight"
                style={{ fontSize: "1.4rem", letterSpacing: "-0.01em" }}
              >
                Done — your application is in at {data.job.company}.
              </p>
              <p className="text-[13px] text-teal-700/80 mt-2 leading-relaxed">
                {data.application.status === "confirmed"
                  ? "Confirmation email arrived. Go back to sleep."
                  : "I'll watch your inbox and mark it Confirmed the moment they reply."}
              </p>
              <p className="font-hand text-ink-mute mt-3 text-right" style={{ fontSize: "1.5rem" }}>
                — your agent ♥
              </p>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

/**
 * Staged primary action card on the detail page. Replaces the old
 * Browserbase live-session embed — we don't run a remote browser
 * anymore; the user runs the extension in their own browser instead.
 *
 * States, mapped to application.status:
 *   queued + no tailoringSummary   → "Tailor my resume" CTA
 *   tailoring                       → spinner + status copy
 *   queued + tailoringSummary       → preview tailoring + "Apply now"
 *   submitting                      → "Form opened — fill it from your toolbar"
 *   submitted / confirmed           → success card is rendered in the
 *                                     right column; we render nothing
 *                                     so the layout collapses cleanly.
 */
function StagedActionCard({
  applicationId,
  jobId,
  jobApplyUrl,
  jobCompany,
  status,
  tailoringSummary,
  coverLetterText,
}: {
  applicationId: string;
  jobId: string;
  jobApplyUrl: string;
  jobCompany: string;
  status: Status;
  tailoringSummary: string;
  coverLetterText: string | null;
}) {
  const [tailoring, setTailoring] = useState(false);
  const [opening, setOpening] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function patch(body: Record<string, unknown>) {
    await fetch(`/api/applications/${applicationId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async function runTailor() {
    setTailoring(true);
    setErr(null);
    try {
      await patch({ status: "tailoring" });
      const res = await fetch("/api/tailor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        tailoringSummary?: string;
        coverLetter?: { text?: string };
      };
      if (!res.ok) {
        setErr(json.error ?? `Tailor failed (${res.status})`);
        await patch({ status: "queued" });
        return;
      }
      await patch({
        status: "queued",
        tailoringSummary: json.tailoringSummary ?? "",
        coverLetterText: json.coverLetter?.text ?? "",
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Network error");
      await patch({ status: "queued" });
    } finally {
      setTailoring(false);
    }
  }

  async function openApply() {
    setOpening(true);
    try {
      await patch({ status: "submitting" });
      window.open(jobApplyUrl, "_blank", "noopener,noreferrer");
    } finally {
      setOpening(false);
    }
  }

  // Submitted / confirmed → success sticker on the right column carries
  // the moment. This card disappears.
  if (status === "submitted" || status === "confirmed") return null;

  if (status === "tailoring" || tailoring) {
    return (
      <div className="rounded-xl3 bg-white border border-sand-200 ob-card-shadow p-8 text-center">
        <div className="h-12 w-12 mx-auto mb-4 rounded-full border-2 border-teal-200 border-t-teal-500 animate-spin" />
        <p className="font-display font-bold text-ink text-[18px]">
          Rewriting your resume in your voice…
        </p>
        <p className="text-[13px] text-ink-mute mt-2 max-w-[44ch] mx-auto leading-relaxed">
          Claude is reading the job description and tailoring bullets to match what they're
          actually looking for. ~30 seconds.
        </p>
      </div>
    );
  }

  if (status === "submitting") {
    return (
      <div className="rounded-xl3 bg-white border border-sand-200 ob-card-shadow p-8 text-center">
        <div className="h-12 w-12 mx-auto mb-4 rounded-full bg-teal-50 border-2 border-teal-200 grid place-items-center">
          <Ic.ext className="h-6 w-6 text-teal-600" />
        </div>
        <p className="font-display font-bold text-ink text-[18px]">Application open in a new tab.</p>
        <p className="text-[13px] text-ink-mute mt-2 max-w-[48ch] mx-auto leading-relaxed">
          Switch over and click the Onbehalf "O" in your toolbar — it'll auto-fill the form. Submit
          when you're ready; we'll mark this row submitted automatically.
        </p>
        <a
          href={jobApplyUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-5 inline-flex items-center gap-2 rounded-full bg-ink hover:bg-ink-soft text-white text-[13px] font-semibold px-5 py-2.5 transition-colors"
        >
          Reopen the form <Ic.ext className="h-4 w-4" />
        </a>
      </div>
    );
  }

  // Queued: either no tailoring yet (CTA), or tailoring done (preview + apply)
  if (!tailoringSummary) {
    return (
      <div className="rounded-xl3 bg-white border border-sand-200 ob-card-shadow p-8">
        <Eyebrow tone="teal" className="mb-2">
          Step 1 — tailor
        </Eyebrow>
        <p className="font-display font-bold text-ink text-[22px] leading-tight tracking-[-0.012em]">
          Rewrite your resume for {jobCompany}.
        </p>
        <p className="text-[13.5px] text-ink-mute mt-3 max-w-[56ch] leading-relaxed">
          I'll match the bullets you wrote to the language in this JD — same facts, sharper
          framing. No invented experience.
        </p>
        <button
          onClick={runTailor}
          disabled={tailoring}
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-ink hover:bg-ink-soft text-white text-[14px] font-semibold px-6 py-3 transition-colors disabled:opacity-60"
        >
          {tailoring ? "Tailoring…" : "Tailor my resume"}
        </button>
        {err && (
          <p className="text-[12.5px] text-error mt-3">{err}</p>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl3 bg-white border border-sand-200 ob-card-shadow p-8">
      <Eyebrow tone="teal" className="mb-2">
        Step 2 — review and apply
      </Eyebrow>
      <p className="font-display font-bold text-ink text-[20px] leading-tight tracking-[-0.01em]">
        Resume tailored for {jobCompany}. Take a look.
      </p>

      <div className="mt-5">
        <p className="text-[11px] uppercase tracking-[0.06em] font-semibold text-ink-mute mb-2">
          What I changed
        </p>
        <p className="text-[13.5px] text-ink-soft leading-[1.65] whitespace-pre-wrap">
          {tailoringSummary}
        </p>
      </div>

      {coverLetterText && (
        <div className="mt-6">
          <p className="text-[11px] uppercase tracking-[0.06em] font-semibold text-ink-mute mb-2">
            Cover letter draft
          </p>
          <p className="text-[13px] text-ink-soft leading-[1.65] whitespace-pre-wrap line-clamp-12">
            {coverLetterText}
          </p>
        </div>
      )}

      <div className="mt-7 flex items-center gap-3 flex-wrap">
        <button
          onClick={openApply}
          disabled={opening}
          className="inline-flex items-center gap-2 rounded-full bg-ink hover:bg-ink-soft text-white text-[14px] font-semibold px-6 py-3 transition-colors disabled:opacity-60"
        >
          {opening ? "Opening…" : "Apply now"} <Ic.ext className="h-4 w-4" />
        </button>
        <button
          onClick={runTailor}
          disabled={tailoring}
          className="text-[13px] text-ink-mute hover:text-ink underline underline-offset-2 decoration-[1px] disabled:opacity-60"
        >
          Re-tailor
        </button>
      </div>
      {err && <p className="text-[12.5px] text-error mt-3">{err}</p>}
    </div>
  );
}

/* ── pipeline ─────────────────────────────────────────────── */
type PipelineStep = { key: string; title: string; log: string };
const PIPELINE: PipelineStep[] = [
  { key: "queued", title: "Queued", log: "Picked up from your matches" },
  { key: "tailoring", title: "Tailoring", log: "Rewriting bullets in your voice" },
  { key: "submitting", title: "Submitting", log: "Filling the application form" },
  { key: "submitted", title: "Submitted", log: "Sent — watching inbox for confirmation" },
];

function mapStatusToStep(status: Status): number {
  switch (status) {
    case "queued":
    case "draft":
    case "pending":
      return 0;
    case "tailoring":
      return 1;
    case "submitting":
      return 2;
    case "submitted":
    case "confirmed":
      return 3;
    case "failed":
    case "needsHuman":
      return 2;
    default:
      return 0;
  }
}

function TimelineStep({ s, idx, step }: { s: PipelineStep; idx: number; step: number }) {
  const state = idx < step ? "done" : idx === step ? "current" : "todo";
  return (
    <div className="flex gap-3.5">
      <div className="flex flex-col items-center">
        <div
          className={
            "h-7 w-7 rounded-full grid place-items-center shrink-0 transition-all duration-500 " +
            (state === "done"
              ? "bg-teal-500 text-white"
              : state === "current"
                ? "bg-teal-50 border-2 border-teal-500 text-teal-600"
                : "bg-sand-100 border border-sand-200 text-ink-faint")
          }
        >
          {state === "done" ? (
            <Ic.check className="h-4 w-4" />
          ) : state === "current" ? (
            <span className="h-2 w-2 rounded-full bg-teal-500 ob-dot-pulse" />
          ) : (
            <span className="text-[11px] font-bold">{idx + 1}</span>
          )}
        </div>
        {idx < PIPELINE.length - 1 && (
          <div
            className={"w-0.5 flex-1 my-1 rounded " + (idx < step ? "bg-teal-400" : "bg-sand-200")}
            style={{ minHeight: 26 }}
          />
        )}
      </div>
      <div
        className={
          "pb-5 transition-opacity duration-500 " + (state === "todo" ? "opacity-45" : "opacity-100")
        }
      >
        <p className="font-semibold text-ink text-[15px] leading-tight">{s.title}</p>
        <p className="text-[13px] text-ink-mute mt-0.5">{s.log}</p>
      </div>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="max-w-[1180px] mx-auto px-9 py-9">
      <div className="flex items-center gap-5">
        <div className="shimmer w-14 h-14 rounded-xl2" />
        <div className="flex-1">
          <div className="shimmer h-6 w-1/2 rounded" />
          <div className="shimmer h-3 w-1/3 mt-2 rounded" />
        </div>
      </div>
      <div className="mt-6 bg-white rounded-xl3 border border-sand-200 p-5 space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="shimmer h-3 w-full rounded" />
        ))}
      </div>
    </div>
  );
}

function NeedsHumanCard({
  applicationId,
  reason,
  resolvedFields,
  onApprove,
  approving,
  approveError,
  applyUrl,
  botBlockSignal,
  hasPreSubmitScreenshot,
  hasPostSubmitScreenshot,
}: {
  applicationId: string;
  reason: string;
  resolvedFields: ResolvedField[];
  onApprove: () => void;
  approving: boolean;
  approveError: string | null;
  applyUrl: string;
  botBlockSignal?: string;
  hasPreSubmitScreenshot: boolean;
  hasPostSubmitScreenshot: boolean;
}) {
  const lowFields = resolvedFields.filter((f) => f.confidence !== "high");
  const highFields = resolvedFields.filter((f) => f.confidence === "high");
  const isBotBlocked = reason.startsWith("bot_blocked");
  const preUrl = hasPreSubmitScreenshot
    ? `/api/applications/${applicationId}/screenshot?phase=pre`
    : null;
  const postUrl = hasPostSubmitScreenshot
    ? `/api/applications/${applicationId}/screenshot?phase=post`
    : null;
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl3 p-6">
      <Eyebrow tone="teal" className="mb-2">
        Stopped at submit
      </Eyebrow>
      <p
        className="font-display font-bold text-ink leading-tight"
        style={{ fontSize: "1.3rem", letterSpacing: "-0.01em" }}
        title={`reason: ${reason}${botBlockSignal ? ` · signal: ${botBlockSignal}` : ""}`}
      >
        {isBotBlocked
          ? "This board is blocking automation — finish manually."
          : reason === "low_confidence" || reason === "abstained_required"
            ? lowFields.length > 0
              ? `I filled what I'm sure of. Need your eyes on ${lowFields.length} field${lowFields.length === 1 ? "" : "s"}.`
              : "I filled what I'm sure of. Need your eyes on the rest."
            : reason === "submit_disabled"
              ? "Demo mode is on — your env flag is keeping me from clicking Submit."
              : reason === "no_submit_button"
                ? "I couldn't find the Submit button on this page."
                : "Review and approve to send."}
      </p>

      {lowFields.length > 0 && (
        <div className="mt-4 bg-white border border-amber-200 rounded-xl2 p-4">
          <p className="text-[12.5px] font-semibold text-ink-soft mb-2">
            {lowFields.length} field{lowFields.length === 1 ? "" : "s"} need review
          </p>
          <ul className="space-y-2">
            {lowFields.slice(0, 8).map((f, i) => (
              <li key={i} className="text-[12.5px]">
                <span className="text-ink-soft font-semibold">{f.label}</span>
                <span className="text-ink-faint"> — </span>
                <span className="text-ink">{f.value ?? "(blank)"}</span>
                <span className="ml-2 text-[11px] font-mono text-ink-faint">
                  {f.source}/{f.confidence}
                </span>
              </li>
            ))}
            {lowFields.length > 8 && (
              <li className="text-[11.5px] text-ink-faint">+ {lowFields.length - 8} more</li>
            )}
          </ul>
        </div>
      )}

      {(preUrl || postUrl) && (
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {preUrl && (
            <div className="bg-white border border-amber-200 rounded-xl2 p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[12.5px] font-semibold text-ink-soft">
                  Before submit (what I filled)
                </p>
                <span className="text-[11px] text-ink-faint">
                  {highFields.length}✓ · {lowFields.length} review
                </span>
              </div>
              <a
                href={preUrl}
                target="_blank"
                rel="noreferrer"
                className="block rounded-ctrl overflow-hidden border border-sand-200 hover:border-ink/30 transition-colors"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={preUrl}
                  alt="Filled form (pre-submit)"
                  className="w-full h-auto block"
                  style={{ maxHeight: "260px", objectFit: "cover", objectPosition: "top" }}
                />
              </a>
            </div>
          )}
          {postUrl && (
            <div className="bg-white border border-amber-200 rounded-xl2 p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[12.5px] font-semibold text-ink-soft">
                  After submit (what the company showed)
                </p>
                <span className="text-[11px] text-ink-faint">post-click</span>
              </div>
              <a
                href={postUrl}
                target="_blank"
                rel="noreferrer"
                className="block rounded-ctrl overflow-hidden border border-sand-200 hover:border-ink/30 transition-colors"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={postUrl}
                  alt="After submit"
                  className="w-full h-auto block"
                  style={{ maxHeight: "260px", objectFit: "cover", objectPosition: "top" }}
                />
              </a>
            </div>
          )}
        </div>
      )}
      {(preUrl || postUrl) && (
        <p className="mt-1.5 text-[11px] text-ink-faint">Click either to open full size.</p>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        {!isBotBlocked && (
          <button
            onClick={onApprove}
            disabled={approving}
            className="inline-flex items-center gap-2 rounded-full bg-teal-500 hover:bg-teal-600 disabled:opacity-60 text-white text-[14px] font-semibold px-5 py-2.5 transition-colors"
          >
            {approving ? "Approving…" : "Approve & Submit"}
          </button>
        )}
        <a
          href={applyUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-full bg-white hover:bg-sand-50 border border-sand-200 text-ink text-[14px] font-semibold px-5 py-2.5 transition-colors"
        >
          Open the company&apos;s form (starts blank) <Ic.ext className="h-3.5 w-3.5" />
        </a>
      </div>

      <p className="mt-3 text-[11.5px] text-ink-faint leading-relaxed">
        {isBotBlocked
          ? "This company's form actively blocks automation. Use the link above to submit by hand."
          : "Approve & Submit re-opens the form for me to finish. Opening the company's form yourself gives you a fresh, empty form on their site — what I filled lives in my own browser session and won't carry over."}
      </p>

      {approveError && (
        <p className="mt-3 text-[12.5px] text-red-600">{approveError}</p>
      )}
    </div>
  );
}
