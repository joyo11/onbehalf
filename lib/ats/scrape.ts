import { sql } from "drizzle-orm";
import { db } from "../db/client";
import { job } from "../db/schema";
import { SEED_COMPANIES } from "./companies";
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

  // chunk to keep parameter count reasonable
  const CHUNK = 100;
  let total = 0;
  for (let i = 0; i < parsed.length; i += CHUNK) {
    const slice = parsed.slice(i, i + CHUNK);
    const rows = slice.map((j) => ({
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
          scrapedAt: sql`now()`,
        },
      })
      .returning({ id: job.id });
    total += result.length;
  }
  return total;
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

    results.push({
      company: c.name,
      source: c.source,
      found: parsed.length,
      upserted,
      error,
    });

    // Be polite to the public APIs.
    await new Promise((r) => setTimeout(r, 250));
  }

  return results;
}
