import { and, eq, ilike, inArray, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { renderCoverLetterPdf } from "@/lib/submit/cover-letter-pdf";
import { db } from "@/lib/db/client";
import { application, job, profile } from "@/lib/db/schema";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * The extension's tab is on a Greenhouse apply page. Find the
 * matching queued application for this user (if any) and return
 * everything the extension needs to fill the form:
 *
 *   - Identity fields (name, email, phone)
 *   - Resume PDF bytes (base64)
 *   - Cover letter PDF bytes (rendered on demand from coverLetterText)
 *
 * If there's no queued application for this URL, the extension shows
 * "no queued job here — go to the dashboard." If there's no match
 * for the URL but there IS something queued generally, we still
 * return it — the user might have hit "Apply" on a different job
 * than they queued, and we want the form filled either way.
 */
export async function GET(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const url = new URL(req.url).searchParams.get("url") ?? "";
    if (!url) {
      return NextResponse.json({ error: "?url required." }, { status: 400 });
    }

    // Find a queued or needsHuman application whose job apply URL is
    // close to the current tab's URL. We match on the path segment
    // since Greenhouse URLs come in a few wrapper shapes.
    const jobSlug = extractJobIdHint(url);

    const conds = [eq(application.userId, user.id)];
    // Accept anything except terminal states. The extension is happy
    // to retry failed / awaitingCode / needsHuman / queued rows — the
    // user's already on the apply page, and the worst case is filling
    // a form they choose not to submit.
    // Accept anything except the two terminal happy-path states.
    // The extension is the right tool for retrying failed / blocked /
    // awaiting rows — the user's already on the apply page.
    const statusCond = or(
      eq(application.status, "queued"),
      eq(application.status, "needsHuman"),
      eq(application.status, "failed"),
      eq(application.status, "awaitingCode"),
      eq(application.status, "submitting"),
      eq(application.status, "tailoring"),
      eq(application.status, "draft"),
      eq(application.status, "pending"),
    );
    if (statusCond) conds.push(statusCond);
    const urlCond = jobSlug
      ? or(
          eq(job.applyUrl, url),
          ilike(job.applyUrl, `%${jobSlug}%`),
        )
      : eq(job.applyUrl, url);
    if (urlCond) conds.push(urlCond);

    const [row] = await db
      .select({
        appId: application.id,
        appStatus: application.status,
        appTailoring: application.tailoringSummary,
        appCoverLetter: application.coverLetterText,
        appCustomAnswers: application.customAnswersJson,
        jobCompany: job.company,
        jobTitle: job.title,
        jobApplyUrl: job.applyUrl,
        profileFullName: profile.fullName,
        profilePhone: profile.phone,
        profileLinkedinUrl: profile.linkedinUrl,
        profileGithubUrl: profile.githubUrl,
        profilePortfolioUrl: profile.portfolioUrl,
        profileResumePdf: profile.resumePdf,
        profileResumeFileName: profile.resumeFileName,
      })
      .from(application)
      .innerJoin(job, eq(application.jobId, job.id))
      .innerJoin(profile, eq(profile.userId, application.userId))
      .where(and(...conds))
      .limit(1);

    if (!row) {
      return NextResponse.json({
        match: false,
        message: "No queued application for this URL.",
      });
    }

    const { first, last } = splitName(row.profileFullName ?? "");

    // Resume bytes — base64 so JSON-safe.
    let resumeBase64: string | null = null;
    if (row.profileResumePdf) {
      const buf = Buffer.isBuffer(row.profileResumePdf)
        ? row.profileResumePdf
        : Buffer.from(row.profileResumePdf);
      resumeBase64 = buf.toString("base64");
    }

    // Cover letter — render on demand if we have the text. Fail open
    // (skip the cover letter) on render error; the extension will
    // just not upload it.
    let coverLetterBase64: string | null = null;
    let coverLetterFileName: string | null = null;
    if (row.appCoverLetter) {
      try {
        const pdf = await renderCoverLetterPdf(row.appCoverLetter);
        coverLetterBase64 = Buffer.from(pdf).toString("base64");
        coverLetterFileName = `CoverLetter_${(row.profileFullName ?? "applicant").replace(/\s+/g, "_")}.pdf`;
      } catch {
        // skip — extension still fills identity + resume
      }
    }

    return NextResponse.json({
      match: true,
      application: {
        id: row.appId,
        status: row.appStatus,
        company: row.jobCompany,
        title: row.jobTitle,
        applyUrl: row.jobApplyUrl,
      },
      profile: {
        firstName: first,
        lastName: last,
        email: user.email,
        phone: row.profilePhone,
        linkedinUrl: row.profileLinkedinUrl ?? null,
        githubUrl: row.profileGithubUrl ?? null,
        portfolioUrl: row.profilePortfolioUrl ?? null,
      },
      resume: resumeBase64
        ? {
            bytes: resumeBase64,
            filename:
              row.profileResumeFileName ??
              `${(row.profileFullName ?? "Resume").replace(/\s+/g, "_")}.pdf`,
          }
        : null,
      coverLetter:
        coverLetterBase64 && coverLetterFileName
          ? {
              bytes: coverLetterBase64,
              filename: coverLetterFileName,
              text: row.appCoverLetter ?? null,
            }
          : row.appCoverLetter
            ? { bytes: null, filename: null, text: row.appCoverLetter }
            : null,
      // Surfaced for the extension's review UI — the resolved fields
      // the server already decided on (from a prior server-side run).
      resolvedFields:
        (row.appCustomAnswers as { resolvedFields?: unknown[] } | null)?.resolvedFields ?? [],
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[extension/next-job] FATAL", message);
    return NextResponse.json({ error: "next-job threw", message }, { status: 500 });
  }
}

function splitName(full: string): { first: string; last: string } {
  if (!full) return { first: "", last: "" };
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

/**
 * Pull a job identifier hint out of a Greenhouse-shaped URL.
 * Examples:
 *   https://job-boards.greenhouse.io/figma/jobs/5691911004 → "5691911004"
 *   https://stripe.com/jobs/search?gh_jid=7926587            → "7926587"
 *   https://jobs.lever.co/mistral/0004f.../apply             → "0004f..."
 *
 * Used only as a fuzzy match — we still fall back to exact URL match.
 */
function extractJobIdHint(url: string): string | null {
  const m1 = url.match(/\/jobs\/(\d{4,})/i);
  if (m1) return m1[1];
  const m2 = url.match(/[?&]gh_jid=(\d+)/i);
  if (m2) return m2[1];
  const m3 = url.match(/\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
  if (m3) return m3[1];
  return null;
}
