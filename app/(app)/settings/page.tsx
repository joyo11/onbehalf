"use client";

/*  Profile / Settings — tabs over the same surfaces. */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, SectionLabel } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Icon } from "@/components/ui/icon";
import { Textarea } from "@/components/ui/input";
import { Tabs } from "@/components/ui/tabs";
import { Toggle } from "@/components/ui/toggle";
import { EXCLUDE_COMPANIES, SKILL_YEARS, TARGET_LOCATIONS } from "@/lib/data";

export default function SettingsScreen() {
  const [tab, setTab] = useState<string>("resume");
  return (
    <div className="px-10 py-9 max-w-[1100px] mx-auto">
      <div>
        <SectionLabel>Settings</SectionLabel>
        <h1 className="mt-2 text-[28px] font-semibold tracking-[-0.022em]">Maya Chen</h1>
        <p className="mt-1 text-[13px] text-mute">
          maya.chen@hey.com <Dot /> Member since March 2026 <Dot /> Pro plan
        </p>
      </div>

      <div className="mt-7">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { id: "resume", label: "Master resume" },
            { id: "experience", label: "Experience" },
            { id: "prefs", label: "Preferences" },
            { id: "voice", label: "Voice sample" },
            { id: "billing", label: "Billing" },
          ]}
        />
      </div>

      <div className="mt-8 anim-pop" key={tab}>
        {tab === "resume" && <TabResume />}
        {tab === "experience" && <TabExperience />}
        {tab === "prefs" && <TabPrefs />}
        {tab === "voice" && <TabVoice />}
        {tab === "billing" && <TabBilling />}
      </div>
    </div>
  );
}

/* ---------- Master resume ---------- */
const RESUME_SECTIONS = [
  {
    name: "Brightlane · Senior Product Engineer",
    sub: "Jun 2023 – Present · Oakland, CA (remote)",
    bullets: [
      "Led front-end team of 4 engineers building internal admin tools at Brightlane (Series B fintech, 90 people).",
      "Shipped a Kubernetes-orchestrated deployment pipeline that reduced deploy time from 22 to 3 minutes.",
      "Built React component library used across 6 product teams; reduced new-page bring-up from 2 days to 4 hours.",
      "Mentored 2 junior engineers through their first 12 months; both promoted to mid-level within 14 months.",
    ],
  },
  {
    name: "Doximity · Software Engineer",
    sub: "Aug 2020 – May 2023 · San Francisco, CA",
    bullets: [
      "Built and maintained the verification platform used by 80% of US physicians.",
      "Reduced onboarding-flow drop-off by 38% through targeted A/B tests on credential capture.",
    ],
  },
];

function TabResume() {
  return (
    <div>
      <div className="flex items-center justify-between">
        <div className="text-[14px] font-medium">Experience sections</div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" leading={<Icon name="upload" size={13} />}>
            Replace resume
          </Button>
          <Button variant="secondary" size="sm" leading={<Icon name="download" size={13} />}>
            Download master PDF
          </Button>
        </div>
      </div>
      <div className="mt-4 space-y-3">
        {RESUME_SECTIONS.map((s, i) => (
          <Card key={i} className="p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[15px] font-semibold">{s.name}</div>
                <div className="text-[12.5px] text-mute mt-0.5">{s.sub}</div>
              </div>
              <button className="text-mute hover:text-ink">
                <Icon name="edit" size={14} />
              </button>
            </div>
            <ul className="mt-4 space-y-2.5 text-[13.5px] lh-body">
              {s.bullets.map((b, j) => (
                <li
                  key={j}
                  className="group flex items-start gap-3 -mx-2 px-2 py-1 rounded-sm hover:bg-[#FBFAF7] transition-colors"
                >
                  <span className="text-mute mt-1.5 shrink-0">•</span>
                  <span className="flex-1">{b}</span>
                  <button className="opacity-0 group-hover:opacity-100 transition-opacity text-mute hover:text-ink">
                    <Icon name="edit" size={13} />
                  </button>
                </li>
              ))}
              <li>
                <button
                  className="text-[12.5px] flex items-center gap-1.5 mt-1"
                  style={{ color: "var(--accent-hi)" }}
                >
                  <Icon name="plus" size={12} /> Add bullet
                </button>
              </li>
            </ul>
          </Card>
        ))}
        <button className="w-full py-3.5 rounded-md border border-dashed border-line text-[13px] text-mute hover:text-ink hover:border-line-hi flex items-center justify-center gap-1.5">
          <Icon name="plus" size={13} /> Add another role
        </button>
      </div>
    </div>
  );
}

