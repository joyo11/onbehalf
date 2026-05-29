import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon, type IconName } from "@/components/ui/icon";
import { Monogram } from "@/components/ui/monogram";
import { StatusPill } from "@/components/ui/status-pill";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { application, job, user as userTable } from "@/lib/db/schema";
import type { Status } from "@/lib/types";

export default async function DashboardScreen() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <div className="px-10 py-9">
        <Card className="p-8 text-center">
          <p>Please sign in.</p>
        </Card>
      </div>
    );
  }

  const weekAgo = new Date(Date.now() - 7 * 86400_000);

  // Pull just the fields we need to compute stats in JS — the Supabase
  // transaction pooler chokes on `count(*) FILTER (WHERE ...)` aggregates,
  // so we avoid them entirely. For small per-user app counts this is
  // negligible.
  const [allApps, recent, gmailRow] = await Promise.all([
    db
      .select({
        status: application.status,
        submittedAt: application.submittedAt,
      })
      .from(application)
      .where(eq(application.userId, user.id)),
    db
      .select({
        appId: application.id,
        status: application.status,
        matchScore: application.matchScore,
        submittedAt: application.submittedAt,
        company: job.company,
        title: job.title,
      })
      .from(application)
      .innerJoin(job, eq(application.jobId, job.id))
      .where(eq(application.userId, user.id))
      .orderBy(desc(application.submittedAt))
      .limit(5),
    db
      .select({
        gmailConnectedAt: userTable.gmailConnectedAt,
      })
      .from(userTable)
      .where(eq(userTable.id, user.id))
      .limit(1)
      .then((rs) => rs[0]),
  ]);

  const stats = {
    sentThisWeek: allApps.filter((a) => a.submittedAt && a.submittedAt >= weekAgo).length,
    sentAllTime: allApps.filter((a) => a.submittedAt).length,
    confirmed: allApps.filter((a) => a.status === "confirmed").length,
    pending: allApps.filter((a) => a.status === "pending").length,
    needsHuman: allApps.filter((a) => a.status === "needsHuman").length,
    failed: allApps.filter((a) => a.status === "failed").length,
  };

  const confirmationRate =
    stats.sentAllTime > 0 ? Math.round((stats.confirmed / stats.sentAllTime) * 100) : 0;

  // Active alerts that deserve attention
  const alerts = [
    stats.pending > 0
      ? { id: "pending", icon: "alert-circle" as IconName, label: `${stats.pending} need your review`, href: "/tracker?status=pending" }
      : null,
    stats.needsHuman > 0
      ? {
          id: "needs_human",
          icon: "shield" as IconName,
          label: `${stats.needsHuman} need human input (CAPTCHA / unknown form)`,
          href: "/tracker?status=needsHuman",
        }
      : null,
    stats.failed > 0
      ? {
          id: "failed",
          icon: "x" as IconName,
          label: `${stats.failed} failed — check the tracker`,
          href: "/tracker?status=failed",
        }
      : null,
    !gmailRow?.gmailConnectedAt
      ? {
          id: "gmail",
          icon: "mail" as IconName,
          label: "Connect Gmail to track confirmation emails",
          href: "/onboarding",
        }
      : null,
  ].filter(Boolean) as Array<{ id: string; icon: IconName; label: string; href: string }>;

  return (
    <div className="px-10 py-9 max-w-[1440px] mx-auto">
      <DashHeader email={user.email} />

      <div className="mt-8 grid grid-cols-12 gap-6">
        <div className="col-span-9 space-y-6">
          <DashStats
            sentThisWeek={stats.sentThisWeek}
            confirmed={stats.confirmed}
            sentAllTime={stats.sentAllTime}
            confirmationRate={confirmationRate}
            needsHuman={stats.needsHuman}
          />
          <DashRecent rows={recent} />
        </div>
        <div className="col-span-3 space-y-6">
          <DashAlerts alerts={alerts} />
          <DashGmail connected={!!gmailRow?.gmailConnectedAt} />
          <DashNext />
        </div>
      </div>
    </div>
  );
}

function DashHeader({ email }: { email: string }) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  return (
    <div className="flex items-start justify-between">
      <div>
        <h1 className="text-[30px] font-semibold tracking-[-0.022em]">
          {greeting}, {email.split("@")[0]}.
        </h1>
        <p className="mt-2 text-[14px] text-mute lh-body">
          Here&apos;s what your agent has been up to.
        </p>
      </div>
      <Link href="/search">
        <Button variant="primary" size="lg" leading={<Icon name="search" size={14} />}>
          New search
        </Button>
      </Link>
    </div>
  );
}

function DashStats({
  sentThisWeek,
  confirmed,
  sentAllTime,
  confirmationRate,
  needsHuman,
}: {
  sentThisWeek: number;
  confirmed: number;
  sentAllTime: number;
  confirmationRate: number;
  needsHuman: number;
}) {
  return (
    <div className="grid grid-cols-3 gap-4">
      <Stat
        label="Sent this week"
        value={sentThisWeek.toString()}
        sub={`${sentAllTime} all-time`}
        icon="paper-plane"
      />
      <Stat
        label="Confirmed"
        value={confirmed.toString()}
        sub={`${confirmationRate}% confirmation rate`}
        icon="check-circle"
        accent
      />
      <Stat
        label="Awaiting human"
        value={needsHuman.toString()}
        sub={needsHuman === 0 ? "Nothing blocking" : "Open the tracker"}
        icon="shield"
      />
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  icon,
  accent,
}: {
  label: string;
  value: string;
  sub: string;
  icon: IconName;
  accent?: boolean;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div className="text-[12px] uppercase tracking-[0.06em] font-semibold text-mute">
          {label}
        </div>
        <Icon
          name={icon}
          size={15}
          className={accent ? "" : "text-mute"}
          style={accent ? { color: "var(--accent)" } : undefined}
        />
      </div>
      <div className="mt-2 text-[32px] font-semibold tabular tracking-[-0.018em]">{value}</div>
      <div className="text-[12.5px] text-mute mt-1">{sub}</div>
    </Card>
  );
}

