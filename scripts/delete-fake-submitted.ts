/**
 * Delete the fake "approved_and_submitted" rows created by the broken
 * /api/applications POST stub. Those rows lie — status=submitted but no
 * Browserbase session ever ran. Identify them by the marker event.
 */
import { eq, inArray } from "drizzle-orm";
import { db } from "../lib/db/client";
import { application, applicationEvent, job } from "../lib/db/schema";

async function main() {
  const markers = await db
    .select({ applicationId: applicationEvent.applicationId })
    .from(applicationEvent)
    .where(eq(applicationEvent.step, "approved_and_submitted"));

  const fakeIds = Array.from(new Set(markers.map((m) => m.applicationId)));
  console.log(`Found ${fakeIds.length} application(s) with fake 'approved_and_submitted' marker.`);

  if (fakeIds.length === 0) {
    process.exit(0);
  }

  const rows = await db
    .select({
      id: application.id,
      status: application.status,
      company: job.company,
      title: job.title,
    })
    .from(application)
    .innerJoin(job, eq(application.jobId, job.id))
    .where(inArray(application.id, fakeIds));

  for (const r of rows) {
    console.log(`  ${r.company} — ${r.title}  (status=${r.status})`);
  }

  // FK on applicationEvent.applicationId → application.id; delete events first.
  await db.delete(applicationEvent).where(inArray(applicationEvent.applicationId, fakeIds));
  const deleted = await db
    .delete(application)
    .where(inArray(application.id, fakeIds))
    .returning({ id: application.id });

  console.log(`Deleted ${deleted.length} fake application row(s).`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
