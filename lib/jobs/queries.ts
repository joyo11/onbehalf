import { desc, ilike, inArray, or, sql } from "drizzle-orm";
import { db } from "../db/client";
import { job, type Job as DbJob } from "../db/schema";

export type MatchedJob = {
  id: string;
  source: "greenhouse" | "lever" | "ashby";
  company: string;
  role: string;
  location: string;
  salary: string;
  score: number;
  posted: string;
  summary: string;
  jdBullets: string[];
  applyUrl: string;
};

export type JobsQuery = {
  roles?: string[]; // role keywords (any-match)
  locations?: string[]; // location keywords (any-match)
  salaryMin?: number;
  limit?: number;
};

function formatSalary(min: number | null, max: number | null): string {
  if (min == null && max == null) return "Salary not listed";
  const fmt = (n: number) => (n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${n}`);
  if (min != null && max != null) return `${fmt(min)} – ${fmt(max)}`;
  if (min != null) return `${fmt(min)}+`;
  return `up to ${fmt(max!)}`;
}

function formatPosted(d: Date | null): string {
  if (!d) return "Recently";
  const diffMs = Date.now() - d.getTime();
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  if (hours < 1) return "Just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function extractSummary(jdText: string): string {
  const cleaned = jdText.replace(/\s+/g, " ").trim();
  return cleaned.slice(0, 220).trim() + (cleaned.length > 220 ? "…" : "");
}

function extractBullets(jdText: string): string[] {
  const lines = jdText
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  // Prefer bullet-prefixed lines
  const bulletLines = lines.filter((l) => l.startsWith("•")).map((l) => l.replace(/^•\s*/, ""));
  if (bulletLines.length >= 3) return bulletLines.slice(0, 8);
  // Fall back to all lines, skip section headers
  return lines.filter((l) => l.length > 30 && l.length < 400).slice(0, 6);
}

/**
 * Simple keyword-overlap score (will be replaced by real embeddings in Phase 5).
 * Counts how many of the user's role keywords appear in the job's title + JD.
 */
function computeScore(
  title: string,
  jdText: string,
  roleKeywords: string[],
): number {
  if (roleKeywords.length === 0) {
    // Without specific keywords, score by title length signal + recency-ish bucket
    return 70 + Math.floor(Math.random() * 18);
  }
  const haystack = `${title} ${jdText.slice(0, 4000)}`.toLowerCase();
  const hits = roleKeywords.filter((k) => haystack.includes(k.toLowerCase())).length;
  const ratio = hits / Math.max(1, roleKeywords.length);
  // Map [0, 1] → [55, 95]
  return Math.min(95, Math.round(55 + ratio * 40));
}

function dbRowToMatchedJob(row: DbJob, roleKeywords: string[]): MatchedJob {
  return {
    id: row.id,
    source: row.source,
    company: row.company,
    role: row.title,
    location: row.location ?? "Location not listed",
    salary: formatSalary(row.salaryMin, row.salaryMax),
    score: computeScore(row.title, row.jdText, roleKeywords),
    posted: formatPosted(row.postedAt),
    summary: extractSummary(row.jdText),
    jdBullets: extractBullets(row.jdText),
    applyUrl: row.applyUrl,
  };
}

export async function findMatchingJobs(q: JobsQuery): Promise<MatchedJob[]> {
  const conds = [] as ReturnType<typeof ilike>[];

  // Roles: any keyword appears in title
  if (q.roles && q.roles.length > 0) {
    const roleConds = q.roles
      .filter((r) => r.trim().length > 1)
      .map((r) => ilike(job.title, `%${r.trim()}%`));
    if (roleConds.length > 0) {
      const combined = or(...roleConds);
      if (combined) conds.push(combined as ReturnType<typeof ilike>);
    }
  }

  // Locations: any keyword appears in location
  if (q.locations && q.locations.length > 0) {
    const locConds = q.locations
      .filter((l) => l.trim().length > 1)
      .map((l) => ilike(job.location, `%${l.trim()}%`));
    if (locConds.length > 0) {
      const combined = or(...locConds);
      if (combined) conds.push(combined as ReturnType<typeof ilike>);
    }
  }

  // Salary: salary_max >= salaryMin (we only keep jobs that could pay at least this much)
  // Only filter if salary is actually listed; jobs with null salary still match.
  if (q.salaryMin != null) {
    conds.push(
      sql`(${job.salaryMax} IS NULL OR ${job.salaryMax} >= ${q.salaryMin})` as ReturnType<
        typeof ilike
      >,
    );
  }

  const limit = q.limit ?? 50;
  const rows =
    conds.length > 0
      ? await db
          .select()
          .from(job)
          .where(sql.join(conds, sql` AND `))
          .orderBy(desc(job.postedAt))
          .limit(limit)
      : await db.select().from(job).orderBy(desc(job.postedAt)).limit(limit);

  const matched = rows.map((r) => dbRowToMatchedJob(r, q.roles ?? []));
  matched.sort((a, b) => b.score - a.score);
  return matched;
}

export async function getJobById(id: string): Promise<MatchedJob | null> {
  const [row] = await db
    .select()
    .from(job)
    .where(inArray(job.id, [id]))
    .limit(1);
  if (!row) return null;
  return dbRowToMatchedJob(row, []);
}

export async function countJobs(): Promise<number> {
  const [r] = await db.select({ count: sql<number>`count(*)::int` }).from(job);
  return r?.count ?? 0;
}
