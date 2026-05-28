"use client";

/*  Application detail — timeline + Gmail preview + sidebar. */

import { Button } from "@/components/ui/button";
import { Card, SectionLabel } from "@/components/ui/card";
import { Icon, type IconName } from "@/components/ui/icon";
import { Monogram } from "@/components/ui/monogram";
import { StatusPill } from "@/components/ui/status-pill";
import { DETAIL_TIMELINE, REVIEW_JOB } from "@/lib/data";
import type { TimelineStage } from "@/lib/types";

export default function DetailScreen() {
  return (
    <div className="px-10 py-9 max-w-[1280px] mx-auto">
      <DetailHeader />
      <div className="mt-7 grid grid-cols-12 gap-6">
        <div className="col-span-8 space-y-6">
          <DetailTimeline />
          <DetailEmail />
        </div>
        <div className="col-span-4 space-y-4">
          <DetailSidebar />
          <DetailFiles />
        </div>
      </div>
    </div>
  );
}

function DetailHeader() {
  const job = REVIEW_JOB;
  return (
    <div className="flex items-center gap-5">
      <button className="text-mute hover:text-ink flex items-center gap-1.5 text-[12.5px]">
        <Icon name="chevron-right" size={12} className="rotate-180" /> Dashboard
      </button>
      <span className="text-[#D6D3CC]">/</span>
      <Monogram name={job.company} size={42} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2.5">
          <h1 className="text-[20px] font-semibold tracking-[-0.018em]">{job.role}</h1>
          <StatusPill status="confirmed" />
        </div>
        <div className="text-[12.5px] text-mute mt-0.5">
          {job.company} <span className="text-[#D6D3CC] mx-1">·</span> {job.location}{" "}
          <span className="text-[#D6D3CC] mx-1">·</span> {job.salary}{" "}
          <span className="text-[#D6D3CC] mx-1">·</span> Application #LIN-2148
        </div>
      </div>
      <Button variant="secondary" leading={<Icon name="external" size={13} />}>
        View on Greenhouse
      </Button>
      <Button variant="ghost">
        <Icon name="menu-dots" size={16} />
      </Button>
    </div>
  );
}

function DetailTimeline() {
  return (
    <Card className="overflow-hidden">
      <div className="px-5 py-4 border-b border-line">
        <h3 className="text-[14px] font-semibold">Timeline</h3>
        <div className="text-[12px] text-mute mt-0.5">
          5 minutes start-to-finish. Submitted at 8:16 AM, confirmed at 8:18 AM.
        </div>
      </div>
      <div className="px-5 py-5">
        <ol className="relative">
          <div className="absolute left-[15px] top-3 bottom-3 w-px bg-line" />
          {DETAIL_TIMELINE.map((step, i) => (
            <TimelineStep key={i} step={step} isLast={i === DETAIL_TIMELINE.length - 1} />
          ))}
        </ol>
      </div>
    </Card>
  );
}

function TimelineStep({ step }: { step: TimelineStage; isLast: boolean }) {
  return (
    <li className="relative pl-12 pb-6 last:pb-0">
      <span
        className="absolute left-0 top-0.5 w-[31px] h-[31px] rounded-full flex items-center justify-center"
        style={{ background: "var(--accent-soft)", color: "var(--accent-hi)" }}
      >
        <Icon name={step.icon as IconName} size={14} />
      </span>
      <div className="flex items-center justify-between gap-3">
        <div className="text-[14px] font-medium">{step.label}</div>
        <div className="text-[12px] text-mute tabular-nums shrink-0">{step.time}</div>
      </div>
      <div className="text-[13px] text-mute mt-1 lh-body">{step.desc}</div>

      {step.stage === "submitting" && (
        <div className="mt-3">
          <ScreenshotThumb caption="Greenhouse application form — page 2 of 2" />
        </div>
      )}
      {step.stage === "submitted" && (
        <div className="mt-3">
          <ScreenshotThumb caption="Submission confirmation page" />
        </div>
      )}
    </li>
  );
}

function ScreenshotThumb({ caption }: { caption: string }) {
  return (
    <div className="inline-block rounded-md border border-line bg-white overflow-hidden">
      <div className="w-[320px] h-[170px] relative" style={{ background: "#F8F7F2" }}>
        {/* Stylized fake screenshot */}
        <div className="absolute inset-0 p-4 flex flex-col gap-2">
          <div className="h-3 w-1/3 rounded-sm bg-[#E7E5E0]" />
          <div className="h-2 w-2/3 rounded-sm bg-[#EFEDE7]" />
          <div className="flex gap-2 mt-2">
            <div className="h-7 w-24 rounded-sm bg-[#EFEDE7]" />
            <div className="h-7 w-24 rounded-sm bg-[#EFEDE7]" />
          </div>
          <div className="h-2 w-full rounded-sm bg-[#EFEDE7] mt-2" />
          <div className="h-2 w-4/5 rounded-sm bg-[#EFEDE7]" />
          <div className="h-2 w-2/3 rounded-sm bg-[#EFEDE7]" />
          <div className="mt-auto flex justify-end">
            <div className="h-7 w-28 rounded-sm" style={{ background: "var(--accent)" }} />
          </div>
        </div>
        <button className="absolute top-2 right-2 w-7 h-7 rounded-sm bg-white/80 backdrop-blur flex items-center justify-center text-mute hover:text-ink">
          <Icon name="eye" size={13} />
        </button>
      </div>
      <div className="px-3 py-2 text-[11.5px] text-mute border-t border-line">{caption}</div>
    </div>
  );
}

