import { desc, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { application, job } from "@/lib/db/schema";
import type { Status, TrackerRow } from "@/lib/types";
import TrackerClient from "./client";

function fmtApplied(d: Date | null): string {
  if (!d) return "—";
  const diff = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 7) return `${diff}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default async function TrackerPage() {
  const user = await getCurrentUser();
  if (!user) return <TrackerClient initialRows={[]} />;

  const rows = await db
    .select({
      id: application.id,
      status: application.status,
      matchScore: application.matchScore,
      tailoringSummary: application.tailoringSummary,
      submittedAt: application.submittedAt,
      confirmedAt: application.confirmedAt,
      createdAt: application.createdAt,
      jobId: application.jobId,
      coverLetterText: application.coverLetterText,
      company: job.company,
      title: job.title,
      location: job.location,
      salaryMin: job.salaryMin,
      salaryMax: job.salaryMax,
      applyUrl: job.applyUrl,
    })
    .from(application)
    .innerJoin(job, eq(application.jobId, job.id))
    .where(eq(application.userId, user.id))
    .orderBy(desc(application.submittedAt));

  function formatSalary(min: number | null, max: number | null): string {
    if (min == null && max == null) return "—";
    const fmt = (n: number) => (n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${n}`);
    if (min != null && max != null) return `${fmt(min)} – ${fmt(max)}`;
    if (min != null) return `${fmt(min)}+`;
    return `up to ${fmt(max!)}`;
  }

  const initialRows: TrackerRow[] = rows.map((r, i) => {
    const appliedAt = r.submittedAt ?? r.createdAt;
    return {
      id: r.id,
      n: i + 1,
      company: { name: r.company, industry: "—", size: "—" },
      role: r.title,
      location: r.location ?? "—",
      salary: formatSalary(r.salaryMin, r.salaryMax),
      appliedAt,
      appliedAtLabel: fmtApplied(appliedAt),
      jd: r.applyUrl,
      resumeFile: `Resume - ${r.company}.pdf`,
      changes: r.tailoringSummary || "—",
      changesCount: r.tailoringSummary ? (r.tailoringSummary.match(/[,;]/g)?.length ?? 1) + 1 : 0,
      status: r.status as Status,
      matchScore: r.matchScore,
      confirmation: r.confirmedAt ? fmtApplied(r.confirmedAt) : null,
    };
  });

  return <TrackerClient initialRows={initialRows} />;
}