/* ---------- Experience tab ---------- */
function TabExperience() {
  return (
    <div>
      <div className="grid grid-cols-2 gap-4 mb-6">
        <Card className="p-5">
          <div className="text-[12px] uppercase tracking-[0.06em] font-semibold text-mute">Total experience</div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-[36px] font-semibold tabular-nums">6.0</span>
            <span className="text-[14px] text-mute">years</span>
          </div>
        </Card>
        <Card className="p-5">
          <div className="text-[12px] uppercase tracking-[0.06em] font-semibold text-mute">In current role</div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-[36px] font-semibold tabular-nums">2.9</span>
            <span className="text-[14px] text-mute">years</span>
          </div>
        </Card>
      </div>
      <SectionLabel className="mb-3">Per-skill experience</SectionLabel>
      <Card className="divide-y divide-line">
        {SKILL_YEARS.map((s) => (
          <div key={s.skill} className="px-4 py-3.5 flex items-center gap-4">
            <div className="flex-1">
              <div className="text-[14px] font-medium">{s.skill}</div>
              <div className="text-[12px] text-mute">{s.level}</div>
            </div>
            <div className="flex-1 max-w-[280px]">
              <div className="h-1.5 rounded-full bg-[#EFEDE7] overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${Math.min(100, s.years * 12)}%`, background: "var(--accent)" }}
                />
              </div>
            </div>
            <div className="w-16 text-right text-[13px] font-medium tabular-nums">{s.years} yr</div>
            <button className="text-mute hover:text-ink">
              <Icon name="edit" size={13} />
            </button>
          </div>
        ))}
      </Card>
    </div>
  );
}

