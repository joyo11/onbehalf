import { desc, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { application, job, profile } from "@/lib/db/schema";
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

function formatSalary(min: number | null, max: number | null): string {
  if (min == null && max == null) return "—";
  const fmt = (n: number) => (n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${n}`);
  if (min != null && max != null) return `${fmt(min)} – ${fmt(max)}`;
  if (min != null) return `${fmt(min)}+`;
  return `up to ${fmt(max!)}`;
}

// Mirror of stripHtml() in lib/jobs/queries.ts — Greenhouse JDs are raw HTML.
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|h[1-6]|li|div)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&rsquo;/g, "'")
    .replace(/&lsquo;/g, "'")
    .replace(/&ldquo;/g, '"')
    .replace(/&rdquo;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{2,}/g, "\n\n");
}

export default async function TrackerPage() {
  const user = await getCurrentUser();
  if (!user) return <TrackerClient initialRows={[]} masterResumeFile="" />;

  const [rows, profileRow] = await Promise.all([
    db
      .select({
        id: application.id,
        status: application.status,
        matchScore: application.matchScore,
        tailoringSummary: application.tailoringSummary,
        coverLetterText: application.coverLetterText,
        submittedAt: application.submittedAt,
        confirmedAt: application.confirmedAt,
        createdAt: application.createdAt,
        jobId: application.jobId,
        company: job.company,
        title: job.title,
        location: job.location,
        salaryMin: job.salaryMin,
        salaryMax: job.salaryMax,
        applyUrl: job.applyUrl,
        jdText: job.jdText,
      })
      .from(application)
      .innerJoin(job, eq(application.jobId, job.id))
      .where(eq(application.userId, user.id))
      .orderBy(desc(application.createdAt)),
    db
      .select({
        resumeFileName: profile.resumeFileName,
      })
      .from(profile)
      .where(eq(profile.userId, user.id))
      .limit(1)
      .then((rs) => rs[0]),
  ]);

  const masterResumeFile = profileRow?.resumeFileName ?? "";

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
      applyUrl: r.applyUrl,
      jdTextClean: stripHtml(r.jdText ?? ""),
      resumeFile: masterResumeFile || "—",
      coverLetterText: r.coverLetterText ?? "",
      changes: r.tailoringSummary || "—",
      changesCount: r.tailoringSummary ? (r.tailoringSummary.match(/[,;]/g)?.length ?? 1) + 1 : 0,
      status: r.status as Status,
      matchScore: r.matchScore,
      confirmation: r.confirmedAt ? fmtApplied(r.confirmedAt) : null,
    };
  });

  return <TrackerClient initialRows={initialRows} masterResumeFile={masterResumeFile} />;
}
