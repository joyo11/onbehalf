import { and, desc, eq, ilike } from "drizzle-orm";
import { db } from "../lib/db/client";
import { application, applicationEvent, job } from "../lib/db/schema";

async function main() {
  const recent = await db
    .select({
      id: application.id,
      status: application.status,
      submittedAt: application.submittedAt,
      createdAt: application.createdAt,
      attempts: application.attempts,
      failureReason: application.failureReason,
      company: job.company,
      title: job.title,
    })
    .from(application)
    .innerJoin(job, eq(application.jobId, job.id))
    .where(and(ilike(job.company, "%anthropic%"), ilike(job.title, "%Staff+ Software Engineer, Full-stack%")))
    .orderBy(desc(application.createdAt))
    .limit(3);

  if (recent.length === 0) {
    console.log("No matching Anthropic Staff+ Full-stack application found.");
    process.exit(0);
  }

  for (const r of recent) {
    console.log(`\nApplication ${r.id}`);
    console.log(`  ${r.company} — ${r.title}`);
    console.log(`  status=${r.status}  attempts=${r.attempts}  failureReason=${r.failureReason ?? "—"}`);
    console.log(`  created ${r.createdAt.toISOString()}`);
    console.log(`  submitted ${r.submittedAt?.toISOString() ?? "—"}`);

    const events = await db
      .select({ step: applicationEvent.step, payload: applicationEvent.payloadJson, at: applicationEvent.createdAt })
      .from(applicationEvent)
      .where(eq(applicationEvent.applicationId, r.id))
      .orderBy(applicationEvent.createdAt);

    console.log(`  Events (${events.length}):`);
    for (const e of events) {
      console.log(`    ${e.at.toISOString()}  ${e.step}  ${JSON.stringify(e.payload).slice(0, 160)}`);
    }
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
