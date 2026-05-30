import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { application, job, profile } from "@/lib/db/schema";
import { resolveSelectField } from "@/lib/submit/resolve-field";

export const runtime = "nodejs";
export const maxDuration = 15;

/**
 * Extension found a select / radio / React-Select on the apply page
 * and enumerated its visible options. We ask Claude to pick one
 * (using the same resolver the server-side fill uses) and return
 * either the picked option text or null (abstain).
 */
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const body = (await req.json().catch(() => null)) as {
      applicationId?: string;
      label?: string;
      helperText?: string;
      options?: string[];
    } | null;
    if (!body?.applicationId || !body.label || !Array.isArray(body.options)) {
      return NextResponse.json(
        { error: "applicationId + label + options[] required." },
        { status: 400 },
      );
    }

    const [row] = await db
      .select({
        appUserId: application.userId,
        jobCompany: job.company,
        jobTitle: job.title,
        jobJdText: job.jdText,
        profileRow: profile,
      })
      .from(application)
      .innerJoin(job, eq(application.jobId, job.id))
      .innerJoin(profile, eq(profile.userId, application.userId))
      .where(eq(application.id, body.applicationId))
      .limit(1);
    if (!row) return NextResponse.json({ error: "Application not found." }, { status: 404 });
    if (row.appUserId !== user.id) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const p = row.profileRow;
    const { first, last } = splitName(p.fullName ?? "");
    const resolution = await resolveSelectField({
      label: body.label,
      helperText: body.helperText,
      availableOptions: body.options.filter((o) => typeof o === "string" && o.trim().length > 0),
      profile: {
        fullName: p.fullName ?? "",
        firstName: first,
        lastName: last,
        preferredName: p.preferredName ?? null,
        email: user.email,
        phone: p.phone,
        location: p.location,
        linkedinUrl: p.linkedinUrl,
        githubUrl: p.githubUrl,
        portfolioUrl: p.portfolioUrl,
        workAuthorization: p.workAuthorization,
        needsSponsorship: p.needsSponsorship ?? false,
        countryOfResidence: p.countryOfResidence ?? null,
        countryOfWork: p.countryOfWork ?? null,
        employmentRestrictions: p.employmentRestrictions ?? false,
        previouslyWorkedHere: p.previouslyWorkedHere ?? false,
        accommodationsNeeded: p.accommodationsNeeded ?? null,
        eeoGender: p.eeoGender ?? "decline",
        eeoHispanicLatino: p.eeoHispanicLatino ?? "decline",
        eeoRaceEthnicity: p.eeoRaceEthnicity ?? "decline",
        eeoVeteranStatus: p.eeoVeteranStatus ?? "decline",
        eeoDisabilityStatus: p.eeoDisabilityStatus ?? "decline",
        eeoSexualOrientation: p.eeoSexualOrientation ?? "decline",
        currentCompany: p.currentCompany ?? null,
        currentJobTitle: p.currentJobTitle ?? null,
        currentlyAuthorizedUS: p.currentlyAuthorizedUS ?? true,
        skillYears: (p.skillYears as Record<string, number | null>) ?? {},
        voiceSample: p.voiceSample,
        resumePdfBytes: null,
        resumeFileName: p.resumeFileName ?? "resume.pdf",
        coverLetter: "",
        screeners: [],
      },
      jobCtx: {
        company: row.jobCompany,
        title: row.jobTitle,
        jdSummary: (row.jobJdText ?? "").slice(0, 1500),
      },
    });

    return NextResponse.json({
      value: resolution.value,
      confidence: resolution.confidence,
      source: resolution.source,
      reason: resolution.reason,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[extension/resolve-field] FATAL", message);
    return NextResponse.json({ error: "resolve-field threw", message }, { status: 500 });
  }
}

function splitName(full: string): { first: string; last: string } {
  if (!full) return { first: "", last: "" };
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}
