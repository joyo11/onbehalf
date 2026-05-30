import { and, desc, eq } from "drizzle-orm";
import { db } from "../lib/db/client";
import { application, applicationEvent } from "../lib/db/schema";

const APP_ID = process.argv[2];
if (!APP_ID) {
  console.error("usage: tsx scripts/inspect-app.ts <appId>");
  process.exit(1);
}

async function main() {
  const [a] = await db
    .select({
      status: application.status,
      submittedAt: application.submittedAt,
      attempts: application.attempts,
      failureReason: application.failureReason,
    })
    .from(application)
    .where(eq(application.id, APP_ID))
    .limit(1);

  console.log(`status=${a?.status}  attempts=${a?.attempts}  submitted=${a?.submittedAt?.toISOString() ?? "—"}`);
  console.log(`failureReason=${a?.failureReason ?? "—"}`);
  console.log("");

  const events = await db
    .select({ step: applicationEvent.step, payload: applicationEvent.payloadJson, createdAt: applicationEvent.createdAt })
    .from(applicationEvent)
    .where(eq(applicationEvent.applicationId, APP_ID))
    .orderBy(desc(applicationEvent.createdAt))
    .limit(25);

  for (const e of events.reverse()) {
    const p = JSON.stringify(e.payload).slice(0, 250);
    console.log(`  ${e.createdAt.toISOString()}  ${e.step}`);
    if (p !== "{}" && p !== "null") console.log(`    ${p.replace(/imageBase64":"[^"]+/, 'imageBase64":"…"').slice(0, 250)}`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
