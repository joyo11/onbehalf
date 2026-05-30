/**
 * Helper — pick apply URLs to use as snapshot fixtures across ATSes.
 * Queries our scraped DB for Stripe + Notion (Greenhouse) + a Lever
 * job, and probes Ashby's public API for Linear + PostHog.
 */
import { eq, and, ilike } from "drizzle-orm";
import { db } from "../lib/db/client";
import { job } from "../lib/db/schema";

async function main() {
  console.log("=== From scraped DB ===\n");

  for (const company of ["Stripe", "Notion"]) {
    const [r] = await db
      .select({ id: job.id, title: job.title, location: job.location, applyUrl: job.applyUrl })
      .from(job)
      .where(
        and(
          eq(job.isActive, true),
          eq(job.source, "greenhouse"),
          ilike(job.company, `%${company}%`),
        ),
      )
      .limit(1);
    if (r) {
      console.log(`${company} (greenhouse): ${r.title}`);
      console.log(`  ${r.location ?? "(no loc)"}`);
      console.log(`  ${r.applyUrl}\n`);
    } else {
      console.log(`${company}: not in DB\n`);
    }
  }

  // First Lever job we have
  const [lever] = await db
    .select({ id: job.id, company: job.company, title: job.title, location: job.location, applyUrl: job.applyUrl })
    .from(job)
    .where(and(eq(job.isActive, true), eq(job.source, "lever")))
    .limit(1);
  if (lever) {
    console.log(`Lever (${lever.company}): ${lever.title}`);
    console.log(`  ${lever.location ?? "(no loc)"}`);
    console.log(`  ${lever.applyUrl}\n`);
  }

  console.log("=== From Ashby public API ===\n");
  for (const board of ["linear", "posthog"]) {
    try {
      const res = await fetch(`https://api.ashbyhq.com/posting-api/job-board/${board}`);
      const data = (await res.json()) as { jobs?: Array<{ id: string; title: string; locationName?: string; applyUrl?: string; jobUrl?: string }> };
      const jobs = data.jobs ?? [];
      // Pick the first engineering-flavored role
      const pick = jobs.find((j) =>
        /engineer|developer|fullstack|full-stack|backend|frontend/i.test(j.title),
      );
      if (pick) {
        console.log(`${board} (ashby): ${pick.title}`);
        console.log(`  ${pick.locationName ?? "(no loc)"}`);
        console.log(`  ${pick.applyUrl ?? pick.jobUrl}\n`);
      }
    } catch (e) {
      console.log(`${board}: probe failed:`, e instanceof Error ? e.message : "unknown");
    }
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
