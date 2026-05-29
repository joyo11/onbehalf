import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { application, applicationEvent, job, profile, user as userTable } from "../db/schema";
import { tailorForJob } from "../tailor";
import { startSession } from "./browserbase";
import { fillGreenhouseForm, isGreenhousePage } from "./greenhouse";
import type { SubmissionProfile, SubmissionResult, SubmissionStep } from "./types";

const APPLY_TIMEOUT_MS = 50_000;

type ScreenerAnswer = { question: string; answer: string; confidence: string };

/**
 * Many "apply now" links land on a description page that either:
 *   (a) embeds the Greenhouse form via an iframe, or
 *   (b) has a button you must click to reach the form.
 * Resolve either to a page that's actually a form.
 */
async function unwrapToFormPage(
  page: import("playwright-core").Page,
  applicationId: string,
): Promise<void> {
  // Case (a): are we already on the form? Check first — saves us from
  // chasing false-positive iframes (e.g. Reddit's Greenhouse page embeds
  // a Google API helper iframe whose src happens to contain
  // 'greenhouse.io' in a query param, but the real form is the parent).
  const onForm = await page
    .locator(
      "input[name='first_name'], input[id*='first_name'], input[type='file'][name*='resume' i]",
    )
    .first()
    .isVisible({ timeout: 2000 })
    .catch(() => false);
  if (onForm) {
    await logEvent(applicationId, "already_on_form", { url: page.url() });
    return;
  }

  // Case (b): iframe embed of a Greenhouse form on a company careers page.
  // Tight selector — only iframes whose src path actually serves a
  // Greenhouse form (not Google iframes that happen to have greenhouse.io
  // in their query string).
  const iframeSrc = await page
    .locator(
      "iframe[src^='https://boards.greenhouse.io/embed/'], " +
        "iframe[src^='https://job-boards.greenhouse.io/embed/'], " +
        "iframe[src^='https://boards.greenhouse.io/'][src*='/jobs/'], " +
        "iframe[src^='https://job-boards.greenhouse.io/'][src*='/jobs/']",
    )
    .first()
    .getAttribute("src")
    .catch(() => null);
  if (iframeSrc) {
    await logEvent(applicationId, "iframe_detected", { src: iframeSrc });
    try {
      const absoluteSrc = new URL(iframeSrc, page.url()).toString();
      await page.goto(absoluteSrc, { waitUntil: "domcontentloaded", timeout: APPLY_TIMEOUT_MS });
      await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
      await logEvent(applicationId, "unwrapped_to_iframe_src", { url: page.url() });
      return;
    } catch (e) {
      await logEvent(applicationId, "unwrap_iframe_failed", {
        error: e instanceof Error ? e.message : "unknown",
      });
    }
  }

  // Look for an Apply button to click through.
  const applyButtonCandidates = [
    "a:has-text('Apply Now')",
    "a:has-text('Apply for this job')",
    "a:has-text('Apply')",
    "button:has-text('Apply Now')",
    "button:has-text('Apply for this job')",
    "button:has-text('Apply')",
    "[role='button']:has-text('Apply')",
  ];
  for (const sel of applyButtonCandidates) {
    const btn = page.locator(sel).first();
    if ((await btn.count()) === 0) continue;
    if (!(await btn.isVisible().catch(() => false))) continue;
    try {
      await logEvent(applicationId, "clicking_apply", { selector: sel });
      await Promise.all([
        page.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {}),
        btn.click({ timeout: 5000 }),
      ]);
      await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
      await logEvent(applicationId, "unwrapped_via_apply_click", { url: page.url() });
      return;
    } catch (e) {
      await logEvent(applicationId, "apply_click_failed", {
        selector: sel,
        error: e instanceof Error ? e.message : "unknown",
      });
    }
  }
}

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

export async function runSubmission(
  applicationId: string,
  opts: { dryRun?: boolean } = {},
): Promise<SubmissionResult> {
  // Dry-run forces the submit click off regardless of REAL_SUBMIT_ENABLED.
  // Used to verify form-fill correctness end-to-end without filing a real
  // application at the company.
  const realSubmitEnabled = !opts.dryRun && process.env.REAL_SUBMIT_ENABLED === "true";

  // Atomically claim this application. If another worker already moved it
  // past 'queued' (e.g. user double-clicked Approve & submit and two
  // process-queue runs raced), bail out — we don't want two parallel
  // Browserbase sessions spending money to fail twice.
  const claim = await db
    .update(application)
    .set({ status: "tailoring" })
    .where(and(eq(application.id, applicationId), eq(application.status, "queued")))
    .returning({ id: application.id });
  if (claim.length === 0) {
    // Someone else got there first (or the row isn't in 'queued' state
    // anymore). Skip.
    return {
      ok: false,
      ats: "unknown",
      steps: [],
      finalUrl: "",
      liveViewUrl: "",
      realSubmitted: false,
      error: "Already claimed by another worker.",
    };
  }

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
    // Status already set to 'tailoring' by the claim above.
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

    // Handle intermediate "Apply Now" detail pages (Datadog, Stripe-style
    // careers sites). If the page has an Apply button but no form fields,
    // click through to the real form. Also handle the iframe-embed case
    // (Greenhouse JS widget embedded on a company careers domain) by
    // navigating straight to the iframe's src.
    await unwrapToFormPage(session.page, applicationId);

    finalUrl = session.page.url();
    await logEvent(applicationId, "page_loaded", { url: finalUrl });

    // Detect ATS
    if (
      row.jobRow.source === "greenhouse" ||
      /greenhouse\.io/.test(finalUrl) ||
      (await isGreenhousePage(session.page))
    ) {
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
