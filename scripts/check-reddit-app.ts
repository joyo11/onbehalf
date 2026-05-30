import { eq, and } from "drizzle-orm";
import { db } from "../lib/db/client";
import { applicationEvent } from "../lib/db/schema";

async function main() {
  const id = "e54ee54c-77d4-4df5-92fe-47fadbfa5f62";
  // Pull the post-submit body text from screenshot_post_submit OR
  // submit_failed_validation payloads
  const evs = await db
    .select()
    .from(applicationEvent)
    .where(eq(applicationEvent.applicationId, id))
    .orderBy(applicationEvent.createdAt);
  const recent = evs.slice(-15);
  for (const e of recent) {
    const p = e.payloadJson as Record<string, unknown> | null;
    if (e.step === "submit_failed_validation" || e.step === "screenshot_post_submit") {
      console.log("---", e.step, e.createdAt);
      console.log("preview:", String(p?.bodyPreview ?? "").slice(0, 1200));
      console.log("urlBefore:", p?.urlBefore);
      console.log("urlAfter:", p?.urlAfter);
      console.log("navigated:", p?.navigated, "thankYou:", p?.looksLikeThankYou, "validation:", p?.looksLikeValidationError, "needsEmailCode:", p?.needsEmailCode);
    }
  }
  process.exit(0);
}
main();
