import { eq } from "drizzle-orm";
import { db } from "../lib/db/client";
import { application } from "../lib/db/schema";

async function main() {
  const id = "82733bf0-06d7-4d8a-8149-b13c3ae34382";
  await db
    .update(application)
    .set({ status: "needsHuman", failureReason: null })
    .where(eq(application.id, id));
  console.log(`reset ${id} → needsHuman`);
  process.exit(0);
}
main();
