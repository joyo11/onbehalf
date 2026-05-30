import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { application, job, profile } from "@/lib/db/schema";
import { inferAnswers, type SmartFillContext, type UnknownField } from "@/lib/submit/smart-fill";

export const runtime = "nodejs";
export const maxDuration = 30;

type IncomingField = {
  selector: string;
  label: string;
  helperText?: string;
  kind: "text" | "textarea";
  maxLength?: number;
};

/**
 * Extension calls this with a batch of unknown required fields it
 * scanned on the apply page. We reuse the existing inferAnswers
 * batched Claude call, returning {selector: answer} so the extension
 * can fill by the uuid it stamped on each input.
 *
 * Selectors are opaque to the server — they're UUIDs the extension
 * generated and stamped via data-onbehalf-field-id. Server just
 * passes them through.
 */
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const body = (await req.json().catch(() => null)) as {
      applicationId?: string;
      fields?: IncomingField[];
    } | null;
    if (!body?.applicationId || !Array.isArray(body.fields)) {
      return NextResponse.json({ error: "applicationId + fields[] required." }, { status: 400 });
    }
    if (body.fields.length === 0) {
      return NextResponse.json({ answers: {} });
    }

    // Load the application + job + profile for context. Ownership check
    // protects against someone messaging with a stranger's applicationId.
    const [row] = await db
      .select({
        appUserId: application.userId,
        appCoverLetter: application.coverLetterText,
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

    // Build the SmartFillContext the existing inferAnswers expects.
    const p = row.profileRow;
    const { first, last } = splitName(p.fullName ?? "");
    const ctx: SmartFillContext = {
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
        resumePdfBytes: null, // smart-fill doesn't need bytes
        resumeFileName: p.resumeFileName ?? "resume.pdf",
        coverLetter: row.appCoverLetter ?? "",
        screeners: [],
      },
      job: {
        company: row.jobCompany,
        title: row.jobTitle,
        jdSummary: (row.jobJdText ?? "").slice(0, 1500),
      },
    };

    const fields: UnknownField[] = body.fields.slice(0, 8).map((f) => ({
      selector: f.selector,
      label: f.label,
      helperText: f.helperText,
      kind: f.kind,
      maxLength: f.maxLength,
    }));

    const answersMap = await inferAnswers(fields, ctx);
    const answers: Record<string, string> = {};
    for (const [sel, val] of answersMap.entries()) {
      answers[sel] = val;
    }
    return NextResponse.json({ answers });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[extension/smart-fill] FATAL", message);
    return NextResponse.json({ error: "smart-fill threw", message }, { status: 500 });
  }
}

function splitName(full: string): { first: string; last: string } {
  if (!full) return { first: "", last: "" };
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}
