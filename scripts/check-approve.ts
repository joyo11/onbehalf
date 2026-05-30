import { eq, desc } from "drizzle-orm";
import { db } from "../lib/db/client";
import { applicationEvent, application } from "../lib/db/schema";

async function main() {
  const id = process.argv[2] ?? "82733bf0-06d7-4d8a-8149-b13c3ae34382";
  const [a] = await db.select().from(application).where(eq(application.id, id));
  console.log("final status:", a.status, "failureReason:", a.failureReason);
  const evs = await db
    .select()
    .from(applicationEvent)
    .where(eq(applicationEvent.applicationId, id))
    .orderBy(desc(applicationEvent.createdAt))
    .limit(8);
  for (const e of evs.reverse()) {
    console.log(" ", e.createdAt.toISOString().slice(11, 19), e.step);
    if (
      e.step === "submit_gate_decision" ||
      e.step === "submit_failed_validation" ||
      e.step === "submit_succeeded"
    ) {
      const p = e.payloadJson as Record<string, unknown>;
      console.log(
        "    payload:",
        JSON.stringify({
          submit: p.submit,
          reason: p.reason,
          forceSubmit: p.forceSubmit,
          allHighConfidence: p.allHighConfidence,
          navigated: p.navigated,
          looksLikeThankYou: p.looksLikeThankYou,
          looksLikeValidationError: p.looksLikeValidationError,
          urlAfter: p.urlAfter,
        }),
      );
    }
  }
  process.exit(0);
}
main();
