import { after, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { application } from "@/lib/db/schema";
import { findMatchingJobs } from "@/lib/jobs/queries";

export const runtime = "nodejs";

type Body = { batchSize?: number };

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const batchSize = Math.max(1, Math.min(50, body.batchSize ?? 10));

  // Use the same semantic-similarity ranking the /matches page uses.
  // findMatchingJobs() automatically picks the current user's resume embedding
  // when present.
  const matches = await findMatchingJobs({ limit: batchSize });

  if (matches.length === 0) {
    return NextResponse.json(
      { error: "No matching jobs available. Try again after the next scrape." },
      { status: 400 },
    );
  }

  const toCreate = matches.slice(0, batchSize);

  // Bulk insert as queued. onConflictDoNothing so re-running doesn't dupe.
  const inserted = await db
    .insert(application)
    .values(
      toCreate.map((m) => ({
        userId: user.id,
        jobId: m.id,
        status: "queued" as const,
        matchScore: m.score,
        tailoringSummary: "",
        attempts: 0,
      })),
    )
    .onConflictDoNothing({ target: [application.userId, application.jobId] })
    .returning({ id: application.id });

  // Kick off the queue processor in the background. after() guarantees the
  // fetch runs even after we've returned the response to the client.
  const origin = new URL(req.url).origin;
  const auth = `Bearer ${process.env.CRON_SECRET ?? process.env.SCRAPE_TOKEN ?? ""}`;
  after(async () => {
    try {
      await fetch(`${origin}/api/process-queue`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: auth },
        body: JSON.stringify({ userId: user.id }),
      });
    } catch (e) {
      console.error("process-queue kickoff failed:", e);
    }
  });

  return NextResponse.json({
    queued: inserted.length,
    requested: batchSize,
    applicationIds: inserted.map((r) => r.id),
  });
}