/* ---------- Preferences tab ---------- */
function TabPrefs() {
  return (
    <div className="space-y-7">
      <Card className="p-5">
        <SectionLabel>Work authorization</SectionLabel>
        <div className="mt-3">
          <Segmented
            value="US citizen / Permanent resident"
            options={["US citizen / Permanent resident", "Need sponsorship", "Other"]}
          />
        </div>
      </Card>
      <Card className="p-5">
        <SectionLabel>Remote</SectionLabel>
        <div className="mt-3">
          <Segmented value="Remote OK or hybrid" options={["Remote only", "Remote OK or hybrid", "On-site only"]} />
        </div>
      </Card>
      <Card className="p-5">
        <SectionLabel>Salary floor</SectionLabel>
        <div className="mt-3 flex items-center gap-4">
          <span className="text-[26px] font-semibold tabular-nums">$170,000</span>
          <span className="text-[12.5px] text-mute">base / year · don&apos;t apply below this</span>
          <button className="ml-auto text-mute hover:text-ink">
            <Icon name="edit" size={14} />
          </button>
        </div>
      </Card>
      <Card className="p-5">
        <SectionLabel>Locations &amp; exclusions</SectionLabel>
        <div className="mt-4 space-y-4">
          <div>
            <div className="text-[12.5px] text-mute mb-2">Acceptable locations</div>
            <div className="flex flex-wrap gap-2">
              {TARGET_LOCATIONS.map((l) => (
                <Chip key={l} tone="accent" onRemove={() => {}}>
                  {l}
                </Chip>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[12.5px] text-mute mb-2">Companies to skip</div>
            <div className="flex flex-wrap gap-2">
              {EXCLUDE_COMPANIES.map((c) => (
                <Chip key={c} onRemove={() => {}}>
                  {c}
                </Chip>
              ))}
            </div>
          </div>
        </div>
      </Card>
      <Card className="p-5">
        <SectionLabel>Notifications</SectionLabel>
        <div className="mt-4 space-y-3.5">
          <Pref title="Email me when a confirmation arrives" defaultChecked={true} />
          <Pref title="Email me a daily summary at 9pm Pacific" defaultChecked={true} />
          <Pref title="Slack DM for applications needing review" defaultChecked={false} />
          <Pref title="Pause queue if my confidence drops below 70%" defaultChecked={false} />
        </div>
      </Card>
    </div>
  );
}

function Segmented({
  value,
  options,
  onChange,
}: {
  value: string;
  options: string[];
  onChange?: (v: string) => void;
}) {
  const [v, setV] = useState<string>(value);
  return (
    <div className="inline-flex border border-line bg-white rounded-sm p-0.5">
      {options.map((o) => {
        const active = o === v;
        return (
          <button
            key={o}
            onClick={() => {
              setV(o);
              onChange && onChange(o);
            }}
            className={`h-8 px-3 rounded-[4px] text-[12.5px] font-medium transition-colors ${
              active ? "text-white" : "text-mute hover:text-ink"
            }`}
            style={active ? { background: "var(--accent)" } : undefined}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}

function Pref({ title, defaultChecked }: { title: string; defaultChecked: boolean }) {
  const [v, setV] = useState<boolean>(!!defaultChecked);
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-[13.5px]">{title}</span>
      <Toggle checked={v} onChange={setV} />
    </div>
  );
}

/* ---------- Voice tab ---------- */
function TabVoice() {
  return (
    <div>
      <SectionLabel>Voice sample</SectionLabel>
      <p className="mt-2 text-[13px] text-mute lh-body max-w-[600px]">
        We use this as the reference for tone, sentence length, and word choice across every tailored bullet and cover letter.
      </p>
      <Textarea
        rows={12}
        className="mt-4"
        defaultValue={`Hey — I've been a product engineer at Brightlane for about three years. I tend to ship in tight loops, prefer working close to design, and care a lot about the small details — empty states, keyboard shortcuts, the copy on error toasts. I'd rather own one surface deeply than touch ten things at half-depth.

Most of my best work happens when there's no PM in the room and I get to talk directly to the designer and a couple of customers. I'm allergic to fake-formal cover-letter language and I write the way I talk.`}
      />
      <div className="mt-3 flex items-center justify-between text-[12px] text-mute">
        <span>Last updated 3 weeks ago</span>
        <span className="flex items-center gap-1.5">
          <Icon name="sparkles" size={13} style={{ color: "var(--accent)" }} />
          Voice fingerprint trained
        </span>
      </div>
    </div>
  );
}

/* ---------- Billing tab ---------- */
function TabBilling() {
  const invoices = [
    { d: "May 14, 2026", a: "$29.00", s: "Paid" },
    { d: "Apr 14, 2026", a: "$29.00", s: "Paid" },
    { d: "Mar 14, 2026", a: "$29.00", s: "Paid" },
  ];
  return (
    <div className="space-y-6">
      <Card className="p-6 relative overflow-hidden">
        <div
          className="absolute -top-20 -right-20 w-[260px] h-[260px] rounded-full"
          style={{ background: "radial-gradient(circle, rgba(13,148,136,0.12) 0%, rgba(13,148,136,0) 65%)" }}
        />
        <div className="flex items-start justify-between">
          <div>
            <SectionLabel>Current plan</SectionLabel>
            <div className="mt-2 flex items-baseline gap-3">
              <span className="text-[26px] font-semibold tracking-[-0.018em]">Pro</span>
              <span className="text-[14px] text-mute">$29 / month · renews June 14</span>
            </div>
          </div>
          <Button variant="secondary" leading={<Icon name="arrow-up" size={13} />}>
            Upgrade to Unlimited
          </Button>
        </div>

        <div className="mt-7">
          <div className="flex items-end justify-between text-[12.5px]">
            <span className="text-mute font-medium">Applications used this month</span>
            <span className="font-medium tabular-nums">12 / 100</span>
          </div>
          <div className="mt-2 h-2 w-full rounded-full bg-[#EFEDE7] overflow-hidden">
            <div className="h-full rounded-full" style={{ width: "12%", background: "var(--accent)" }} />
          </div>
          <div className="text-[11.5px] text-mute mt-2">Resets June 14 · 88 applications remaining</div>
        </div>

        <div className="mt-6 grid grid-cols-3 gap-4">
          <Mini label="Confirmed" value="7" sub="58% rate" />
          <Mini label="Recruiter replies" value="3" sub="25% rate" />
          <Mini label="Total spend" value="$3.40" sub="this billing cycle" />
        </div>
      </Card>

      <Card className="p-5">
        <SectionLabel>Payment method</SectionLabel>
        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-8 rounded-sm bg-[#1F2A44] flex items-center justify-center text-white text-[10px] font-semibold tracking-wider">
              VISA
            </div>
            <div>
              <div className="text-[13.5px] font-medium">Visa ending 4242</div>
              <div className="text-[12px] text-mute">Expires 09 / 2028</div>
            </div>
          </div>
          <Button variant="secondary" size="sm">
            Update
          </Button>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="px-5 py-4 border-b border-line">
          <SectionLabel>Recent invoices</SectionLabel>
        </div>
        <div className="divide-y divide-line">
          {invoices.map((r) => (
            <div
              key={r.d}
              className="px-5 py-3 grid grid-cols-[1fr_120px_80px_60px] items-center gap-3 text-[13px]"
            >
              <div>{r.d}</div>
              <div className="text-mute">Pro — monthly</div>
              <div className="font-medium tabular-nums">{r.a}</div>
              <button className="text-mute hover:text-ink justify-self-end">
                <Icon name="download" size={14} />
              </button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function Mini({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-sm border border-line bg-white p-3">
      <div className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-mute">{label}</div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="text-[20px] font-semibold tabular-nums">{value}</span>
      </div>
      <div className="text-[11.5px] text-mute">{sub}</div>
    </div>
  );
}

function Dot() {
  return <span className="text-[#D6D3CC] mx-1">·</span>;
}
