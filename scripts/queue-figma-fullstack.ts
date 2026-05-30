/**
 * Evidence-run queue: Figma "Software Engineer, Full Stack" Greenhouse
 * job (id 71f39b27-4297-4c94-a6dd-eab3877a59ae, similarity 0.523 to
 * Shafay's resume). Already in the job table, just needs an application
 * row + a process-queue kick.
 */
import { eq, and } from "drizzle-orm";
import { db } from "../lib/db/client";
import { application, applicationEvent, user } from "../lib/db/schema";

const JOB_ID = "71f39b27-4297-4c94-a6dd-eab3877a59ae";

async function main() {
  const [u] = await db
    .select()
    .from(user)
    .where(eq(user.email, "shafay11august@gmail.com"))
    .limit(1);
  if (!u) {
    console.error("user not found");
    process.exit(1);
  }

  // Upsert application row in queued status (also wipe any prior tailoring/
  // resolvedFields so this run produces fresh metadata)
  const [app] = await db
    .insert(application)
    .values({ userId: u.id, jobId: JOB_ID, status: "queued", matchScore: 75, attempts: 0 })
    .onConflictDoUpdate({
      target: [application.userId, application.jobId],
      set: { status: "queued", attempts: 0, coverLetterText: null, tailoringSummary: "", customAnswersJson: null, failureReason: null },
    })
    .returning({ id: application.id });
  console.log("application:", app.id);

  await db.insert(applicationEvent).values({
    applicationId: app.id,
    step: "queued_manual",
    payloadJson: { note: "Phase 3 evidence run — Figma Full Stack" },
  });

  const baseUrl = process.env.URL ?? "https://onbehalfai.vercel.app";
  const token = process.env.SCRAPE_TOKEN ?? process.env.CRON_SECRET;
  console.log(`POST ${baseUrl}/api/process-queue ...`);
  const res = await fetch(`${baseUrl}/api/process-queue`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ userId: u.id }),
  });
  console.log("status:", res.status);
  const text = await res.text();
  console.log("body (first 600):", text.slice(0, 600));
  console.log("\napplicationId:", app.id);
  console.log(`detail: https://onbehalfai.vercel.app/detail?id=${app.id}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
