import { eq } from "drizzle-orm";
import { db } from "../lib/db/client";
import { application, user as userTable } from "../lib/db/schema";

const USER_EMAIL = "shafay11august@gmail.com";
const JOB_ID = "048e6fff-e912-4327-9125-0f12e403cc86"; // GitLab — Senior AI Engineer (Remote US)

async function main() {
  const [u] = await db
    .select({ id: userTable.id })
    .from(userTable)
    .where(eq(userTable.email, USER_EMAIL))
    .limit(1);
  if (!u) {
    console.error(`No user`);
    process.exit(1);
  }

  const [row] = await db
    .insert(application)
    .values({
      userId: u.id,
      jobId: JOB_ID,
      status: "queued",
      matchScore: 0,
      tailoringSummary: "",
      attempts: 0,
    })
    .onConflictDoUpdate({
      target: [application.userId, application.jobId],
      set: {
        status: "queued",
        // Keep cached tailoring on retry
        submittedAt: null,
        failureReason: null,
        attempts: 0,
      },
    })
    .returning({ id: application.id });

  console.log(row.id);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
