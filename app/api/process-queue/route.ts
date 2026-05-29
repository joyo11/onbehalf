import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { application } from "@/lib/db/schema";
import { runSubmission } from "@/lib/submit/orchestrate";

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

type Body = { userId?: string };

export async function POST(req: Request) {
  if (!authorized(req)) {
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
    return NextResponse.json({ done: true, message: "No queued applications." });
  }

  const result = await runSubmission(next.id);

  // If more queued, re-trigger self.
  const remaining = await db
    .select({ id: application.id })
    .from(application)
    .where(where)
    .limit(1);

  if (remaining.length > 0) {
    const origin = new URL(req.url).origin;
    void fetch(`${origin}/api/process-queue`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: req.headers.get("authorization") ?? "",
      },
      body: JSON.stringify(body),
    }).catch(() => {});
  }

  return NextResponse.json({
    processed: next.id,
    result,
    moreInQueue: remaining.length > 0,
  });
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
