import { and, asc, eq } from "drizzle-orm";
import { after, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { application } from "@/lib/db/schema";

// Don't statically import runSubmission — it pulls in playwright-core and
// @browserbasehq/sdk at module load, which throws under Vercel's serverless
// bundling for this route. Lazy-load inside the handler so the route itself
// mounts cleanly and we can return real error messages.

export const runtime = "nodejs";
export const maxDuration = 60;

// Authorize via Cron secret or scrape token — this is an internal endpoint
// triggered by /api/batch-submit and Vercel Cron, not by humans.
function authorized(req: Request): boolean {
  const auth = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (process.env.CRON_SECRET && auth === process.env.CRON_SECRET) return true;
  if (process.env.SCRAPE_TOKEN && auth === process.env.SCRAPE_TOKEN) return true;
  // Allow same-origin requests with no auth in dev / for the convenience of
  // batch-submit's self-trigger. We're not exposing this to the public.
  return false;
}

type Body = { userId?: string; dryRun?: boolean };

export async function POST(req: Request) {
  try {
    const ok = authorized(req);
    console.log("[process-queue] POST in", {
      authorized: ok,
      hasCronSecret: Boolean(process.env.CRON_SECRET),
      hasScrapeToken: Boolean(process.env.SCRAPE_TOKEN),
    });
    if (!ok) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    let body: Body = {};
    try {
      body = (await req.json()) as Body;
    } catch {
      // empty body is fine
    }

    // Find the next queued application. Optionally scope to one user.
    const where = body.userId
      ? and(eq(application.status, "queued"), eq(application.userId, body.userId))
      : eq(application.status, "queued");

    const [next] = await db
      .select({ id: application.id })
      .from(application)
      .where(where)
      .orderBy(asc(application.createdAt))
      .limit(1);

    if (!next) {
      console.log("[process-queue] no queued apps for", body.userId ?? "all");
      return NextResponse.json({ done: true, message: "No queued applications." });
    }

    console.log("[process-queue] running submission", next.id, { dryRun: !!body.dryRun });
    const { runSubmission } = await import("@/lib/submit/orchestrate");
    const result = await runSubmission(next.id, { dryRun: !!body.dryRun });
    console.log("[process-queue] submission result", { id: next.id, ok: result.ok, ats: result.ats });

    // If more queued, re-trigger self.
    const remaining = await db
      .select({ id: application.id })
      .from(application)
      .where(where)
      .limit(1);

    if (remaining.length > 0) {
      const origin = new URL(req.url).origin;
      const auth = req.headers.get("authorization") ?? "";
      after(async () => {
        try {
          await fetch(`${origin}/api/process-queue`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: auth },
            body: JSON.stringify(body),
          });
        } catch (e) {
          console.error("process-queue self-trigger failed:", e);
        }
      });
    }

    return NextResponse.json({
      processed: next.id,
      result,
      moreInQueue: remaining.length > 0,
    });
  } catch (e) {
    // Catch-all so the actual error message reaches the response — Vercel
    // CLI truncates uncaught exceptions to "Failed to..." which makes
    // debugging impossible. Return the full message + stack.
    const message = e instanceof Error ? e.message : String(e);
    const stack = e instanceof Error ? e.stack : undefined;
    console.error("[process-queue] FATAL", message, stack);
    return NextResponse.json(
      { error: "process-queue threw", message, stack },
      { status: 500 },
    );
  }
}

// Cron-friendly GET that doesn't require body.
export async function GET(req: Request) {
  return POST(
    new Request(req.url, {
      method: "POST",
      headers: req.headers,
      body: JSON.stringify({}),
    }),
  );
}
