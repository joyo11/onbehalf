/**
 * Pick a small-company Greenhouse job for the dry-run test — small so a
 * real follow-up submit isn't going to a company you might want to
 * carefully apply to manually.
 */
import { and, eq, ilike, sql } from "drizzle-orm";
import { db } from "../lib/db/client";
import { job } from "../lib/db/schema";

async function main() {
  // Candidate companies: smaller AI / SaaS startups on Greenhouse direct.
  // We want a stable form, not a careers-site wrapper.
  const candidates = await db
    .select({
      id: job.id,
      company: job.company,
      title: job.title,
      location: job.location,
      source: job.source,
      applyUrl: job.applyUrl,
    })
    .from(job)
    .where(
      and(
        eq(job.source, "greenhouse"),
        sql`${job.applyUrl} like 'https://job-boards.greenhouse.io/%/jobs/%'`,
        sql`${job.isActive} = true`,
        ilike(job.title, "%engineer%"),
        sql`${job.company} not ilike '%anthropic%'`,
        sql`${job.company} not ilike '%datadog%'`,
        sql`${job.company} not ilike '%reddit%'`,
        sql`${job.company} not ilike '%asana%'`,
      ),
    )
    .orderBy(sql`random()`)
    .limit(15);

  console.log(`Found ${candidates.length} candidate jobs:`);
  for (const c of candidates) {
    console.log(`  ${c.id}  ${c.company} — ${c.title} (${c.location})`);
    console.log(`    ${c.applyUrl}`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
