import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { application, applicationEvent, job, profile } from "../db/schema";
import { startSession } from "./browserbase";
import { fillGreenhouseForm, isGreenhousePage } from "./greenhouse";
import type { SubmissionProfile, SubmissionResult, SubmissionStep } from "./types";

const APPLY_TIMEOUT_MS = 50_000;

type ScreenerAnswer = { question: string; answer: string; confidence: string };

async function logEvent(applicationId: string, step: string, payload: unknown) {
  try {
    await db.insert(applicationEvent).values({
      applicationId,
      step,
      payloadJson: payload as Record<string, unknown>,
    });
  } catch (e) {
    console.error("logEvent failed:", e);
  }
}

function splitName(full: string | null): { first: string; last: string } {
  if (!full) return { first: "", last: "" };
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

export async function runSubmission(applicationId: string): Promise<SubmissionResult> {
  const realSubmitEnabled = process.env.REAL_SUBMIT_ENABLED === "true";

  // Fetch the application + joined data
  const [row] = await db
    .select({
      app: application,
      jobRow: job,
      profileRow: profile,
    })
    .from(application)
    .innerJoin(job, eq(application.jobId, job.id))
    .innerJoin(profile, eq(profile.userId, application.userId))
    .where(eq(application.id, applicationId))
    .limit(1);

  if (!row) {
    return {
      ok: false,
      ats: "unknown",
      steps: [],
      finalUrl: "",
      liveViewUrl: "",
      realSubmitted: false,
      error: "Application not found.",
    };
  }

  await db
    .update(application)
    .set({ status: "submitting", attempts: row.app.attempts + 1 })
    .where(eq(application.id, applicationId));

  await logEvent(applicationId, "submission_started", {
    company: row.jobRow.company,
    title: row.jobRow.title,
    applyUrl: row.jobRow.applyUrl,
    realSubmitEnabled,
  });

  const screeners = ((row.app.customAnswersJson as { screeners?: ScreenerAnswer[] } | null)?.screeners ?? []) as ScreenerAnswer[];

  const { first, last } = splitName(row.profileRow.fullName);
  const subProfile: SubmissionProfile = {
    fullName: row.profileRow.fullName ?? "",
    firstName: first,
    lastName: last,
    email: row.profileRow.userId, // placeholder; we'll patch with real email below
    phone: row.profileRow.phone,
    location: row.profileRow.location,
    linkedinUrl: row.profileRow.linkedinUrl,
    githubUrl: row.profileRow.githubUrl,
    portfolioUrl: row.profileRow.portfolioUrl,
    workAuthorization: row.profileRow.workAuthorization,
    skillYears: (row.profileRow.skillYears as Record<string, number | null>) ?? {},
    voiceSample: row.profileRow.voiceSample,
    resumePdfBytes: null, // TODO: pull from R2 once we wire resume PDF storage
    resumeFileName: `${(row.profileRow.fullName ?? "resume").replace(/\s+/g, "_")}_resume.pdf`,
    coverLetter: row.app.coverLetterText ?? "",
    screeners,
  };

  // Get the user's email
  const userRow = await db.query.user
    .findFirst({ where: (u, { eq }) => eq(u.id, row.app.userId) })
    .catch(() => null);
  if (userRow?.email) subProfile.email = userRow.email;

  let session: Awaited<ReturnType<typeof startSession>> | null = null;
  const steps: SubmissionStep[] = [];
  let ats: "greenhouse" | "lever" | "unknown" = "unknown";
  let realSubmitted = false;
  let finalUrl = "";
  let liveViewUrl = "";

  try {
    session = await startSession();
    liveViewUrl = session.liveViewUrl;
    await logEvent(applicationId, "session_started", {
      sessionId: session.sessionId,
      liveViewUrl,
    });

    await session.page.goto(row.jobRow.applyUrl, {
      waitUntil: "domcontentloaded",
      timeout: APPLY_TIMEOUT_MS,
    });
    await session.page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});

    finalUrl = session.page.url();
    await logEvent(applicationId, "page_loaded", { url: finalUrl });

    // Detect ATS
    if (row.jobRow.source === "greenhouse" || (await isGreenhousePage(session.page))) {
      ats = "greenhouse";
    } else if (/lever\.co/.test(finalUrl)) {
      ats = "lever";
    }

    await logEvent(applicationId, "ats_detected", { ats });

    if (ats === "greenhouse") {
      const result = await fillGreenhouseForm(session.page, subProfile);
      steps.push(...result.steps);
      for (const s of result.steps) {
        await logEvent(applicationId, s.step, { detail: s.detail, ok: s.ok });
      }

      // Screenshot the filled form for the audit trail
      const screenshot = await session.page.screenshot({ fullPage: true });
      await logEvent(applicationId, "screenshot", {
        size: screenshot.length,
        note: "filled form, pre-submit",
      });

      // Final click — gated by env flag
      if (realSubmitEnabled && result.submitButton) {
        await session.page.locator(result.submitButton.selector).first().click();
        await session.page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
        realSubmitted = true;
        await logEvent(applicationId, "submit_clicked", { url: session.page.url() });
      } else {
        await logEvent(applicationId, "demo_skipped_submit", {
          reason: realSubmitEnabled
            ? "no submit button found"
            : "REAL_SUBMIT_ENABLED is false (demo mode)",
        });
      }
    } else {
      await logEvent(applicationId, "ats_unsupported", {
        ats,
        note: "Only Greenhouse is supported in this phase. Lever + Ashby coming next.",
      });
    }

    await db
      .update(application)
      .set({
        status: realSubmitted ? "submitted" : "needsHuman",
        submittedAt: new Date(),
      })
      .where(eq(application.id, applicationId));

    return {
      ok: true,
      ats,
      steps,
      finalUrl,
      liveViewUrl,
      realSubmitted,
      error: null,
    };
  } catch (e) {
    const error = e instanceof Error ? e.message : "unknown error";
    await logEvent(applicationId, "error", { message: error });
    await db
      .update(application)
      .set({ status: "failed", failureReason: error })
      .where(eq(application.id, applicationId));
    return {
      ok: false,
      ats,
      steps,
      finalUrl,
      liveViewUrl,
      realSubmitted: false,
      error,
    };
  } finally {
    if (session) await session.close();
  }
}
