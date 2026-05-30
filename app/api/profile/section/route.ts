import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { profile } from "@/lib/db/schema";

export const runtime = "nodejs";

/**
 * Allowlist of profile keys editable via /settings. Anything not in this set
 * is silently rejected (returns updated: 0) — protects against drive-by edits
 * of e.g. resumeEmbedding via a hand-crafted request.
 */
const ALLOWED = new Set<string>([
  // Identity
  "fullName",
  "preferredName",
  "phone",
  "location",
  "linkedinUrl",
  "githubUrl",
  "portfolioUrl",
  // Career prefs
  "targetRoleTitles",
  "preferredLocations",
  "excludedCompanies",
  "desiredSalaryMin",
  "totalYearsExperience",
  "seniorityLevel",
  "openToRemote",
  "openToHybrid",
  "openToOnsite",
  "willingToRelocate",
  // Work eligibility
  "workAuthorization",
  "needsSponsorship",
  "employmentRestrictions",
  "previouslyWorkedHere",
  "countryOfResidence",
  "countryOfWork",
  "accommodationsNeeded",
  "earliestStartDate",
  "noticePeriodWeeks",
  // Voice
  "voiceSample",
  // EEO
  "eeoGender",
  "eeoHispanicLatino",
  "eeoRaceEthnicity",
  "eeoVeteranStatus",
  "eeoDisabilityStatus",
  "eeoSexualOrientation",
  // Current employer + present-tense work authorization
  "currentCompany",
  "currentJobTitle",
  "currentlyAuthorizedUS",
]);

/**
 * Generic profile section save. Body is an object whose keys are filtered
 * against ALLOWED. Used by the editable /settings sections — each section
 * POSTs its slice (e.g. { fullName, phone, location }) independently so a
 * network blip while editing Roles doesn't lose Identity edits.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (ALLOWED.has(k)) patch[k] = v;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: true, updated: 0 });
  }

  await db.update(profile).set(patch).where(eq(profile.userId, user.id));

  revalidatePath("/settings");
  revalidatePath("/search");
  revalidatePath("/dashboard");

  console.log("[profile/section] updated", { userId: user.id, keys: Object.keys(patch) });
  return NextResponse.json({ ok: true, updated: Object.keys(patch).length });
}
