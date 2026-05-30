import { eq, and } from "drizzle-orm";
import { db } from "../lib/db/client";
import { application, applicationEvent, job, user } from "../lib/db/schema";

const LINEAR_JOB = {
  source: "ashby" as const,
  sourceJobId: "d37b3d76-3080-47f9-8a19-60505573112c",
  company: "Linear",
  title: "Solutions Engineer, Europe",
  location: "London",
  applyUrl: "https://jobs.ashbyhq.com/linear/d37b3d76-3080-47f9-8a19-60505573112c/application",
  jdText:
    "At Linear, we're building the product development system for teams and agents. AI is fundamentally changing how software gets built, and we're shaping the tools this new era requires. Founded in 2019, Linear has become the platform of choice for more than 25,000 companies (including OpenAI, Coinbase, and Ramp) to plan, build, and ship their products. Today, our team is distributed across North America and Europe. What unites us is relentless focus, fast execution, and a deep care for software craftsmanship.\n\nSolutions Engineer, Europe\nLondon",
};

async function main() {
  const [u] = await db.select().from(user).where(eq(user.email, "shafay11august@gmail.com")).limit(1);
  if (!u) { console.error("user not found"); process.exit(1); }

  const [existing] = await db
    .select()
    .from(job)
    .where(and(eq(job.source, "ashby"), eq(job.sourceJobId, LINEAR_JOB.sourceJobId)))
    .limit(1);
  let jobId: string;
  if (existing) {
    jobId = existing.id;
    console.log("job already exists:", jobId);
  } else {
    const [inserted] = await db
      .insert(job)
      .values({ ...LINEAR_JOB, isActive: true })
      .returning({ id: job.id });
    jobId = inserted.id;
    console.log("inserted job:", jobId);
  }

  const [app] = await db
    .insert(application)
    .values({ userId: u.id, jobId, status: "queued", matchScore: 70, attempts: 0 })
    .onConflictDoUpdate({ target: [application.userId, application.jobId], set: { status: "queued", attempts: 0 } })
    .returning({ id: application.id });
  console.log("application:", app.id);

  await db.insert(applicationEvent).values({
    applicationId: app.id,
    step: "queued_manual",
    payloadJson: { note: "Ashby test queue (Linear Solutions Engineer)" },
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
  console.log("body (first 800):", text.slice(0, 800));
  console.log("\napplicationId:", app.id);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
