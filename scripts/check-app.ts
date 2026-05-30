import { eq } from "drizzle-orm";
import { db } from "../lib/db/client";
import { application, applicationEvent } from "../lib/db/schema";

async function main() {
  const id = process.argv[2] ?? "5537b392-cc11-4fbd-a39c-5617e14be3a8";
  const [a] = await db.select().from(application).where(eq(application.id, id)).limit(1);
  if (!a) { console.log("not found"); process.exit(1); }
  console.log("status:", a.status, "attempts:", a.attempts, "hasTailor:", !!a.coverLetterText, "screeners:", ((a.customAnswersJson as { screeners?: unknown[] } | null)?.screeners?.length ?? 0));
  console.log("tailorSummary:", a.tailoringSummary?.slice(0, 120));
  const evs = await db
    .select()
    .from(applicationEvent)
    .where(eq(applicationEvent.applicationId, id))
    .orderBy(applicationEvent.createdAt);
  console.log("\nevents (last 25):");
  evs.slice(-25).forEach((e) => {
    const p = e.payloadJson as Record<string, unknown> | null;
    const detail = p && (p.detail ?? p.message ?? p.note ?? p.error ?? p.bodyPreview);
    console.log(" ", e.createdAt.toISOString().slice(11, 19), e.step, detail ? `— ${String(detail).slice(0, 120)}` : "");
  });
  process.exit(0);
}
main();
