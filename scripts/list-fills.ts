import { eq } from "drizzle-orm";
import { db } from "../lib/db/client";
import { applicationEvent } from "../lib/db/schema";

async function main() {
  const id = process.argv[2] ?? "82733bf0-06d7-4d8a-8149-b13c3ae34382";
  const evs = await db
    .select()
    .from(applicationEvent)
    .where(eq(applicationEvent.applicationId, id))
    .orderBy(applicationEvent.createdAt);
  const fills = evs.filter((e) =>
    /^filled_|^selected_|^attached_|^abstained_|^skipped_|^errored_|^uploaded_|smart_fallback|na_fallback|no_cover_letter|no_submit/.test(
      e.step,
    ),
  );
  console.log(`${fills.length} fill-related events:`);
  for (const e of fills) {
    const p = e.payloadJson as Record<string, unknown> | null;
    const detail = (p?.detail as string | undefined) ?? "";
    console.log(` ${e.createdAt.toISOString().slice(11, 19)}  ${e.step}  ${detail.slice(0, 100)}`);
  }
  process.exit(0);
}
main();
