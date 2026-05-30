import { sql } from "drizzle-orm";
import { db } from "../lib/db/client";

async function main() {
  await db.execute(
    sql.raw(
      `ALTER TABLE "profile" ADD COLUMN IF NOT EXISTS "batch_size" integer`,
    ),
  );
  console.log("profile.batch_size column added (or already existed)");
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
