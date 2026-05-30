import { sql } from "drizzle-orm";
import { db } from "../lib/db/client";

async function main() {
  // Add 'awaitingCode' to application_status enum if not present.
  await db.execute(sql.raw(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'awaitingCode'
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'application_status')
      ) THEN
        ALTER TYPE application_status ADD VALUE 'awaitingCode';
      END IF;
    END
    $$;
  `));
  console.log("Enum updated.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
