import { sql } from "drizzle-orm";
import { db } from "../lib/db/client";

async function main() {
  const stmts = [
    `ALTER TABLE "profile" ADD COLUMN IF NOT EXISTS "current_company" text`,
    `ALTER TABLE "profile" ADD COLUMN IF NOT EXISTS "current_job_title" text`,
    `ALTER TABLE "profile" ADD COLUMN IF NOT EXISTS "currently_authorized_us" boolean NOT NULL DEFAULT true`,
    `ALTER TABLE "profile" ADD COLUMN IF NOT EXISTS "eeo_sexual_orientation" text NOT NULL DEFAULT 'decline'`,
  ];
  for (const s of stmts) {
    console.log(`> ${s.slice(0, 80)}…`);
    await db.execute(sql.raw(s));
  }
  console.log("Done.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
