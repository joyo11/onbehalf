"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, SectionLabel } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Icon } from "@/components/ui/icon";

export type GoSummary = {
  name: string;
  email: string;
  phone: string | null;
  location: string | null;
  linkedin: string | null;
  github: string | null;
  portfolio: string | null;
  targetRoles: string[];
  salaryMin: number | null;
  locations: string[];
  workAuth: string | null;
  remote: boolean;
  hybrid: boolean;
  onsite: boolean;
  voiceSample: string | null;
  resumeFileName: string | null;
  experienceCount: number;
  educationCount: number;
  projectsCount: number;
  skillsList: string[];
  totalSkills: number;
};

const BATCH_OPTIONS: number[] = [5, 10, 20, 50];

export default function GoClient({ summary }: { summary: GoSummary }) {
  const router = useRouter();
  const [batchSize, setBatchSize] = useState<number>(10);
  const [starting, setStarting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setStarting(true);
    setError(null);
    try {
      const res = await fetch("/api/batch-submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchSize }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`);
      router.push("/tracker");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
      setStarting(false);
    }
  }

  const workPrefs: string[] = [];
  if (summary.remote) workPrefs.push("Remote");
  if (summary.hybrid) workPrefs.push("Hybrid");
  if (summary.onsite) workPrefs.push("On-site");

  return (
    <div className="px-10 py-9 max-w-[1000px] mx-auto">
      <div>
        <SectionLabel>Final check</SectionLabel>
        <h1 className="mt-2 text-[30px] font-semibold tracking-[-0.022em]">
          Here&apos;s what your agent knows. Look it over before we go.
        </h1>
        <p className="mt-2 text-[14px] text-mute lh-body max-w-[660px]">
          Every application uses these as the source of truth. If anything looks wrong, jump back
          and fix it — you can always re-run onboarding.
        </p>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-5">
        <Card className="p-5">
          <SectionLabel className="mb-3">Identity</SectionLabel>
          <Row label="Name" value={summary.name} />
          <Row label="Email" value={summary.email} />
          {summary.phone && <Row label="Phone" value={summary.phone} />}
          {summary.location && <Row label="Location" value={summary.location} />}
          {summary.linkedin && <Row label="LinkedIn" value={summary.linkedin} link />}
          {summary.github && <Row label="GitHub" value={summary.github} link />}
          {summary.portfolio && <Row label="Site" value={summary.portfolio} link />}
        </Card>

        <Card className="p-5">
          <SectionLabel className="mb-3">Resume on file</SectionLabel>
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-12 rounded-sm flex items-center justify-center"
              style={{ background: "#FBE9E9", color: "#9C2222" }}
            >
              <Icon name="file" size={16} />
            </div>
            <div className="text-[13.5px] text-ink">
              <div className="font-medium truncate">{summary.resumeFileName ?? "resume.pdf"}</div>
              <div className="text-[12px] text-mute mt-0.5">
                {summary.experienceCount} role{summary.experienceCount === 1 ? "" : "s"} ·{" "}
                {summary.educationCount} education ·{" "}
                {summary.projectsCount} project{summary.projectsCount === 1 ? "" : "s"} ·{" "}
                {summary.totalSkills} skills
              </div>
            </div>
          </div>
          {summary.skillsList.length > 0 && (
            <div className="mt-4">
              <div className="text-[11px] uppercase tracking-[0.06em] font-semibold text-mute mb-2">
                Skills extracted
              </div>
              <div className="flex flex-wrap gap-1.5">
                {summary.skillsList.map((s) => (
                  <Chip key={s}>{s}</Chip>
                ))}
                {summary.totalSkills > summary.skillsList.length && (
                  <span className="text-[12px] text-mute self-center ml-1">
                    +{summary.totalSkills - summary.skillsList.length} more
                  </span>
                )}
              </div>
            </div>
          )}
        </Card>

        <Card className="p-5">
          <SectionLabel className="mb-3">Search target</SectionLabel>
          {summary.targetRoles.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {summary.targetRoles.map((r) => (
                <Chip key={r} tone="accent">
                  {r}
                </Chip>
              ))}
            </div>
          ) : (
            <p className="text-[13px] text-mute">No target roles set.</p>
          )}
          {summary.salaryMin && (
            <Row label="Min salary" value={`$${(summary.salaryMin / 1000).toFixed(0)}k+`} className="mt-4" />
          )}
          {workPrefs.length > 0 && <Row label="Work" value={workPrefs.join(" · ")} className="mt-2" />}
          {summary.workAuth && <Row label="Work auth" value={prettyWorkAuth(summary.workAuth)} className="mt-2" />}
          {summary.locations.length > 0 && (
            <Row label="Locations" value={summary.locations.join(", ")} className="mt-2" />
          )}
        </Card>

        <Card className="p-5">
          <SectionLabel className="mb-3">Voice (used in cover letters)</SectionLabel>
          {summary.voiceSample ? (
            <p className="text-[13px] text-ink/85 lh-body line-clamp-6">{summary.voiceSample}</p>
          ) : (
            <p className="text-[13px] text-mute lh-body">
              No voice sample yet. Cover letters will use a thoughtful-professional default.
            </p>
          )}
        </Card>
      </div>

      <Card className="p-6 mt-8" style={{ borderColor: "var(--accent)" }}>
        <SectionLabel className="mb-3">How many applications should I send?</SectionLabel>
        <div className="grid grid-cols-4 gap-3">
          {BATCH_OPTIONS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setBatchSize(n)}
              className={`h-16 rounded-ctrl border text-left px-4 transition-colors ${
                batchSize === n
                  ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                  : "border-line bg-white hover:border-line-hi"
              }`}
            >
              <div className="text-[22px] font-semibold tabular tracking-[-0.018em]">{n}</div>
              <div className="text-[11.5px] text-mute mt-0.5">
                {n === 5 ? "Quick try" : n === 10 ? "Recommended" : n === 20 ? "Wide net" : "Aggressive"}
              </div>
            </button>
          ))}
        </div>

        <div className="mt-6 flex items-center justify-between">
          <div className="text-[12.5px] text-mute lh-body max-w-md">
            I&apos;ll find the {batchSize} jobs that best match your resume, tailor each one, and
            submit them on your behalf. You can watch live in the tracker.
          </div>
          {error && (
            <div className="text-[12.5px] text-error flex items-center gap-1.5">
              <Icon name="alert-circle" size={13} /> {error}
            </div>
          )}
          <Button
            size="lg"
            variant="primary"
            onClick={start}
            disabled={starting}
            loading={starting}
            trailing={!starting && <Icon name="paper-plane" size={14} />}
          >
            {starting ? "Starting…" : `Start applying to ${batchSize}`}
          </Button>
        </div>
      </Card>

      <div className="mt-6 text-center text-[12px] text-mute">
        Demo mode is on by default — the agent fills each form and stops before clicking Submit.
        Flip <code className="text-ink">REAL_SUBMIT_ENABLED=true</code> to actually submit.
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  link,
  className = "",
}: {
  label: string;
  value: string;
  link?: boolean;
  className?: string;
}) {
  return (
    <div className={`flex items-baseline gap-3 text-[13px] ${className}`}>
      <span className="text-mute w-[80px] shrink-0">{label}</span>
      {link ? (
        <a
          href={value.startsWith("http") ? value : `https://${value}`}
          target="_blank"
          rel="noreferrer"
          className="text-ink hover:underline truncate"
        >
          {value}
        </a>
      ) : (
        <span className="text-ink truncate">{value}</span>
      )}
    </div>
  );
}

function prettyWorkAuth(v: string): string {
  if (v === "us_citizen_pr") return "US citizen / Permanent resident";
  if (v === "needs_sponsorship") return "Needs sponsorship";
  return v;
}
