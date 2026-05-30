import { and, eq } from "drizzle-orm";
import { after, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { application } from "@/lib/db/schema";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Phase 3 (D) — Approve & Submit.
 *
 * Called by the review UI's "Approve & Submit" button. The application
 * is already in `needsHuman` because the orchestrator's confidence
 * gate stopped short of clicking Submit. The human has now reviewed
 * the filled-form screenshot + resolvedFields on customAnswersJson
 * and is taking responsibility for sending.
 *
 * Flow:
 *   1. Verify the user owns the application
 *   2. Verify status is `needsHuman` and the gate stopped (not a
 *      pre-fill bot block — those need a different path)
 *   3. Reset to `queued` so process-queue can pick it up
 *   4. Fire process-queue via after() with forceSubmit=true
 *
 * runSubmission with forceSubmit=true will re-open a fresh Browserbase
 * session, re-fill the form (cached tailoring + smart-fill answers
 * survive), and click the cached submit selector regardless of the
 * confidence gate. The cached tailoring + screener answers mean the
 * second run is fast enough to fit in the 60s budget.
 */
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    let body: { applicationId?: string };
    try {
      body = (await req.json()) as { applicationId?: string };
    } catch {
      return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
    }
    if (!body.applicationId) {
      return NextResponse.json({ error: "applicationId required." }, { status: 400 });
    }

    // Verify ownership + current state.
    const [row] = await db
      .select()
      .from(application)
      .where(
        and(eq(application.id, body.applicationId), eq(application.userId, user.id)),
      )
      .limit(1);
    if (!row) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    if (row.status !== "needsHuman") {
      return NextResponse.json(
        {
          error: "Application is not in a state that can be approved.",
          status: row.status,
        },
        { status: 409 },
      );
    }

    // Bot-block pre-fill stops are NOT approvable — the form was never
    // actually filled. Those need a manual completion path.
    const meta = row.customAnswersJson as Record<string, unknown> | null;
    const reason = (meta?.needsHumanReason ?? "") as string;
    if (reason === "bot_blocked_pre_fill") {
      return NextResponse.json(
        {
          error: "Bot-blocked applications can't be auto-submitted. Submit manually.",
          reason,
        },
        { status: 409 },
      );
    }

    // Persist a marker so the next runSubmission call knows to bypass the
    // gate. We also reset status to 'queued' so process-queue picks it up.
    await db
      .update(application)
      .set({
        status: "queued",
        failureReason: null,
        customAnswersJson: {
          ...(meta ?? {}),
          forceSubmit: true,
          approvedAt: new Date().toISOString(),
          approvedBy: user.id,
        },
      })
      .where(eq(application.id, body.applicationId));

    // Kick off the worker.
    const origin = new URL(req.url).origin;
    const auth = `Bearer ${process.env.CRON_SECRET ?? process.env.SCRAPE_TOKEN ?? ""}`;
    after(async () => {
      try {
        await fetch(`${origin}/api/process-queue`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: auth },
          body: JSON.stringify({ userId: user.id, forceSubmit: true }),
        });
      } catch (e) {
        console.error("[approve-submit] kickoff failed:", e);
      }
    });

    return NextResponse.json({
      ok: true,
      applicationId: body.applicationId,
      message: "Approved — submission queued.",
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[approve-submit] FATAL", message);
    return NextResponse.json({ error: "approve-submit threw", message }, { status: 500 });
  }
}
