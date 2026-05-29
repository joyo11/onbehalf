import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { application, applicationEvent, job, profile, user as userTable } from "../db/schema";
import { tailorForJob } from "../tailor";
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

  // If this application hasn't been tailored yet (came in via /go batch mode
  // rather than the single-job /review path), run tailoring now so we have a
  // real cover letter + summary + screener answers before filling the form.
  let coverLetterText = row.app.coverLetterText ?? "";
  let tailoringSummary = row.app.tailoringSummary;
  let screeners = ((row.app.customAnswersJson as { screeners?: ScreenerAnswer[] } | null)?.screeners ?? []) as ScreenerAnswer[];

  const needsTailoring = !coverLetterText && !tailoringSummary;
  if (needsTailoring) {
    await db
      .update(application)
      .set({ status: "tailoring" })
      .where(eq(application.id, applicationId));
    await logEvent(applicationId, "tailoring_started", {});
    try {
      // Pull the real user row so tailorForJob has a proper email for the
      // cover letter header.
      const [realUser] = await db
        .select()
        .from(userTable)
        .where(eq(userTable.id, row.app.userId))
        .limit(1);
      if (!realUser) throw new Error("User not found for tailoring");
      const tail = await tailorForJob(realUser, row.jobRow.id);
      coverLetterText = tail.coverLetter.cover_letter;
      tailoringSummary = tail.tailoring.summary;
      screeners = tail.screeners.answers;
      await db
        .update(application)
        .set({
          coverLetterText,
          tailoringSummary,
          customAnswersJson: { screeners },
        })
        .where(eq(application.id, applicationId));
      await logEvent(applicationId, "tailoring_complete", { summary: tailoringSummary });
    } catch (e) {
      await logEvent(applicationId, "tailoring_failed", {
        error: e instanceof Error ? e.message : "unknown",
      });
      // Continue with what we have; the form fill can still happen.
    }
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
    resumePdfBytes: row.profileRow.resumePdf
      ? Buffer.isBuffer(row.profileRow.resumePdf)
        ? row.profileRow.resumePdf
        : Buffer.from(row.profileRow.resumePdf)
      : null,
    resumeFileName:
      row.profileRow.resumeFileName ??
      `${(row.profileRow.fullName ?? "resume").replace(/\s+/g, "_")}_resume.pdf`,
    coverLetter: coverLetterText,
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

      // Pre-submit screenshot (audit trail; we persist it as base64 so it
      // survives past the ephemeral Browserbase session).
      const preShot = await session.page.screenshot({ fullPage: true, type: "jpeg", quality: 70 });
      await logEvent(applicationId, "screenshot_pre_submit", {
        size: preShot.length,
        imageBase64: preShot.toString("base64"),
      });

      if (realSubmitEnabled && result.submitButton) {
        const urlBefore = session.page.url();
        await session.page.locator(result.submitButton.selector).first().click();
        // Wait longer than before — Anthropic's Greenhouse forms run
        // client-side validation, then a network round-trip, then a route
        // change. 15s covers all of that.
        await session.page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
        await session.page.waitForTimeout(2000);

        const urlAfter = session.page.url();
        const bodyText = (await session.page
          .locator("body")
          .textContent()
          .catch(() => "")) ?? "";

        const postShot = await session.page.screenshot({ fullPage: true, type: "jpeg", quality: 70 });

        const navigated = urlAfter !== urlBefore;
        const looksLikeThankYou = /thank you|your application|application.{0,20}(submitted|received)|we'?ll be in touch/i.test(
          bodyText.slice(0, 4000),
        );
        const looksLikeValidationError = /required|please (enter|select|provide|fill)|missing|cannot be (empty|blank)/i.test(
          bodyText.slice(0, 4000),
        );
        const submitSucceeded = navigated || looksLikeThankYou;
        realSubmitted = submitSucceeded;

        await logEvent(
          applicationId,
          submitSucceeded ? "submit_succeeded" : "submit_failed_validation",
          {
            urlBefore,
            urlAfter,
            navigated,
            looksLikeThankYou,
            looksLikeValidationError,
            bodyPreview: bodyText.replace(/\s+/g, " ").slice(0, 600),
          },
        );

        await logEvent(applicationId, "screenshot_post_submit", {
          size: postShot.length,
          imageBase64: postShot.toString("base64"),
          succeeded: submitSucceeded,
        });
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
