/**
 * One-off admin script — delete all applications still in 'queued' status.
 * Used to clear the queue before flipping REAL_SUBMIT_ENABLED=true so we don't
 * accidentally submit leftover test applications.
 *
 * Run: npx tsx scripts/clear-queue.ts
 */
import { config } from "dotenv";
import { eq } from "drizzle-orm";
config({ path: ".env.local" });

import { db } from "../lib/db/client";
import { application } from "../lib/db/schema";

async function main() {
  // First, show what's about to be deleted
  const queued = await db
    .select({ id: application.id, userId: application.userId, jobId: application.jobId })
    .from(application)
    .where(eq(application.status, "queued"));

  console.log(`Found ${queued.length} application(s) in 'queued' status`);

  if (queued.length === 0) {
    console.log("Nothing to delete.");
    process.exit(0);
  }

  const deleted = await db
    .delete(application)
    .where(eq(application.status, "queued"))
    .returning({ id: application.id });

  console.log(`Deleted ${deleted.length} application(s).`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
