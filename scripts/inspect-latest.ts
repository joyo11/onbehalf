import { desc, eq } from "drizzle-orm";
import { db } from "../lib/db/client";
import { application, applicationEvent, job } from "../lib/db/schema";

async function main() {
  const recent = await db
    .select({
      id: application.id,
      status: application.status,
      createdAt: application.createdAt,
      submittedAt: application.submittedAt,
      attempts: application.attempts,
      failureReason: application.failureReason,
      company: job.company,
      title: job.title,
    })
    .from(application)
    .innerJoin(job, eq(application.jobId, job.id))
    .orderBy(desc(application.createdAt))
    .limit(2);

  for (const r of recent) {
    console.log(`\n${r.company} — ${r.title}`);
    console.log(`  id=${r.id}`);
    console.log(`  status=${r.status}  attempts=${r.attempts}`);
    console.log(`  created=${r.createdAt.toISOString()}`);
    console.log(`  submittedAt=${r.submittedAt?.toISOString() ?? "—"}`);
    console.log(`  failureReason=${r.failureReason ?? "—"}`);
    const events = await db
      .select({ step: applicationEvent.step, payload: applicationEvent.payloadJson, at: applicationEvent.createdAt })
      .from(applicationEvent)
      .where(eq(applicationEvent.applicationId, r.id))
      .orderBy(applicationEvent.createdAt);
    console.log(`  Events:`);
    for (const e of events) {
      console.log(`    ${e.at.toISOString()}  ${e.step}`);
      const json = JSON.stringify(e.payload);
      if (json !== "{}") console.log(`      ${json.slice(0, 500)}`);
    }
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
