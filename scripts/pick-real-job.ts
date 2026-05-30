/**
 * Pick a small-pool of candidate jobs for the first real submission.
 * Filters to direct job-boards.greenhouse.io URLs (we know the agent
 * handles those), recent posts, sponsorship-friendly companies, and
 * roles that match Shafay's profile.
 */
import { and, eq, ilike, sql } from "drizzle-orm";
import { db } from "../lib/db/client";
import { job } from "../lib/db/schema";

async function main() {
  const candidates = await db
    .select({
      id: job.id,
      company: job.company,
      title: job.title,
      location: job.location,
      applyUrl: job.applyUrl,
      postedAt: job.postedAt,
    })
    .from(job)
    .where(
      and(
        eq(job.source, "greenhouse"),
        sql`${job.applyUrl} like 'https://job-boards.greenhouse.io/%/jobs/%'`,
        sql`${job.isActive} = true`,
        sql`(${job.company} ilike '%gitlab%' or ${job.company} ilike '%reddit%' or ${job.company} ilike '%discord%' or ${job.company} ilike '%figma%' or ${job.company} ilike '%stripe%' or ${job.company} ilike '%notion%' or ${job.company} ilike '%vercel%' or ${job.company} ilike '%pinterest%')`,
        ilike(job.title, "%software engineer%"),
        sql`(${job.location} ilike '%remote%' or ${job.location} ilike '%united states%' or ${job.location} ilike '%new york%' or ${job.location} ilike '%san francisco%')`,
      ),
    )
    .orderBy(sql`${job.postedAt} desc nulls last`)
    .limit(8);

  console.log(`Found ${candidates.length} candidate jobs:`);
  for (const c of candidates) {
    console.log(`  ${c.id}`);
    console.log(`    ${c.company} — ${c.title}`);
    console.log(`    ${c.location} · posted ${c.postedAt?.toLocaleDateString() ?? "?"}`);
    console.log(`    ${c.applyUrl}`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
