"use client";

/*  Dashboard — 3 stat cards, live queue, Gmail rail. */

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon, type IconName } from "@/components/ui/icon";
import { MatchScore } from "@/components/ui/match-score";
import { Monogram } from "@/components/ui/monogram";
import { StatusPill } from "@/components/ui/status-pill";
import { GMAIL, QUEUE } from "@/lib/data";
import type { QueueItem } from "@/lib/types";

export default function DashboardScreen() {
  const router = useRouter();
  return (
    <div className="px-10 py-9 max-w-[1440px] mx-auto">
      <DashHeader onNewSearch={() => router.push("/search")} />
      <div className="mt-8 grid grid-cols-12 gap-6">
        <div className="col-span-9 space-y-6">
          <DashStats />
          <DashQueue
            onOpenReview={() => router.push("/review")}
            onOpenDetail={() => router.push("/detail")}
          />
        </div>
        <div className="col-span-3 space-y-6">
          <DashGmail />
          <DashNext />
        </div>
      </div>
    </div>
  );
}

function DashHeader({ onNewSearch }: { onNewSearch: () => void }) {
  return (
    <div className="flex items-start justify-between">
      <div>
        <div className="text-[12.5px] text-mute flex items-center gap-1.5">
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: "var(--accent)", animation: "pulse 1.6s ease-in-out infinite" }}
          />
          Onbehalf is running
        </div>
        <h1 className="mt-1.5 text-[30px] font-semibold tracking-[-0.022em]">
          I applied to 12 jobs for you today.
        </h1>
        <div className="mt-2 text-[14px] text-mute lh-body">
          7 confirmed, 3 awaiting confirmation, 2 need your review. Estimated cost so far:{" "}
          <span className="text-ink font-medium">$3.40 of $29</span>.
        </div>
      </div>
      <div className="flex items-center gap-2.5">
        <Button variant="secondary" leading={<Icon name="gauge" size={14} />}>
          Pause queue
        </Button>
        <Button variant="primary" onClick={onNewSearch} leading={<Icon name="plus" size={14} />}>
          New search
        </Button>
      </div>
    </div>
  );
}

type Stat = {
  label: string;
  value: number;
  delta: string;
  accent: boolean;
  sub: string;
};

function DashStats() {
  const stats: Stat[] = [
    { label: "Applied today", value: 12, delta: "+3 last hour", accent: true, sub: "Across 4 ATS providers" },
    { label: "Confirmed", value: 7, delta: "58% confirm rate", accent: false, sub: "Last 30 days" },
    { label: "Pending your review", value: 2, delta: "Oldest: 14 min", accent: false, sub: "1 high-confidence, 1 borderline" },
  ];
  const icons: IconName[] = ["paper-plane", "check-circle", "clock"];
  const widths = [80, 58, 30];
  return (
    <div className="grid grid-cols-3 gap-4">
      {stats.map((s, i) => (
        <Card key={s.label} className="p-5">
          <div className="flex items-center justify-between">
            <span className="text-[12px] uppercase tracking-[0.06em] font-semibold text-mute">{s.label}</span>
            <Icon name={icons[i]} size={14} className="text-mute" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-[40px] font-semibold tracking-[-0.025em] tabular-nums">{s.value}</span>
            <span
              className="text-[12.5px] font-medium"
              style={{ color: s.accent ? "var(--accent-hi)" : "#6B6B6B" }}
            >
              {s.delta}
            </span>
          </div>
          <div className="mt-1 text-[12.5px] text-mute">{s.sub}</div>
          <div className="mt-3 h-1 w-full rounded-full bg-[#F2F1EC] overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ width: `${widths[i]}%`, background: s.accent ? "var(--accent)" : "#D6D3CC" }}
            />
          </div>
        </Card>
      ))}
    </div>
  );
}

