import { and, eq, notInArray, sql } from "drizzle-orm";
import { db } from "../db/client";
import { job } from "../db/schema";
import { embedBatch } from "../embeddings";
import { SEED_COMPANIES, type AtsSource } from "./companies";
import { fetchGreenhouseJobs } from "./greenhouse";
import { fetchLeverJobs } from "./lever";
import type { ParsedJob } from "./types";

export type ScrapeResult = {
  company: string;
  source: string;
  found: number;
  upserted: number;
  error: string | null;
};

async function upsertJobs(parsed: ParsedJob[]): Promise<number> {
  if (parsed.length === 0) return 0;

  // Generate embeddings for the JD text (title + first 4k chars of jdText) in batches.
  // We do this BEFORE the upsert so the row hits the DB with its embedding in one shot.
  let embeddings: (number[] | null)[] = parsed.map(() => null);
  try {
    const texts = parsed.map((j) =>
      `${j.title}${j.location ? ` · ${j.location}` : ""}\n\n${j.jdText.slice(0, 6000)}`,
    );
    embeddings = await embedBatch(texts);
  } catch (e) {
    console.error("JD embedding batch failed; jobs will upsert without embeddings:", e);
  }

  const CHUNK = 100;
  let total = 0;
  for (let i = 0; i < parsed.length; i += CHUNK) {
    const slice = parsed.slice(i, i + CHUNK);
    const embSlice = embeddings.slice(i, i + CHUNK);
    const rows = slice.map((j, k) => ({
      source: j.source,
      sourceJobId: j.sourceJobId,
      company: j.company,
      title: j.title,
      location: j.location,
      jdText: j.jdText,
      salaryMin: j.salaryMin,
      salaryMax: j.salaryMax,
      postedAt: j.postedAt,
      applyUrl: j.applyUrl,
      jdEmbedding: embSlice[k] ?? null,
    }));
    const result = await db
      .insert(job)
      .values(rows)
      .onConflictDoUpdate({
        target: [job.source, job.sourceJobId],
        set: {
          title: sql`excluded.title`,
          location: sql`excluded.location`,
          jdText: sql`excluded.jd_text`,
          salaryMin: sql`excluded.salary_min`,
          salaryMax: sql`excluded.salary_max`,
          postedAt: sql`excluded.posted_at`,
          applyUrl: sql`excluded.apply_url`,
          jdEmbedding: sql`excluded.jd_embedding`,
          isActive: true, // resurrect a previously-disappeared job if it came back
          scrapedAt: sql`now()`,
        },
      })
      .returning({ id: job.id });
    total += result.length;
  }
  return total;
}

async function deactivateMissing(
  source: AtsSource,
  companyName: string,
  seenSourceIds: string[],
): Promise<number> {
  // Mark any previously-active jobs for this company that we didn't see in
  // this scrape as inactive. Skip if the API errored (seenSourceIds is empty)
  // to avoid blanket-deactivating an entire company on one bad fetch.
  if (seenSourceIds.length === 0) return 0;
  const result = await db
    .update(job)
    .set({ isActive: false })
    .where(
      and(
        eq(job.source, source),
        eq(job.company, companyName),
        eq(job.isActive, true),
        notInArray(job.sourceJobId, seenSourceIds),
      ),
    )
    .returning({ id: job.id });
  return result.length;
}

export async function scrapeAll(): Promise<ScrapeResult[]> {
  const results: ScrapeResult[] = [];

  for (const c of SEED_COMPANIES) {
    let parsed: ParsedJob[] = [];
    let error: string | null = null;

    if (c.source === "greenhouse") {
      const r = await fetchGreenhouseJobs({ slug: c.slug, companyName: c.name });
      parsed = r.jobs;
      error = r.error;
    } else if (c.source === "lever") {
      const r = await fetchLeverJobs({ slug: c.slug, companyName: c.name });
      parsed = r.jobs;
      error = r.error;
    } else {
      error = `unsupported source: ${c.source}`;
    }

    let upserted = 0;
    if (parsed.length > 0) {
      try {
        upserted = await upsertJobs(parsed);
      } catch (e) {
        error = e instanceof Error ? e.message : "upsert failed";
      }
    }

    // Mark stale (disappeared) jobs as inactive.
    if (!error && parsed.length > 0) {
      try {
        await deactivateMissing(
          c.source,
          c.name,
          parsed.map((j) => j.sourceJobId),
        );
      } catch (e) {
        // non-fatal — log and continue
        console.error(`deactivateMissing failed for ${c.name}:`, e);
      }
    }

    results.push({
      company: c.name,
      source: c.source,
      found: parsed.length,
      upserted,
      error,
    });

    await new Promise((r) => setTimeout(r, 250));
  }

  return results;
}
