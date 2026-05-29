import { and, desc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { application, applicationEvent } from "@/lib/db/schema";

export const runtime = "nodejs";

/**
 * Serve the most recent screenshot we captured for this application.
 *
 *   ?phase=pre    → before clicking Submit
 *   ?phase=post   → after the click + post-validation
 *   default       → most recent of either
 *
 * The bytes live as base64 inside applicationEvent.payloadJson — saved by
 * runSubmission. Decoded and streamed back as JPEG here.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { id } = await params;

  // Ownership check — can't peek at someone else's screenshot.
  const [app] = await db
    .select({ userId: application.userId })
    .from(application)
    .where(eq(application.id, id))
    .limit(1);
  if (!app) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (app.userId !== user.id) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const url = new URL(req.url);
  const phase = url.searchParams.get("phase");
  const steps =
    phase === "pre"
      ? ["screenshot_pre_submit"]
      : phase === "post"
        ? ["screenshot_post_submit"]
        : ["screenshot_post_submit", "screenshot_pre_submit"];

  const [event] = await db
    .select({ payload: applicationEvent.payloadJson, step: applicationEvent.step })
    .from(applicationEvent)
    .where(and(eq(applicationEvent.applicationId, id), inArray(applicationEvent.step, steps)))
    .orderBy(desc(applicationEvent.createdAt))
    .limit(1);

  if (!event) {
    return NextResponse.json({ error: "No screenshot captured for this application yet." }, { status: 404 });
  }

  const payload = event.payload as { imageBase64?: string } | null;
  const b64 = payload?.imageBase64;
  if (!b64) {
    return NextResponse.json({ error: "Screenshot event has no image data." }, { status: 404 });
  }

  const bytes = Buffer.from(b64, "base64");
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Disposition": `inline; filename="${id}-${event.step}.jpg"`,
      "Cache-Control": "private, no-store",
    },
  });
}
