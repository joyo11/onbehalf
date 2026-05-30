import { eq } from "drizzle-orm";
import { after, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { application, job, user as userTable } from "@/lib/db/schema";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Phase B of the CAPTCHA flow. Called by Vercel cron once per minute. Picks
 * any application in 'awaitingCode' status, queries the user's Gmail for
 * the verification code, opens a fresh Browserbase session, navigates back
 * to the apply URL, re-fills the form, types the code, and clicks submit.
 *
 * Auth: same Bearer-token check as /api/process-queue (cron-only,
 * internal use).
 */
function authorized(req: Request): boolean {
  const auth = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (process.env.CRON_SECRET && auth === process.env.CRON_SECRET) return true;
  if (process.env.SCRAPE_TOKEN && auth === process.env.SCRAPE_TOKEN) return true;
  return false;
}

export async function POST(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  // Find one awaitingCode application
  const [next] = await db
    .select({
      id: application.id,
      userId: application.userId,
      jobId: application.jobId,
      applyUrl: job.applyUrl,
      company: job.company,
    })
    .from(application)
    .innerJoin(job, eq(application.jobId, job.id))
    .where(eq(application.status, "awaitingCode"))
    .limit(1);

  if (!next) {
    return NextResponse.json({ done: true, message: "No awaitingCode applications." });
  }

  // Need the user's Gmail refresh token
  const [u] = await db
    .select({ refreshToken: userTable.gmailRefreshToken })
    .from(userTable)
    .where(eq(userTable.id, next.userId))
    .limit(1);
  if (!u?.refreshToken) {
    // User hasn't connected Gmail — can't auto-complete. Demote to
    // needsHuman so they can finish manually.
    await db
      .update(application)
      .set({ status: "needsHuman" })
      .where(eq(application.id, next.id));
    return NextResponse.json({ skipped: next.id, reason: "no_gmail_token" });
  }

  // Dynamic imports keep playwright + browserbase out of module-load.
  const { gmailForUser, findVerificationCode } = await import("@/lib/gmail");
  const gmail = gmailForUser(u.refreshToken);
  const code = await findVerificationCode(gmail, { company: next.company, sinceMinutes: 15 });

  if (!code) {
    // Email hasn't arrived yet OR isn't in inbox yet. Leave status as
    // awaitingCode — next cron run will retry.
    return NextResponse.json({ pending: next.id, reason: "code_not_found_yet" });
  }

  // Code found — open a fresh session and complete the application.
  const { completeWithCode } = await import("@/lib/submit/complete");
  const result = await completeWithCode(next.id, code).catch((e) => ({
    ok: false,
    error: e instanceof Error ? e.message : "unknown",
  }));

  // If still more awaitingCode rows, schedule self.
  after(async () => {
    const origin = new URL(req.url).origin;
    const auth = req.headers.get("authorization") ?? "";
    await fetch(`${origin}/api/complete-with-code`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: auth },
    }).catch(() => {});
  });

  return NextResponse.json({ completed: next.id, code: code.slice(0, 2) + "…", result });
}

// Cron-friendly GET
export async function GET(req: Request) {
  return POST(req);
}
