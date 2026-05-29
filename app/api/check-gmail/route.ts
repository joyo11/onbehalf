import { isNotNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { user as userTable } from "@/lib/db/schema";
import { matchAndConfirm } from "@/lib/gmail-matcher";

export const runtime = "nodejs";
export const maxDuration = 60;

async function authorizedAsCron(req: Request): Promise<boolean> {
  const auth = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (process.env.CRON_SECRET && auth === process.env.CRON_SECRET) return true;
  if (process.env.SCRAPE_TOKEN && auth === process.env.SCRAPE_TOKEN) return true;
  return false;
}

// Vercel Cron hits GET — scans every connected user.
export async function GET(req: Request) {
  if (!(await authorizedAsCron(req))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const users = await db
    .select()
    .from(userTable)
    .where(isNotNull(userTable.gmailRefreshToken));
  const results = [];
  for (const u of users) {
    try {
      const r = await matchAndConfirm(u.id);
      results.push({ userId: u.id, ...r });
    } catch (e) {
      results.push({ userId: u.id, error: e instanceof Error ? e.message : "failed" });
    }
  }
  return NextResponse.json({ scannedUsers: results.length, results });
}

// Authed user can trigger their own scan from the Tracker.
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try {
    const result = await matchAndConfirm(user.id);
    return NextResponse.json(result, { status: 200 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
