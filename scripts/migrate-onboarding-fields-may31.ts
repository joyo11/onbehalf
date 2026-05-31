/**
 * Manual migration runner for the May-31 onboarding schema additions.
 * We can't use `drizzle-kit push` from a non-TTY shell, so we issue
 * the same ALTERs via the existing postgres client.
 *
 * Adds:
 *   - profile.first_name                  text
 *   - profile.last_name                   text
 *   - profile.years_experience_after_graduation  text
 *
 * Converts:
 *   - profile.willing_to_relocate         boolean -> text
 *     (mapping: true -> 'anywhere', false -> NULL so the user re-picks
 *      a bucket in the new 3-option question)
 *
 * Idempotent — IF NOT EXISTS guards on adds, DO block for the type
 * change so re-runs are no-ops.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { sql } from "drizzle-orm";

async function main() {
  const { db } = await import("../lib/db/client");
  console.log("[migrate] adding first_name + last_name + years_after_grad…");
  await db.execute(
    sql`ALTER TABLE "profile" ADD COLUMN IF NOT EXISTS "first_name" text`,
  );
  await db.execute(
    sql`ALTER TABLE "profile" ADD COLUMN IF NOT EXISTS "last_name" text`,
  );
  await db.execute(
    sql`ALTER TABLE "profile" ADD COLUMN IF NOT EXISTS "years_experience_after_graduation" text`,
  );

  // Convert willing_to_relocate from boolean to text, mapping true ->
  // 'anywhere'. Wrapped in DO so re-runs are no-ops once the type is
  // already text.
  console.log("[migrate] converting willing_to_relocate boolean -> text…");
  await db.execute(sql`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'profile'
          AND column_name = 'willing_to_relocate'
          AND data_type = 'boolean'
      ) THEN
        ALTER TABLE "profile" ALTER COLUMN "willing_to_relocate" DROP DEFAULT;
        ALTER TABLE "profile" ALTER COLUMN "willing_to_relocate" DROP NOT NULL;
        ALTER TABLE "profile"
          ALTER COLUMN "willing_to_relocate" SET DATA TYPE text
          USING CASE WHEN "willing_to_relocate" THEN 'anywhere' ELSE NULL END;
      END IF;
    END
    $$;
  `);

  console.log("[migrate] done.");
  process.exit(0);
}

main().catch((e) => {
  console.error("[migrate] FAILED", e);
  process.exit(1);
});
