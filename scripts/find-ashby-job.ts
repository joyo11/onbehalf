import { sql } from "drizzle-orm";
import { db } from "../lib/db/client";

async function main() {
  const rows = await db.execute(sql`
    SELECT source, count(*)::int AS n
    FROM "job"
    WHERE is_active = true
    GROUP BY source
    ORDER BY n DESC
  `);
  console.log("jobs by source:");
  for (const r of rows as unknown as Array<{ source: string; n: number }>) {
    console.log(`  ${r.source}: ${r.n}`);
  }

  const hosts = await db.execute(sql`
    SELECT
      CASE
        WHEN apply_url ILIKE '%ashbyhq.com%' THEN 'ashby'
        WHEN apply_url ILIKE '%lever.co%' THEN 'lever'
        WHEN apply_url ILIKE '%greenhouse.io%' THEN 'greenhouse'
        WHEN apply_url ILIKE '%workday%' THEN 'workday'
        ELSE 'other'
      END AS ats,
      count(*)::int AS n
    FROM "job"
    WHERE is_active = true
    GROUP BY 1
    ORDER BY n DESC
  `);
  console.log("\njobs by ATS host:");
  for (const r of hosts as unknown as Array<{ ats: string; n: number }>) {
    console.log(`  ${r.ats}: ${r.n}`);
  }
  process.exit(0);
}
main();
