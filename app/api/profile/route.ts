import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { getOrCreateProfile } from "@/lib/db/profile";
import { profile, user as userTable } from "@/lib/db/schema";
import { COUNTRIES, US_STATES, formatLocation } from "@/lib/locations";

type AboutPayload = {
  name: string;
  pronouns: string;
  email: string;
  phone: string;
  linkedin: string;
  site: string;
  github: string;
  country: string;
  state: string;
  city: string;
  timezone: string;
};

type PrefsPayload = {
  workAuth: "us_citizen_pr" | "needs_sponsorship" | "other" | "";
  workPreference: { remote: boolean; hybrid: boolean; onsite: boolean };
  salaryMin: number; // thousands
  earliestStartDate: string; // YYYY-MM-DD
  locations: string[];
};

type RequestBody = {
  about: AboutPayload;
  roles: string[];
  prefs: PrefsPayload;
  voice: string;
  gmailConnected: boolean;
  totalYearsExperience?: string | null;
};

function buildLocation(about: AboutPayload): string | null {
  if (!about.country) return null;
  const c = COUNTRIES.find((x) => x.code === about.country);
  if (!c) return null;
  if (about.country === "US") {
    const s = US_STATES.find((x) => x.code === about.state);
    return formatLocation(c.code, s?.code ?? "", about.city);
  }
  return formatLocation(c.code, "", about.city);
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const { about, roles, prefs, voice, gmailConnected, totalYearsExperience } = body;
  if (!about || !roles || !prefs) {
    return NextResponse.json({ error: "Missing fields." }, { status: 400 });
  }

  const existing = await getOrCreateProfile(user);
  const location = buildLocation(about);

  await db
    .update(profile)
    .set({
      fullName: about.name || existing.fullName,
      phone: about.phone || existing.phone,
      location,
      linkedinUrl: about.linkedin || existing.linkedinUrl,
      githubUrl: about.github || existing.githubUrl,
      portfolioUrl: about.site || existing.portfolioUrl,
      targetRoleTitles: roles,
      workAuthorization: prefs.workAuth || existing.workAuthorization,
      needsSponsorship: prefs.workAuth === "needs_sponsorship" ? true : false,
      openToRemote: prefs.workPreference.remote,
      openToHybrid: prefs.workPreference.hybrid,
      openToOnsite: prefs.workPreference.onsite,
      preferredLocations: prefs.locations,
      desiredSalaryMin: prefs.salaryMin > 0 ? prefs.salaryMin * 1000 : null,
      earliestStartDate: prefs.earliestStartDate || null,
      voiceSample: voice.trim() || existing.voiceSample,
      excludedCompanies: existing.excludedCompanies,
      totalYearsExperience: totalYearsExperience ?? existing.totalYearsExperience,
      updatedAt: new Date(),
    })
    .where(eq(profile.id, existing.id));

  if (gmailConnected) {
    await db
      .update(userTable)
      .set({ gmailConnectedAt: sql`coalesce(${userTable.gmailConnectedAt}, now())` })
      .where(eq(userTable.id, user.id));
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
