import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
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

  // Insert (or no-op if user already submitted this job)
  const [row] = await db
    .insert(application)
    .values({
      userId: user.id,
      jobId: body.jobId,
      status: "submitted",
      matchScore: body.matchScore ?? 0,
      coverLetterText: body.coverLetterText,
      customAnswersJson: { screeners: body.screeners },
      tailoringSummary: body.tailoringSummary,
      submittedAt: new Date(),
      attempts: 1,
    })
    .onConflictDoUpdate({
      target: [application.userId, application.jobId],
      set: {
        status: "submitted",
        matchScore: body.matchScore ?? 0,
        coverLetterText: body.coverLetterText,
        customAnswersJson: { screeners: body.screeners },
        tailoringSummary: body.tailoringSummary,
        submittedAt: new Date(),
        attempts: 1,
      },
    })
    .returning({ id: application.id });

  await db.insert(applicationEvent).values({
    applicationId: row.id,
    step: "approved_and_submitted",
    payloadJson: {
      company: jobRow.company,
      title: jobRow.title,
      tailoringSummary: body.tailoringSummary,
    },
  });

  return NextResponse.json({ ok: true, applicationId: row.id }, { status: 200 });
}
