/**
 * Add seniorityLevel column to profile. Idempotent.
 */
import { sql } from "drizzle-orm";
import { db } from "../lib/db/client";

async function main() {
  await db.execute(
    sql.raw(`ALTER TABLE "profile" ADD COLUMN IF NOT EXISTS "seniority_level" text`),
  );
  console.log("Done.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
