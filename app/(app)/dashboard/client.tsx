"use client";

import Link from "next/link";
import { Ic } from "@/components/ob/icons";
import {
  brandFor,
  CompanyTile,
  Eyebrow,
  StatusPill,
  useCountUp,
} from "@/components/ob/primitives";
import type { Status } from "@/lib/types";

type RecentRow = {
  id: string;
  company: string;
  role: string;
  time: string;
  status: Status;
};

type Props = {
  firstName: string;
  stats: {
    sentThisWeek: number;
    sentAllTime: number;
    confirmed: number;
    confirmationRate: number;
    needsHuman: number;
    failed: number;
    pending: number;
  };
  recent: RecentRow[];
  gmailConnected: boolean;
};

export default function DashboardClient({ firstName, stats, recent, gmailConnected }: Props) {
  const hasData = stats.sentAllTime > 0;

  return (
    <div className="max-w-[1180px] mx-auto px-5 sm:px-9 py-7 sm:py-9">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 sm:gap-6">
        <div className="min-w-0">
          <h1
            className="font-display font-black text-ink"
            style={{ fontSize: "clamp(1.75rem, 4vw, 2.7rem)", lineHeight: 1.05, letterSpacing: "-0.03em" }}
          >
            {greeting()}, {firstName}.
          </h1>
          <p className="mt-2.5 text-[15px] sm:text-[16px] text-ink-mute">
            {hasData
              ? "Here's what your agent has been up to."
              : "Let's find a job and apply to it together."}
          </p>
        </div>
        <Link
          href="/search"
          className="sm:shrink-0 inline-flex items-center justify-center gap-2.5 rounded-full bg-teal-500 hover:bg-teal-600 text-white font-semibold text-[15px] px-5 py-3 whitespace-nowrap transition-colors ob-card-shadow w-full sm:w-auto"
        >
          <Ic.search className="h-[18px] w-[18px]" />
          {hasData ? "New search" : "Find a job"}
        </Link>
      </div>

      <div className="mt-7 grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6 items-start">
        <div>
          {hasData ? <ActiveState stats={stats} recent={recent} /> : <EmptyState />}
        </div>

        <div className="space-y-5">
          <RailCard delay={40}>
            <Eyebrow className="mb-2.5">Alerts</Eyebrow>
            {stats.needsHuman > 0 || stats.failed > 0 || stats.pending > 0 ? (
              <ul className="space-y-2">
                {stats.needsHuman > 0 && (
                  <AlertRow
                    icon={<Ic.shield className="h-4 w-4 mt-0.5 text-amber-500 shrink-0" />}
                    href="/tracker"
                  >
                    {stats.needsHuman} need a human (CAPTCHA / unknown form)
                  </AlertRow>
                )}
                {stats.failed > 0 && (
                  <AlertRow
                    icon={<Ic.x className="h-4 w-4 mt-0.5 text-coral-600 shrink-0" />}
                    href="/tracker"
                  >
                    {stats.failed} failed — check the tracker
                  </AlertRow>
                )}
                {stats.pending > 0 && (
                  <AlertRow
                    icon={<Ic.spark className="h-4 w-4 mt-0.5 text-teal-500 shrink-0" />}
                    href="/review"
                  >
                    {stats.pending} need your review
                  </AlertRow>
                )}
              </ul>
            ) : (
              <p className="flex items-start gap-2.5 text-[14px] text-ink-soft">
                <Ic.check className="h-4 w-4 mt-0.5 text-teal-500 shrink-0" />
                You&apos;re all caught up.
              </p>
            )}
          </RailCard>

          <RailCard delay={140}>
            <Eyebrow className="mb-3">Try next</Eyebrow>
            <ul className="space-y-2.5 text-[14px] font-medium text-ink-soft">
              <TryNext href="/search" icon={<Ic.search className="h-[17px] w-[17px] text-teal-600" />}>
                Run a new search
              </TryNext>
              <TryNext href="/tracker" icon={<Ic.table className="h-[17px] w-[17px] text-teal-600" />}>
                Open the tracker
              </TryNext>
              <TryNext href="/settings" icon={<Ic.user className="h-[17px] w-[17px] text-teal-600" />}>
                Update your profile
              </TryNext>
            </ul>
          </RailCard>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── EmptyState ───────────────────────── */
function EmptyState() {
  return (
    <div className="relative">
      <div className="relative bg-white rounded-xl4 border border-sand-200 ob-card-shadow-lg overflow-hidden">
        <div
          className="absolute inset-0 opacity-60"
          style={{
            background:
              "radial-gradient(120% 90% at 85% -10%, #ECFBF7 0%, transparent 55%)",
          }}
        />
        <div className="relative px-10 py-14 flex flex-col items-center text-center">
          <Eyebrow tone="teal" className="mb-4">
            A note from your agent
          </Eyebrow>
          <p
            className="font-display italic text-ink-soft mb-9"
            style={{
              fontSize: "clamp(1.5rem, 2.4vw, 2rem)",
              lineHeight: 1.25,
              maxWidth: "24ch",
              letterSpacing: "-0.01em",
            }}
          >
            &ldquo;Point me at what you want — I&apos;ll start applying tonight.&rdquo;
          </p>
          <p className="font-display font-bold text-ink text-[20px] mb-2">
            Your queue is empty — for now.
          </p>
          <p className="text-[15px] text-ink-mute max-w-[44ch] mb-8 leading-relaxed">
            Run one search and your agent combs Greenhouse, Lever, Ashby and Workday, tailors each
            application in your voice, and surfaces the wins.
          </p>
          <Link
            href="/search"
            className="group inline-flex items-center gap-2.5 rounded-full bg-teal-500 hover:bg-teal-600 text-white font-semibold text-[16px] pl-7 pr-6 py-3.5 transition-colors ob-card-shadow"
          >
            <Ic.search className="h-[18px] w-[18px]" />
            Run your first search
            <Ic.arrow className="h-[18px] w-[18px] transition-transform group-hover:translate-x-1" />
          </Link>
          <p className="mt-9 font-hand text-ink-faint" style={{ fontSize: "1.5rem" }}>
            — signed, your agent
          </p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-5">
        {[
          [<Ic.spark key="s" className="h-[18px] w-[18px] text-teal-600 shrink-0" />, "Tailored in your voice"],
          [<Ic.checkCircle key="c" className="h-[18px] w-[18px] text-teal-600 shrink-0" />, "Tracked to confirmation"],
          [<Ic.mail key="m" className="h-[18px] w-[18px] text-teal-600 shrink-0" />, "Only the wins wake you"],
        ].map(([icon, t]) => (
          <div key={t as string} className="rounded-xl3 border border-sand-200 bg-white/60 p-5 flex items-center gap-3">
            {icon}
            <p className="text-[14px] font-medium text-ink-soft">{t}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ───────────────────────── ActiveState ───────────────────────── */
function ActiveState({ stats, recent }: { stats: Props["stats"]; recent: RecentRow[] }) {
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <StatCard
          idx={0}
          label="Sent this week"
          value={stats.sentThisWeek}
          sub={`${stats.sentAllTime} all-time`}
          icon={Ic.send}
        />
        <StatCard
          idx={1}
          label="Confirmed"
          value={stats.confirmed}
          sub={`${stats.confirmationRate}% confirmation rate`}
          icon={Ic.checkCircle}
          tone="sage"
        />
        <StatCard
          idx={2}
          label="Awaiting you"
          value={stats.needsHuman}
          sub={stats.needsHuman === 0 ? "Nothing blocking" : "open the tracker →"}
          icon={Ic.shield}
        />
      </div>

      <div
        className="ob-rise bg-white rounded-xl3 border border-sand-200 ob-card-shadow mt-5 overflow-hidden"
        style={{ transitionDelay: "180ms" }}
      >
        <div className="flex items-center justify-between gap-4 px-5 pt-5 pb-3">
          <p className="font-display font-bold text-ink text-[18px] whitespace-nowrap">
            Recent applications
          </p>
          <Link
            href="/tracker"
            className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-teal-700 hover:text-teal-800 whitespace-nowrap transition-colors"
          >
            See all <Ic.arrow className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="border-t border-sand-100">
          {recent.length === 0 ? (
            <div className="px-5 py-12 text-center text-[14px] text-ink-mute">
              No applications yet. Start a search to apply.
            </div>
          ) : (
            recent.map((a, i) => (
              <Link
                key={a.id}
                href={`/detail?id=${encodeURIComponent(a.id)}`}
                className={
                  "w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-sand-50 transition-colors " +
                  (i === recent.length - 1 ? "" : "border-b border-sand-100")
                }
              >
                <CompanyTile
                  letter={brandFor(a.company).letter}
                  color={brandFor(a.company).color}
                  size={42}
                  radius={11}
                />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-ink text-[15px] truncate">{a.role}</p>
                  <p className="text-[13px] text-ink-faint mt-0.5">
                    {a.company} · {a.time}
                  </p>
                </div>
                <StatusPill status={a.status} size="sm" />
              </Link>
            ))
          )}
        </div>
      </div>
    </>
  );
}

/* ───────────────────────── Building blocks ───────────────────────── */
function StatCard({
  label,
  value,
  sub,
  icon,
  idx,
  tone,
}: {
  label: string;
  value: number;
  sub: string;
  icon: (p: { className?: string; style?: React.CSSProperties }) => React.JSX.Element;
  idx: number;
  tone?: "sage" | "teal";
}) {
  const v = useCountUp(value, { duration: 1000 });
  const Icon = icon;
  const accentColor = tone === "sage" ? "#7A8B3F" : tone === "teal" ? "#0D9488" : null;
  return (
    <div
      className="ob-rise bg-white rounded-xl3 border border-sand-200 ob-card-shadow p-6"
      style={{ transitionDelay: idx * 50 + "ms" }}
    >
      <div className="flex items-start justify-between">
        <Eyebrow>{label}</Eyebrow>
        <Icon
          className="h-[18px] w-[18px] text-ink-faint"
          style={accentColor ? { color: accentColor } : undefined}
        />
      </div>
      <p
        className="font-display font-black mt-3"
        style={{
          fontSize: "3.1rem",
          lineHeight: 1,
          letterSpacing: "-0.03em",
          color: accentColor || "#1C1B17",
        }}
      >
        {v}
      </p>
      <p className="text-[13px] text-ink-mute mt-2">{sub}</p>
    </div>
  );
}

function RailCard({
  children,
  className = "",
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <div
      className={"ob-rise bg-white rounded-xl3 border border-sand-200 ob-card-shadow p-5 " + className}
      style={{ transitionDelay: delay + "ms" }}
    >
      {children}
    </div>
  );
}

function AlertRow({
  icon,
  href,
  children,
}: {
  icon: React.ReactNode;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <li>
      <Link
        href={href}
        className="flex items-start gap-2.5 text-[14px] text-ink-soft hover:text-ink transition-colors"
      >
        {icon}
        <span>{children}</span>
      </Link>
    </li>
  );
}

function TryNext({
  href,
  icon,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <li>
      <Link
        href={href}
        className="flex items-center gap-2.5 hover:text-teal-700 transition-colors"
      >
        {icon}
        {children}
      </Link>
    </li>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}