function DashRecent({
  rows,
}: {
  rows: Array<{
    appId: string;
    status: Status;
    matchScore: number;
    submittedAt: Date | null;
    company: string;
    title: string;
  }>;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="px-5 py-4 border-b border-line flex items-center justify-between">
        <div className="text-[14px] font-semibold">Recent applications</div>
        <Link href="/tracker" className="text-[12.5px] text-mute hover:text-ink">
          See all →
        </Link>
      </div>
      {rows.length === 0 ? (
        <div className="px-5 py-12 text-center">
          <Icon name="inbox" size={20} className="text-mute mx-auto" />
          <p className="text-[13.5px] text-mute mt-3">
            No applications yet. Start a new search to apply.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((r) => (
            <li key={r.appId}>
              <Link
                href={`/detail?id=${encodeURIComponent(r.appId)}`}
                className="flex items-center gap-3 px-5 py-3.5 hover:bg-[#F1F0EB]/40"
              >
                <Monogram name={r.company} size={36} />
                <div className="flex-1 min-w-0">
                  <div className="text-[13.5px] font-medium truncate">{r.title}</div>
                  <div className="text-[12px] text-mute truncate">
                    {r.company}
                    {r.submittedAt
                      ? ` · ${r.submittedAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`
                      : ""}
                  </div>
                </div>
                <StatusPill status={r.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function DashAlerts({
  alerts,
}: {
  alerts: Array<{ id: string; icon: IconName; label: string; href: string }>;
}) {
  if (alerts.length === 0) {
    return (
      <Card className="p-5">
        <div className="text-[12px] uppercase tracking-[0.06em] font-semibold text-mute">Alerts</div>
        <div className="mt-3 flex items-center gap-2 text-[13px] text-mute">
          <Icon name="check" size={13} style={{ color: "var(--accent)" }} />
          You&apos;re all caught up.
        </div>
      </Card>
    );
  }
  return (
    <Card className="p-5">
      <div className="text-[12px] uppercase tracking-[0.06em] font-semibold text-mute mb-3">
        Alerts
      </div>
      <ul className="space-y-2.5">
        {alerts.map((a) => (
          <li key={a.id}>
            <Link
              href={a.href}
              className="flex items-start gap-2 text-[13px] text-ink/85 hover:text-ink"
            >
              <Icon name={a.icon} size={13} className="mt-0.5 shrink-0 text-warning" />
              <span>{a.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function DashGmail({ connected }: { connected: boolean }) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div className="text-[12px] uppercase tracking-[0.06em] font-semibold text-mute">Gmail</div>
        <Icon name="mail" size={14} className="text-mute" />
      </div>
      {connected ? (
        <div className="mt-3">
          <div
            className="flex items-center gap-1.5 text-[13px] font-medium"
            style={{ color: "var(--accent-hi)" }}
          >
            <Icon name="check-circle" size={13} /> Connected
          </div>
          <p className="text-[12px] text-mute mt-1.5 lh-body">
            We&apos;ll check your inbox daily and mark applications as Confirmed.
          </p>
        </div>
      ) : (
        <div className="mt-3">
          <p className="text-[12.5px] text-mute lh-body">
            Connect Gmail to detect confirmation emails automatically.
          </p>
          <Link
            href="/api/auth/google/start"
            className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] font-medium"
            style={{ color: "var(--accent-hi)" }}
          >
            Connect now <Icon name="arrow-right" size={12} />
          </Link>
        </div>
      )}
    </Card>
  );
}

function DashNext() {
  return (
    <Card className="p-5">
      <div className="text-[12px] uppercase tracking-[0.06em] font-semibold text-mute mb-3">
        Try next
      </div>
      <ul className="space-y-2.5 text-[13px] text-ink/85">
        <li>
          <Link href="/search" className="flex items-start gap-2 hover:text-ink">
            <Icon
              name="search"
              size={13}
              className="mt-0.5 shrink-0"
              style={{ color: "var(--accent)" }}
            />
            Run a new search
          </Link>
        </li>
        <li>
          <Link href="/tracker" className="flex items-start gap-2 hover:text-ink">
            <Icon
              name="table-2"
              size={13}
              className="mt-0.5 shrink-0"
              style={{ color: "var(--accent)" }}
            />
            Open the tracker
          </Link>
        </li>
        <li>
          <Link href="/settings" className="flex items-start gap-2 hover:text-ink">
            <Icon
              name="user"
              size={13}
              className="mt-0.5 shrink-0"
              style={{ color: "var(--accent)" }}
            />
            Update your profile
          </Link>
        </li>
      </ul>
    </Card>
  );
}
