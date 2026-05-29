import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";
// Submissions can take 30-60s. Vercel Hobby caps at 60s; Pro at 300s.
export const maxDuration = 60;

// Same dynamic-import dance as /api/process-queue — runSubmission pulls in
// playwright-core + @browserbasehq/sdk, which fails at module-load when
// bundled into a serverless function. Importing inside the handler keeps the
// route mountable so errors surface as JSON instead of an opaque 500.

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

    const { runSubmission } = await import("@/lib/submit/orchestrate");
    const result = await runSubmission(body.applicationId);
    return NextResponse.json(result, { status: result.ok ? 200 : 502 });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const stack = e instanceof Error ? e.stack : undefined;
    console.error("[submit] FATAL", message, stack);
    return NextResponse.json({ error: "submit threw", message, stack }, { status: 500 });
  }
}
