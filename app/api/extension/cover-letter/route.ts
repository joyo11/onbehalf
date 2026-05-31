import { and, desc, eq, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { application } from "@/lib/db/schema";

export const runtime = "nodejs";

/**
 * Phase 8 — returns the cover letter text for the user's most-recently-
 * created active application. The extension calls this when pasting a
 * cover letter via a form's "Enter manually" textarea.
 *
 * Picks the latest application whose status is queued, tailoring,
 * submitting, or needsHuman.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const [row] = await db
    .select({ text: application.coverLetterText })
    .from(application)
    .where(
      and(
        eq(application.userId, user.id),
        or(
          eq(application.status, "queued"),
          eq(application.status, "tailoring"),
          eq(application.status, "submitting"),
          eq(application.status, "needsHuman"),
        ),
      ),
    )
    .orderBy(desc(application.createdAt))
    .limit(1);

  if (!row?.text) {
    return NextResponse.json(
      { error: "No cover letter on file for any active application." },
      { status: 404 },
    );
  }
  return NextResponse.json({ text: row.text });
}