function DetailEmail() {
  return (
    <Card className="overflow-hidden">
      <div className="px-5 py-4 border-b border-line flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon name="mail" size={14} style={{ color: "var(--accent-hi)" }} />
          <h3 className="text-[14px] font-semibold">Confirmation email · Gmail</h3>
        </div>
        <span className="text-[11.5px] text-mute">Auto-tagged &ldquo;Onbehalf / Linear&rdquo;</span>
      </div>
      <div className="p-6">
        <div className="flex items-center justify-between text-[12.5px] mb-4">
          <div>
            <div className="font-medium">
              Linear Recruiting <span className="text-mute font-normal">&lt;jobs@linear.app&gt;</span>
            </div>
            <div className="text-mute">to maya.chen@gmail.com</div>
          </div>
          <div className="text-mute tabular-nums">May 27, 2026 · 8:18 AM</div>
        </div>
        <div className="text-[14.5px] font-semibold mb-3">
          We received your application — Senior Product Engineer, Workflows
        </div>
        <div className="text-[13.5px] lh-body space-y-3 text-ink/90">
          <p>Hi Maya,</p>
          <p>
            Thanks for applying to the Senior Product Engineer, Workflows role at Linear. We&apos;ve received your
            application and our team will review it carefully.
          </p>
          <p>
            You can expect to hear back from us within 5 business days. If we&apos;d like to move forward, we&apos;ll send you
            a short take-home and a 30-minute intro call with a member of the workflows team.
          </p>
          <p>In the meantime, a few things you might find useful:</p>
          <ul className="ml-5 list-disc space-y-1">
            <li>
              How we work —{" "}
              <a href="#" style={{ color: "var(--accent-hi)" }} className="underline underline-offset-2">
                linear.app/method
              </a>
            </li>
            <li>
              Engineering blog —{" "}
              <a href="#" style={{ color: "var(--accent-hi)" }} className="underline underline-offset-2">
                linear.app/blog
              </a>
            </li>
          </ul>
          <p>
            Thanks again,
            <br />
            The Linear team
          </p>
        </div>
      </div>
    </Card>
  );
}

function DetailSidebar() {
  return (
    <Card className="p-5">
      <SectionLabel>Application</SectionLabel>
      <dl className="mt-4 space-y-3.5 text-[13px]">
        <Meta k="Submitted via" v="Greenhouse (direct API)" />
        <Meta k="Application ID" v="LIN-2148" mono />
        <Meta k="Recruiter" v="Sara Park" link />
        <Meta k="Posted" v="May 25, 2026" />
        <Meta k="Closes" v="June 22, 2026" />
        <Meta k="Match score" v="92 / 100" />
        <Meta k="Estimated cost" v="$0.32" />
      </dl>

      <div className="mt-5 pt-4 border-t border-line">
        <SectionLabel>Company</SectionLabel>
        <div className="mt-3 flex items-start gap-3">
          <Monogram name="Linear" size={36} />
          <div>
            <div className="text-[13.5px] font-medium">Linear</div>
            <div className="text-[12px] text-mute lh-body mt-0.5">
              Issue tracking for high-performing software teams. ~150 people, Series C.
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

function Meta({ k, v, link, mono }: { k: string; v: string; link?: boolean; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-mute">{k}</dt>
      <dd
        className={`text-ink font-medium text-right ${mono ? "font-mono text-[12px]" : ""} ${
          link ? "underline underline-offset-2 cursor-pointer hover:text-[var(--accent-hi)]" : ""
        }`}
      >
        {v}
      </dd>
    </div>
  );
}

function DetailFiles() {
  const files = [
    { n: "maya_chen_resume_linear.pdf", s: "148 KB", tag: "Tailored" },
    { n: "cover_letter_linear.pdf", s: "52 KB", tag: "Tailored" },
    { n: "portfolio_2026.pdf", s: "2.1 MB", tag: "Master" },
  ];
  return (
    <Card className="p-5">
      <SectionLabel>Files sent</SectionLabel>
      <div className="mt-3 space-y-2">
        {files.map((f) => (
          <button
            key={f.n}
            className="w-full flex items-center gap-3 p-2.5 rounded-sm hover:bg-[#FBFAF7] text-left"
          >
            <div
              className="w-9 h-10 rounded-sm bg-[#FBE9E9] flex items-center justify-center"
              style={{ color: "#9C2222" }}
            >
              <Icon name="file" size={14} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[12.5px] font-medium truncate">{f.n}</div>
              <div className="text-[11px] text-mute mt-0.5">
                {f.s} <Dot /> {f.tag}
              </div>
            </div>
            <Icon name="download" size={14} className="text-mute" />
          </button>
        ))}
      </div>
    </Card>
  );
}

function Dot() {
  return <span className="text-[#D6D3CC] mx-1">·</span>;
}
