"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, SectionLabel } from "@/components/ui/card";
import { Icon, type IconName } from "@/components/ui/icon";
import { Monogram } from "@/components/ui/monogram";
import { StatusPill } from "@/components/ui/status-pill";
import type { Status } from "@/lib/types";

type EventRow = {
  id: string;
  step: string;
  payload: Record<string, unknown> | null;
  createdAt: string;
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
  const submitFiredRef = useRef(false);

  useEffect(() => {
    if (!id) {
      setError("No application selected.");
      return;
    }

    if (!submitFiredRef.current) {
      submitFiredRef.current = true;
      fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicationId: id }),
      }).catch(() => {});
    }

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
        if (!cancelled) setData(json);
      } catch {
        // network blip — try again next tick
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
      <div className="px-10 py-16 max-w-[760px] mx-auto">
        <Card className="p-8 text-center">
          <Icon name="alert-circle" size={22} className="text-error mx-auto" />
          <h2 className="text-[17px] font-semibold mt-3">{error}</h2>
          <div className="mt-5">
            <Link href="/tracker">
              <Button variant="secondary">Back to tracker</Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  if (!data) return <DetailSkeleton />;

  const liveViewUrl = (
    data.events.find((e) => e.step === "session_started")?.payload as
      | { liveViewUrl?: string }
      | null
      | undefined
  )?.liveViewUrl;
  const terminal = ["submitted", "failed", "needsHuman", "confirmed"].includes(data.application.status);

  return (
    <div className="px-10 py-9 max-w-[1100px] mx-auto">
      <Header app={data.application} job={data.job} />
      <div className="mt-7 grid grid-cols-12 gap-6">
        <div className="col-span-7">
          <SectionLabel className="mb-3">Live progress</SectionLabel>
          <Card className="p-5">
            <ol className="space-y-3">
              {data.events.length === 0 ? (
                <li className="text-[13px] text-mute">Waiting for the agent to start…</li>
              ) : (
                data.events.map((e) => <Event key={e.id} e={e} />)
              )}
              {!terminal && (
                <li className="text-[12.5px] text-mute flex items-center gap-2 mt-2">
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{
                      background: "var(--accent)",
                      animation: "pulse-dot 1.6s ease-in-out infinite",
                    }}
                  />
                  Agent is working…
                </li>
              )}
            </ol>
          </Card>
        </div>
        <div className="col-span-5">
          <SectionLabel className="mb-3">Watch live</SectionLabel>
          <Card className="p-5">
            {liveViewUrl ? (
              <>
                <p className="text-[13px] text-ink/85 lh-body">
                  Open the Browserbase live view to watch the agent fill the form in real time.
                </p>
                <a
                  href={liveViewUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-flex items-center gap-2 h-9 px-3.5 text-[13px] rounded-ctrl border border-line bg-white hover:border-ink/30 transition-colors"
                >
                  <Icon name="external-link" size={13} /> Open live view
                </a>
              </>
            ) : (
              <p className="text-[13px] text-mute lh-body">
                Live view URL will appear when the Browserbase session starts.
              </p>
            )}
            <div className="mt-6 pt-4 border-t border-line text-[12.5px] text-mute lh-body flex items-start gap-1.5">
              <Icon name="shield" size={13} className="mt-0.5 shrink-0" />
              <span>
                Demo mode: the agent fills the form, screenshots it, and stops. It does NOT click
                Submit until you flip <code className="text-ink">REAL_SUBMIT_ENABLED=true</code>.
              </span>
            </div>
          </Card>

          <SectionLabel className="mb-3 mt-7">Tailoring summary</SectionLabel>
          <Card className="p-5 text-[13.5px] lh-body text-ink/85">
            {data.application.tailoringSummary || "—"}
          </Card>
        </div>
      </div>

      <div className="mt-10 flex items-center justify-between">
        <Link href="/tracker">
          <Button
            variant="ghost"
            leading={<Icon name="chevron-right" size={13} className="rotate-180" />}
          >
            Back to tracker
          </Button>
        </Link>
        <a href={data.job.applyUrl} target="_blank" rel="noreferrer">
          <Button variant="secondary" leading={<Icon name="external-link" size={13} />}>
            View original posting
          </Button>
        </a>
      </div>
    </div>
  );
}

function Header({ app, job }: { app: DetailPayload["application"]; job: DetailPayload["job"] }) {
  return (
    <div className="flex items-start gap-5">
      <Monogram name={job.company} size={56} />
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <h1 className="text-[24px] font-semibold tracking-[-0.018em]">{job.title}</h1>
          <StatusPill status={app.status} />
        </div>
        <div className="text-[13.5px] text-mute mt-1">
          {job.company} {job.location ? `· ${job.location}` : ""}
        </div>
      </div>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="px-10 py-9 max-w-[1100px] mx-auto">
      <div className="flex items-center gap-5">
        <div className="shimmer w-14 h-14 rounded-md" />
        <div className="flex-1">
          <div className="shimmer h-6 w-1/2 rounded" />
          <div className="shimmer h-3 w-1/3 mt-2 rounded" />
        </div>
      </div>
      <Card className="mt-6 p-5 space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="shimmer h-3 w-full rounded" />
        ))}
      </Card>
    </div>
  );
}

const STEP_LABELS: Record<string, { label: string; icon: IconName }> = {
  submission_started: { label: "Submission started", icon: "play" },
  session_started: { label: "Browserbase session live", icon: "globe" },
  page_loaded: { label: "Apply page loaded", icon: "external-link" },
  ats_detected: { label: "ATS detected", icon: "check-circle" },
  uploaded_resume: { label: "Resume uploaded", icon: "upload" },
  screenshot: { label: "Screenshot taken", icon: "eye" },
  demo_skipped_submit: { label: "Demo mode — Submit skipped", icon: "shield" },
  submit_clicked: { label: "Submit button clicked", icon: "paper-plane" },
  error: { label: "Error", icon: "alert-circle" },
  ats_unsupported: { label: "ATS not yet supported", icon: "alert-circle" },
};

function Event({ e }: { e: EventRow }) {
  const meta = STEP_LABELS[e.step];
  const label =
    meta?.label ??
    (e.step.startsWith("filled_") ? `Filled: ${e.step.replace("filled_", "")}` : e.step);
  const icon: IconName = meta?.icon ?? "check";
  const detail =
    e.payload && typeof e.payload === "object"
      ? (e.payload as Record<string, unknown>).detail
      : null;
  const isError = e.step === "error" || e.step.startsWith("failed_");
  const t = new Date(e.createdAt);

  return (
    <li className="flex items-start gap-3">
      <div
        className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5"
        style={
          isError
            ? { background: "#FBE9E9", color: "#9C2222" }
            : { background: "var(--accent-soft)", color: "var(--accent-hi)" }
        }
      >
        <Icon name={icon} size={12} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13.5px] text-ink">{label}</div>
        {detail !== null && detail !== undefined && (
          <div className="text-[12px] text-mute lh-body truncate" title={String(detail)}>
            {String(detail)}
          </div>
        )}
      </div>
      <div className="text-[11px] tabular text-ink-faint shrink-0">
        {t.toLocaleTimeString("en-US", { hour12: false })}
      </div>
    </li>
  );
}
