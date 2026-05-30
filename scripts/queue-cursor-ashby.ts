import { eq, and } from "drizzle-orm";
import { db } from "../lib/db/client";
import { application, applicationEvent, job, user } from "../lib/db/schema";

const CURSOR_JOB = {
  source: "ashby" as const,
  sourceJobId: "36e69353-0452-4bf6-9f35-b1e7307959a7",
  company: "Cursor",
  title: "Software Engineer, Generalist",
  location: "San Francisco",
  applyUrl: "https://jobs.ashbyhq.com/cursor/36e69353-0452-4bf6-9f35-b1e7307959a7/application",
  jdText:
    "Our mission is to automate coding. The first step in our journey is to build the best tool for professional programmers, using a combination of inventive research, design, and engineering. Our organization is very flat, and our team is small and talent dense. We particularly like people who are truth-seeking, passionate, and creative. We enjoy spirited debate, crazy ideas, and shipping code.\n\nSoftware Engineer, Generalist",
};

async function main() {
  const [u] = await db.select().from(user).where(eq(user.email, "shafay11august@gmail.com")).limit(1);
  if (!u) {
    console.error("user not found");
    process.exit(1);
  }

  // Upsert job
  const [existing] = await db
    .select()
    .from(job)
    .where(and(eq(job.source, "ashby"), eq(job.sourceJobId, CURSOR_JOB.sourceJobId)))
    .limit(1);
  let jobId: string;
  if (existing) {
    jobId = existing.id;
    console.log("job already exists:", jobId);
  } else {
    const [inserted] = await db
      .insert(job)
      .values({
        source: CURSOR_JOB.source,
        sourceJobId: CURSOR_JOB.sourceJobId,
        company: CURSOR_JOB.company,
        title: CURSOR_JOB.title,
        location: CURSOR_JOB.location,
        applyUrl: CURSOR_JOB.applyUrl,
        jdText: CURSOR_JOB.jdText,
        isActive: true,
      })
      .returning({ id: job.id });
    jobId = inserted.id;
    console.log("inserted job:", jobId);
  }

  // Upsert application (queued)
  const [app] = await db
    .insert(application)
    .values({
      userId: u.id,
      jobId,
      status: "queued",
      matchScore: 75,
      attempts: 0,
    })
    .onConflictDoUpdate({
      target: [application.userId, application.jobId],
      set: { status: "queued", attempts: 0 },
    })
    .returning({ id: application.id });
  console.log("application:", app.id);

  await db.insert(applicationEvent).values({
    applicationId: app.id,
    step: "queued_manual",
    payloadJson: { note: "Ashby test queue (Cursor Generalist)" },
  });

  // Fire process-queue
  const baseUrl = process.env.URL ?? "https://onbehalfai.vercel.app";
  const token = process.env.SCRAPE_TOKEN ?? process.env.CRON_SECRET;
  if (!token) {
    console.error("SCRAPE_TOKEN/CRON_SECRET missing");
    process.exit(1);
  }
  console.log(`POST ${baseUrl}/api/process-queue ...`);
  const res = await fetch(`${baseUrl}/api/process-queue`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ userId: u.id }),
  });
  console.log("status:", res.status);
  const text = await res.text();
  console.log("body (first 600 chars):", text.slice(0, 600));
  console.log("\napplicationId:", app.id);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
