import { eq, sql } from "drizzle-orm";
import { db } from "../lib/db/client";
import { job } from "../lib/db/schema";

async function main() {
  const [total] = await db.select({ n: sql<number>`count(*)::int` }).from(job);
  const [active] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(job)
    .where(eq(job.isActive, true));
  console.log("jobs total:", total.n);
  console.log("jobs active:", active.n);
  process.exit(0);
}
main();
