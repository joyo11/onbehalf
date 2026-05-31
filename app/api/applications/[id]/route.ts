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

/**
 * Patch a subset of fields on an application. Used by the detail
 * page to transition through queued → tailoring → submitting →
 * submitted as the user clicks Tailor / Apply. Accepted fields:
 *   - status (one of the application_status enum values)
 *   - tailoringSummary
 *   - coverLetterText
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { id } = await params;
  type PatchBody = {
    status?:
      | "queued"
      | "tailoring"
      | "submitting"
      | "submitted"
      | "confirmed"
      | "needsHuman"
      | "awaitingCode"
      | "failed"
      | "draft"
      | "pending";
    tailoringSummary?: string;
    coverLetterText?: string;
  };
  const body = (await req.json().catch(() => null)) as PatchBody | null;
  if (!body) return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });

  const updates: Partial<typeof application.$inferInsert> = {};
  if (typeof body.status === "string") updates.status = body.status;
  if (typeof body.tailoringSummary === "string") updates.tailoringSummary = body.tailoringSummary;
  if (typeof body.coverLetterText === "string") updates.coverLetterText = body.coverLetterText;
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No editable fields supplied." }, { status: 400 });
  }
  if (body.status === "submitted") {
    updates.submittedAt = new Date();
  }

  const updated = await db
    .update(application)
    .set(updates)
    .where(and(eq(application.id, id), eq(application.userId, user.id)))
    .returning({ id: application.id, status: application.status });

  if (updated.length === 0) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, application: updated[0] });
}

/**
 * Delete an application. Hard delete — the schema cascades to
 * applicationEvent (lib/db/schema.ts line 271). Ownership-checked so
 * a user can't remove someone else's row.
 *
 * Job rows stay in the scraped jobs table — that's shared scrape data
 * and removing a user's application shouldn't affect other users'
 * matches.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { id } = await params;

  // Ownership check — only delete if the application belongs to this user
  const deleted = await db
    .delete(application)
    .where(and(eq(application.id, id), eq(application.userId, user.id)))
    .returning({ id: application.id });

  if (deleted.length === 0) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, deletedId: deleted[0].id });
}
