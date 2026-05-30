import { and, desc, eq, isNotNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { application, job, profile, user as userTable } from "@/lib/db/schema";
import type { Status } from "@/lib/types";
import DashboardClient from "./client";

export default async function DashboardScreen() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  const [profileCheck] = await db
    .select({
      fullName: profile.fullName,
      targetRoleTitles: profile.targetRoleTitles,
    })
    .from(profile)
    .where(eq(profile.userId, user.id))
    .limit(1);
  if (!profileCheck?.fullName || profileCheck.targetRoleTitles.length === 0) {
    redirect("/onboarding");
  }

  const weekAgo = new Date(Date.now() - 7 * 86400_000);

  const [allApps, recent, gmailRow] = await Promise.all([
    db
      .select({ status: application.status, submittedAt: application.submittedAt })
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
      .where(and(eq(application.userId, user.id), isNotNull(application.submittedAt)))
      .orderBy(desc(application.submittedAt))
      .limit(5),
    db
      .select({ gmailConnectedAt: userTable.gmailConnectedAt })
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

  const firstName = profileCheck.fullName.split(/\s+/)[0] ?? user.email.split("@")[0];

  return (
    <DashboardClient
      firstName={firstName}
      stats={{ ...stats, confirmationRate }}
      recent={recent.map((r) => ({
        id: r.appId,
        company: r.company,
        role: r.title,
        time: r.submittedAt
          ? r.submittedAt.toLocaleString("en-US", {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })
          : "—",
        status: r.status as Status,
      }))}
      gmailConnected={!!gmailRow?.gmailConnectedAt}
    />
  );
}
