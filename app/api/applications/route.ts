import { eq } from "drizzle-orm";
import { after, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { application, applicationEvent, job } from "@/lib/db/schema";

type RequestBody = {
  jobId: string;
  tailoringSummary: string;
  coverLetterText: string;
  screeners: Array<{ question: string; answer: string; confidence: string }>;
  matchScore?: number;
};

/**
 * Create an application from the /review screen's Approve & submit action.
 * Persists the tailored cover letter + screener answers, queues the
 * application, and kicks off the real submission worker. The worker
 * (runSubmission via /api/process-queue) drives Browserbase, fills the form,
 * and flips status to 'submitted' / 'needsHuman' / 'failed' based on what
 * actually happens in the browser.
 *
 * Previously this handler wrote status='submitted' synchronously without
 * doing any actual submission — a stub from before the real pipeline was
 * wired up. That gave users a false signal that applications had been sent.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }
  if (!body.jobId) {
    return NextResponse.json({ error: "jobId is required." }, { status: 400 });
  }

  const [jobRow] = await db.select().from(job).where(eq(job.id, body.jobId)).limit(1);
  if (!jobRow) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }

  // Pre-fill the tailoring fields so runSubmission's needsTailoring check
  // sees they're already done and skips re-running Claude.
  const [row] = await db
    .insert(application)
    .values({
      userId: user.id,
      jobId: body.jobId,
      status: "queued",
      matchScore: body.matchScore ?? 0,
      coverLetterText: body.coverLetterText,
      customAnswersJson: { screeners: body.screeners },
      tailoringSummary: body.tailoringSummary,
      attempts: 0,
    })
    .onConflictDoUpdate({
      target: [application.userId, application.jobId],
      set: {
        status: "queued",
        matchScore: body.matchScore ?? 0,
        coverLetterText: body.coverLetterText,
        customAnswersJson: { screeners: body.screeners },
        tailoringSummary: body.tailoringSummary,
        attempts: 0,
      },
    })
    .returning({ id: application.id });

  await db.insert(applicationEvent).values({
    applicationId: row.id,
    step: "approved",
    payloadJson: {
      company: jobRow.company,
      title: jobRow.title,
      tailoringSummary: body.tailoringSummary,
    },
  });

  // Kick off the real submission worker. after() keeps the fetch alive past
  // the response so it actually reaches /api/process-queue.
  const origin = new URL(req.url).origin;
  const auth = `Bearer ${process.env.CRON_SECRET ?? process.env.SCRAPE_TOKEN ?? ""}`;
  console.log("[applications] queueing", { applicationId: row.id, userId: user.id });
  after(async () => {
    try {
      console.log("[applications] firing process-queue kickoff");
      const res = await fetch(`${origin}/api/process-queue`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: auth },
        body: JSON.stringify({ userId: user.id }),
      });
      console.log("[applications] kickoff response", res.status);
    } catch (e) {
      console.error("[applications] kickoff failed:", e);
    }
  });

  return NextResponse.json({ ok: true, applicationId: row.id }, { status: 200 });
}
