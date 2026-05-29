import { sql } from "drizzle-orm";
import { db } from "../lib/db/client";
import { job } from "../lib/db/schema";

async function main() {
  const [count] = await db.select({ n: sql<number>`count(*)::int` }).from(job);
  const recent = await db
    .select({
      company: job.company,
      title: job.title,
      source: job.source,
      scrapedAt: job.scrapedAt,
      applyUrl: job.applyUrl,
    })
    .from(job)
    .orderBy(sql`${job.scrapedAt} desc`)
    .limit(5);

  console.log(`Total jobs in DB: ${count.n}`);
  console.log(`\nMost recently scraped (5):`);
  for (const r of recent) {
    console.log(`  [${r.source}] ${r.company} — ${r.title}`);
    console.log(`    scraped ${r.scrapedAt?.toISOString()}`);
    console.log(`    ${r.applyUrl}`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
