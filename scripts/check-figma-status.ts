import { eq } from "drizzle-orm";
import { db } from "../lib/db/client";
import { application, job } from "../lib/db/schema";

async function main() {
  const id = "82733bf0-06d7-4d8a-8149-b13c3ae34382";
  const [row] = await db
    .select({
      id: application.id,
      status: application.status,
      failureReason: application.failureReason,
      applyUrl: job.applyUrl,
    })
    .from(application)
    .innerJoin(job, eq(application.jobId, job.id))
    .where(eq(application.id, id))
    .limit(1);
  console.log(row);
  process.exit(0);
}
main();
