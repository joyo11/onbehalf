/**
 * Queue a specific job for real submission. Inserts the application,
 * prints the id, then exits. Caller fires /api/process-queue (no dryRun).
 */
import { eq } from "drizzle-orm";
import { db } from "../lib/db/client";
import { application, user as userTable } from "../lib/db/schema";

const USER_EMAIL = "shafay11august@gmail.com";
const JOB_ID = "251763dc-2be7-47f5-b85d-699f507103ff"; // Vercel — Software Engineer, Next.js

async function main() {
  const [u] = await db
    .select({ id: userTable.id })
    .from(userTable)
    .where(eq(userTable.email, USER_EMAIL))
    .limit(1);
  if (!u) {
    console.error(`No user ${USER_EMAIL}`);
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
        // Force a fresh tailoring + submit pass
        coverLetterText: null,
        tailoringSummary: "",
        customAnswersJson: null,
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
