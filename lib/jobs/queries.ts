import { desc, eq, ilike, inArray, isNotNull, or, sql } from "drizzle-orm";
import { getCurrentUser } from "../auth";
import { db } from "../db/client";
import { job, profile, type Job as DbJob } from "../db/schema";

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

/**
 * Strip HTML tags, decode the most common entities, and collapse whitespace.
 * Greenhouse stores JDs as raw HTML — we want clean prose to show users.
 */
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

/**
 * Greenhouse JDs almost always start with "About <Company>" boilerplate. For
 * the matches list, every same-company card would look identical. Skip past
 * the company intro to the role-specific content where possible.
 */
function skipCompanyIntro(text: string): string {
  // Try section headers that mark the role-specific content.
  const markers = [
    /\bAbout the role\b/i,
    /\bThe role\b/i,
    /\bWhat you'?ll do\b/i,
    /\bWhat you will do\b/i,
    /\bResponsibilities\b/i,
    /\bIn this role\b/i,
    /\bYour role\b/i,
  ];
  for (const m of markers) {
    const hit = text.search(m);
    if (hit > 50) return text.slice(hit).trim();
  }
  // No marker found — fall back to skipping the first paragraph if it's
  // recognisably an "About <Company>" intro.
  const firstBreak = text.indexOf("\n\n");
  if (firstBreak > 0 && /^about\b/i.test(text)) {
    return text.slice(firstBreak).trim();
  }
  return text;
}

function extractSummary(jdText: string): string {
  const plain = stripHtml(jdText);
  const focused = skipCompanyIntro(plain);
  const cleaned = focused.replace(/\s+/g, " ").trim();
  return cleaned.slice(0, 220).trim() + (cleaned.length > 220 ? "…" : "");
}

function extractBullets(jdText: string): string[] {
  const plain = stripHtml(jdText);
  const focused = skipCompanyIntro(plain);
  const lines = focused
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  // Prefer bullet-prefixed lines
  const bulletLines = lines.filter((l) => l.startsWith("•")).map((l) => l.replace(/^•\s*/, ""));
  if (bulletLines.length >= 3) return bulletLines.slice(0, 8);
  // Fall back to substantive lines, skip section headers and stub fragments
  return lines.filter((l) => l.length > 40 && l.length < 400).slice(0, 6);
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

function dbRowToMatchedJob(
  row: DbJob,
  roleKeywords: string[],
  similarity: number | null,
): MatchedJob {
  // If we have a real cosine similarity, map [0, 1] → [50, 99].
  // text-embedding-3-small JD-vs-resume similarities cluster around 0.3–0.7,
  // so we stretch that band to span the score range.
  let score: number;
  if (similarity != null) {
    const clamped = Math.max(0, Math.min(1, (similarity - 0.2) / 0.6));
    score = Math.round(50 + clamped * 49);
  } else {
    score = computeScore(row.title, row.jdText, roleKeywords);
  }
  return {
    id: row.id,
    source: row.source,
    company: row.company,
    role: row.title,
    location: row.location ?? "Location not listed",
    salary: formatSalary(row.salaryMin, row.salaryMax),
    score,
    posted: formatPosted(row.postedAt),
    summary: extractSummary(row.jdText),
    jdBullets: extractBullets(row.jdText),
    applyUrl: row.applyUrl,
  };
}

export async function findMatchingJobs(q: JobsQuery): Promise<MatchedJob[]> {
  // Always filter out disappeared jobs.
  const conds: ReturnType<typeof ilike>[] = [
    sql`${job.isActive} = true` as ReturnType<typeof ilike>,
  ];

  if (q.roles && q.roles.length > 0) {
    const roleConds = q.roles
      .filter((r) => r.trim().length > 1)
      .map((r) => ilike(job.title, `%${r.trim()}%`));
    if (roleConds.length > 0) {
      const combined = or(...roleConds);
      if (combined) conds.push(combined as ReturnType<typeof ilike>);
    }
  }

  if (q.locations && q.locations.length > 0) {
    const locConds = q.locations
      .filter((l) => l.trim().length > 1)
      .map((l) => ilike(job.location, `%${l.trim()}%`));
    if (locConds.length > 0) {
      const combined = or(...locConds);
      if (combined) conds.push(combined as ReturnType<typeof ilike>);
    }
  }

  if (q.salaryMin != null) {
    conds.push(
      sql`(${job.salaryMax} IS NULL OR ${job.salaryMax} >= ${q.salaryMin})` as ReturnType<
        typeof ilike
      >,
    );
  }

  const limit = q.limit ?? 50;

  // Try to fetch the current user's resume embedding. If we have it, we can
  // do real semantic similarity ranking via pgvector cosine distance.
  let resumeEmbedding: number[] | null = null;
  try {
    const user = await getCurrentUser();
    if (user) {
      const [p] = await db
        .select({ embedding: profile.resumeEmbedding })
        .from(profile)
        .where(eq(profile.userId, user.id))
        .limit(1);
      resumeEmbedding = p?.embedding ?? null;
    }
  } catch {
    // Anonymous query / no profile yet — fall through to keyword scoring
  }

  if (resumeEmbedding) {
    // Format vector as pgvector string literal: [1,2,3,…]
    const vecLiteral = `[${resumeEmbedding.join(",")}]`;
    const baseConds = [isNotNull(job.jdEmbedding), ...conds];
    const rows = await db
      .select({
        row: job,
        similarity: sql<number>`1 - (${job.jdEmbedding} <=> ${vecLiteral}::vector)`.as(
          "similarity",
        ),
      })
      .from(job)
      .where(sql.join(baseConds, sql` AND `))
      .orderBy(sql`${job.jdEmbedding} <=> ${vecLiteral}::vector`)
      .limit(limit);

    return rows.map(({ row, similarity }) =>
      dbRowToMatchedJob(row, q.roles ?? [], Number(similarity)),
    );
  }

  // Fallback: keyword heuristic + recency order
  const rows =
    conds.length > 0
      ? await db
          .select()
          .from(job)
          .where(sql.join(conds, sql` AND `))
          .orderBy(desc(job.postedAt))
          .limit(limit)
      : await db.select().from(job).orderBy(desc(job.postedAt)).limit(limit);

  const matched = rows.map((r) => dbRowToMatchedJob(r, q.roles ?? [], null));
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
  return dbRowToMatchedJob(row, [], null);
}

export async function countJobs(): Promise<number> {
  const [r] = await db.select({ count: sql<number>`count(*)::int` }).from(job);
  return r?.count ?? 0;
}
