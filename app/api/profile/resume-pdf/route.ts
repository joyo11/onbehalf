import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { profile } from "@/lib/db/schema";

export const runtime = "nodejs";

/**
 * Serve the current user's master resume PDF. Used by the tracker drawer's
 * "Download" button and the resume drawer's "Open" action.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const [p] = await db
    .select({
      resumePdf: profile.resumePdf,
      resumeFileName: profile.resumeFileName,
    })
    .from(profile)
    .where(eq(profile.userId, user.id))
    .limit(1);

  if (!p?.resumePdf) {
    return NextResponse.json({ error: "No resume on file." }, { status: 404 });
  }

  const bytes = Buffer.isBuffer(p.resumePdf) ? p.resumePdf : Buffer.from(p.resumePdf);
  const filename = p.resumeFileName ?? "resume.pdf";

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename.replace(/"/g, "")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
