import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { profile } from "@/lib/db/schema";

export const runtime = "nodejs";

type Body = {
  targetRoleTitles?: string[];
  preferredLocations?: string[];
  excludedCompanies?: string[];
  desiredSalaryMin?: number | null;
};

/**
 * Lightweight endpoint for /search to persist whatever the user just tweaked
 * (roles, locations, exclude list, salary floor) back to their profile so the
 * next visit to /search reflects their last choices instead of resetting to
 * onboarding defaults.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (Array.isArray(body.targetRoleTitles)) patch.targetRoleTitles = body.targetRoleTitles;
  if (Array.isArray(body.preferredLocations)) patch.preferredLocations = body.preferredLocations;
  if (Array.isArray(body.excludedCompanies)) patch.excludedCompanies = body.excludedCompanies;
  if (body.desiredSalaryMin !== undefined) patch.desiredSalaryMin = body.desiredSalaryMin;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: true, updated: 0 });
  }

  await db.update(profile).set(patch).where(eq(profile.userId, user.id));
  return NextResponse.json({ ok: true, updated: Object.keys(patch).length });
}
