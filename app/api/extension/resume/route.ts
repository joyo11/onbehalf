import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { profile } from "@/lib/db/schema";

export const runtime = "nodejs";

/**
 * Phase 8 — returns the signed-in user's resume PDF as base64 so the
 * Chrome extension can drop it into a file input via DataTransfer.
 *
 * The extension calls this when the auto-fill walker finds a file
 * input labeled "Resume" / "CV" — that's the one field Claude can't
 * answer (it's not text), but we have the bytes so we just upload.
 */

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const [p] = await db
    .select({
      pdf: profile.resumePdf,
      filename: profile.resumeFileName,
    })
    .from(profile)
    .where(eq(profile.userId, user.id))
    .limit(1);

  if (!p?.pdf) {
    return NextResponse.json(
      { error: "No resume on file. Upload one in onboarding." },
      { status: 404 },
    );
  }

  const buf = Buffer.from(p.pdf);
  return NextResponse.json({
    filename: p.filename ?? "resume.pdf",
    mime: "application/pdf",
    base64: buf.toString("base64"),
    size: buf.length,
  });
}
