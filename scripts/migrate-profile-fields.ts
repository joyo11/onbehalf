/**
 * Add the personal-answers columns to the profile table. Idempotent —
 * safe to run on a DB that already has any subset of the columns.
 */
import { sql } from "drizzle-orm";
import { db } from "../lib/db/client";

async function main() {
  const stmts = [
    `ALTER TABLE "profile" ADD COLUMN IF NOT EXISTS "preferred_name" text`,
    `ALTER TABLE "profile" ADD COLUMN IF NOT EXISTS "country_of_residence" text`,
    `ALTER TABLE "profile" ADD COLUMN IF NOT EXISTS "country_of_work" text`,
    `ALTER TABLE "profile" ADD COLUMN IF NOT EXISTS "employment_restrictions" boolean NOT NULL DEFAULT false`,
    `ALTER TABLE "profile" ADD COLUMN IF NOT EXISTS "previously_worked_here" boolean NOT NULL DEFAULT false`,
    `ALTER TABLE "profile" ADD COLUMN IF NOT EXISTS "accommodations_needed" text`,
    `ALTER TABLE "profile" ADD COLUMN IF NOT EXISTS "eeo_gender" text NOT NULL DEFAULT 'decline'`,
    `ALTER TABLE "profile" ADD COLUMN IF NOT EXISTS "eeo_hispanic_latino" text NOT NULL DEFAULT 'decline'`,
    `ALTER TABLE "profile" ADD COLUMN IF NOT EXISTS "eeo_race_ethnicity" text NOT NULL DEFAULT 'decline'`,
    `ALTER TABLE "profile" ADD COLUMN IF NOT EXISTS "eeo_veteran_status" text NOT NULL DEFAULT 'decline'`,
    `ALTER TABLE "profile" ADD COLUMN IF NOT EXISTS "eeo_disability_status" text NOT NULL DEFAULT 'decline'`,
  ];

  for (const s of stmts) {
    process.stdout.write(`> ${s.slice(0, 90)}…\n`);
    await db.execute(sql.raw(s));
  }
  console.log("Done.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
