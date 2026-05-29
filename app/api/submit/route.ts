import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { runSubmission } from "@/lib/submit/orchestrate";

export const runtime = "nodejs";
// Submissions can take 30-60s. Vercel Hobby caps at 60s; Pro at 300s.
export const maxDuration = 60;

export async function POST(req: Request) {
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

  const result = await runSubmission(body.applicationId);
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
