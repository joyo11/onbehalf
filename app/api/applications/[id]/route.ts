import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { application, applicationEvent, job } from "@/lib/db/schema";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { id } = await params;

  const [row] = await db
    .select({ app: application, jobRow: job })
    .from(application)
    .innerJoin(job, eq(application.jobId, job.id))
    .where(and(eq(application.id, id), eq(application.userId, user.id)))
    .limit(1);
  if (!row) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const events = await db
    .select()
    .from(applicationEvent)
    .where(eq(applicationEvent.applicationId, id))
    .orderBy(asc(applicationEvent.createdAt));

  return NextResponse.json({
    application: {
      id: row.app.id,
      status: row.app.status,
      matchScore: row.app.matchScore,
      tailoringSummary: row.app.tailoringSummary,
      coverLetterText: row.app.coverLetterText,
      submittedAt: row.app.submittedAt,
      failureReason: row.app.failureReason,
      customAnswersJson: row.app.customAnswersJson,
    },
    job: {
      id: row.jobRow.id,
      company: row.jobRow.company,
      title: row.jobRow.title,
      location: row.jobRow.location,
      applyUrl: row.jobRow.applyUrl,
    },
    events: events.map((e) => ({
      id: e.id,
      step: e.step,
      payload: e.payloadJson,
      createdAt: e.createdAt,
    })),
  });
}
