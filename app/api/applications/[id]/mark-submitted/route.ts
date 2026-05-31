import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { application } from "@/lib/db/schema";

export const runtime = "nodejs";

/**
 * Mark an application as submitted. Called by the overlay AFTER the
 * user clicks "Approve and submit" — we click the page's Submit
 * button and immediately update the row so the tracker reflects it.
 *
 * Status: queued/needsHuman/... → submitted
 * Sets submittedAt = now()
 *
 * We deliberately don't wait for an actual "thank you" page or
 * confirmation email — that's the daily Gmail scan's job (post-submit
 * confirmation will flip submitted → confirmed when the email arrives).
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const [row] = await db
    .select({ userId: application.userId, status: application.status })
    .from(application)
    .where(eq(application.id, id))
    .limit(1);
  if (!row) return NextResponse.json({ error: "Application not found." }, { status: 404 });
  if (row.userId !== user.id) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  await db
    .update(application)
    .set({
      status: "submitted",
      submittedAt: new Date(),
    })
    .where(eq(application.id, id));

  return NextResponse.json({ ok: true, applicationId: id, status: "submitted" });
}