function DashQueue({
  onOpenReview,
  onOpenDetail,
}: {
  onOpenReview: () => void;
  onOpenDetail: () => void;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-line">
        <div className="flex items-center gap-3">
          <h3 className="text-[15px] font-semibold">Application queue</h3>
          <span className="text-[12px] text-mute">· Today, May 27</span>
        </div>
        <div className="flex items-center gap-2">
          <FilterChip label="All" active />
          <FilterChip label="Needs review" count={2} />
          <FilterChip label="Live" count={3} />
          <FilterChip label="Done" count={5} />
        </div>
      </div>

      <div className="grid grid-cols-[36px_1fr_220px_140px_88px] px-5 py-2.5 text-[11px] uppercase tracking-[0.06em] font-semibold text-mute border-b border-line bg-[#FBFAF7]">
        <div></div>
        <div>Role</div>
        <div>Status</div>
        <div>Activity</div>
        <div className="text-right">Match</div>
      </div>

      <div className="divide-y divide-line">
        {QUEUE.map((q) => (
          <QueueRow key={q.id} q={q} onOpenReview={onOpenReview} onOpenDetail={onOpenDetail} />
        ))}
      </div>

      <div className="px-5 py-3 border-t border-line bg-[#FBFAF7] flex items-center justify-between text-[12.5px] text-mute">
        <span>
          Showing 12 of 47 today. <a href="#" className="font-medium text-ink hover:underline">View all</a>
        </span>
        <span className="flex items-center gap-1.5">
          <Icon name="bolt" size={13} style={{ color: "var(--accent)" }} />
          Next batch in <span className="text-ink font-medium">47 min</span>
        </span>
      </div>
    </Card>
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

function QueueRow({
  q,
  onOpenReview,
  onOpenDetail,
}: {
  q: QueueItem;
  onOpenReview: () => void;
  onOpenDetail: () => void;
}) {
  const clickable = q.status === "pending" || q.status === "confirmed" || q.status === "submitted";
  const handle = () => {
    if (q.status === "pending") onOpenReview();
    else if (clickable) onOpenDetail();
  };
  return (
    <button
      onClick={handle}
      className="w-full grid grid-cols-[36px_1fr_220px_140px_88px] items-center px-5 py-3.5 text-left hover:bg-[#FBFAF7] transition-colors"
    >
      <Monogram name={q.company} size={32} />
      <div className="min-w-0 pr-4">
        <div className="text-[14px] font-medium truncate">{q.role}</div>
        <div className="text-[12px] text-mute mt-0.5">
          {q.company} <span className="text-[#D6D3CC]">·</span> via {q.via}{" "}
          <span className="text-[#D6D3CC]">·</span> {q.time}
        </div>
      </div>
      <div className="flex items-center gap-2 min-w-0">
        <StatusPill status={q.status} />
      </div>
      <div className="text-[12.5px] text-mute truncate pr-3">{q.note}</div>
      <div className="flex items-center justify-end gap-2">
        <MatchScore score={q.score} size={32} stroke={3} />
      </div>
    </button>
  );
}

function DashGmail() {
  return (
    <Card className="overflow-hidden">
      <div className="px-4 py-3 border-b border-line flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon name="mail" size={14} style={{ color: "var(--accent-hi)" }} />
          <h3 className="text-[13.5px] font-semibold">Inbox · today</h3>
        </div>
        <button className="text-[11.5px] text-mute hover:text-ink">View all</button>
      </div>
      <div className="divide-y divide-line">
        {GMAIL.map((g, i) => (
          <div key={i} className="p-4 hover:bg-[#FBFAF7] transition-colors">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[12.5px] font-semibold truncate">{g.sender}</div>
              <div className="text-[11px] text-mute shrink-0">{g.time}</div>
            </div>
            <div className="text-[12.5px] mt-0.5 truncate">{g.subject}</div>
            <div className="text-[11.5px] text-mute mt-1 lh-body line-clamp-2">{g.preview}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function DashNext() {
  const items = [
    { t: "2 applications need your review", d: "Anthropic + Figma — borderline screener confidence." },
    { t: "New batch of 8 matches found", d: "Posted in the last 24h. Estimated $1.20 to apply." },
    { t: "Weekly summary ready", d: "47 applied, 19 confirmed, 3 recruiter replies." },
  ];
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2">
        <Icon name="sparkles" size={14} style={{ color: "var(--accent-hi)" }} />
        <h3 className="text-[13.5px] font-semibold">Next up</h3>
      </div>
      <ul className="mt-4 space-y-3.5">
        {items.map((p, i) => (
          <li key={i} className="flex items-start gap-2.5">
            <span
              className="mt-1 w-1.5 h-1.5 rounded-full shrink-0"
              style={{ background: i === 0 ? "var(--accent)" : "#D6D3CC" }}
            />
            <div>
              <div className="text-[13px] font-medium">{p.t}</div>
              <div className="text-[12px] text-mute mt-0.5 lh-body">{p.d}</div>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
