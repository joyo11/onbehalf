import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { application, applicationEvent, job, profile, user as userTable } from "../db/schema";
import { findVerificationCode, gmailForUser } from "../gmail";
import { startSession } from "./browserbase";
import { fillGreenhouseForm } from "./greenhouse";
import type { SubmissionProfile } from "./types";

/**
 * Phase B of the CAPTCHA flow — called by /api/complete-with-code after
 * an application has been parked in `awaitingCode` status.
 *
 * Important: Reddit (and most ATS CAPTCHA flows) bind the verification
 * code to the originating session's CSRF token / cookies. Our original
 * Browserbase session was already killed when the Vercel function
 * returned. So we can't just type the original code — we have to:
 *
 *   1. Open a fresh Browserbase session
 *   2. Refill the form (cached tailoring + profile)
 *   3. Click Submit → CAPTCHA modal appears, NEW code email sent
 *   4. Wait for the code-input element to be visible
 *   5. Poll the user's Gmail for the NEW code (arrives within ~30s)
 *   6. Type the code, click the modal's Submit
 */
export async function completeWithCode(
  applicationId: string,
): Promise<{ ok: boolean; succeeded: boolean; error: string | null }> {
  const [row] = await db
    .select({ app: application, jobRow: job, profileRow: profile })
    .from(application)
    .innerJoin(job, eq(application.jobId, job.id))
    .innerJoin(profile, eq(profile.userId, application.userId))
    .where(eq(application.id, applicationId))
    .limit(1);
  if (!row) return { ok: false, succeeded: false, error: "application_not_found" };

  const [userRow] = await db
    .select({ email: userTable.email, refreshToken: userTable.gmailRefreshToken })
    .from(userTable)
    .where(eq(userTable.id, row.app.userId))
    .limit(1);
  if (!userRow?.refreshToken) {
    await db
      .update(application)
      .set({ status: "needsHuman" })
      .where(eq(application.id, applicationId));
    return { ok: false, succeeded: false, error: "no_gmail_token" };
  }
  const email = userRow.email ?? "";

  const { first, last } = splitName(row.profileRow.fullName);
  const subProfile: SubmissionProfile = {
    fullName: row.profileRow.fullName ?? "",
    firstName: first,
    lastName: last,
    preferredName: row.profileRow.preferredName ?? null,
    email,
    phone: row.profileRow.phone,
    location: row.profileRow.location,
    linkedinUrl: row.profileRow.linkedinUrl,
    githubUrl: row.profileRow.githubUrl,
    portfolioUrl: row.profileRow.portfolioUrl,
    workAuthorization: row.profileRow.workAuthorization,
    needsSponsorship: row.profileRow.needsSponsorship ?? false,
    countryOfResidence: row.profileRow.countryOfResidence ?? null,
    countryOfWork: row.profileRow.countryOfWork ?? null,
    employmentRestrictions: row.profileRow.employmentRestrictions ?? false,
    previouslyWorkedHere: row.profileRow.previouslyWorkedHere ?? false,
    accommodationsNeeded: row.profileRow.accommodationsNeeded ?? null,
    eeoGender: row.profileRow.eeoGender ?? "decline",
    eeoHispanicLatino: row.profileRow.eeoHispanicLatino ?? "decline",
    eeoRaceEthnicity: row.profileRow.eeoRaceEthnicity ?? "decline",
    eeoVeteranStatus: row.profileRow.eeoVeteranStatus ?? "decline",
    eeoDisabilityStatus: row.profileRow.eeoDisabilityStatus ?? "decline",
    eeoSexualOrientation: row.profileRow.eeoSexualOrientation ?? "decline",
    currentCompany: row.profileRow.currentCompany ?? null,
    currentJobTitle: row.profileRow.currentJobTitle ?? null,
    currentlyAuthorizedUS: row.profileRow.currentlyAuthorizedUS ?? true,
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
    coverLetter: row.app.coverLetterText ?? "",
    screeners:
      ((row.app.customAnswersJson as { screeners?: SubmissionProfile["screeners"] } | null)
        ?.screeners ?? []) as SubmissionProfile["screeners"],
  };

  await logEvent(applicationId, "complete_with_code_started", {});

  const codeInputSelector =
    "input[name*='security' i], input[name*='verification' i], input[name*='confirm_code' i], input[aria-label*='security code' i], input[aria-label*='verification code' i], input[placeholder*='code' i]";

  let session: Awaited<ReturnType<typeof startSession>> | null = null;
  try {
    session = await startSession();
    await session.page.goto(row.jobRow.applyUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await session.page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});

    await fillGreenhouseForm(session.page, subProfile);

    // Click the primary Submit Application button — this triggers Reddit's
    // CAPTCHA modal and sends a fresh code email.
    const submitSelectors = [
      "button:has-text('Submit Application'):visible",
      "button[type='submit']:visible",
      "button:has-text('Submit'):visible",
    ];
    let triggered = false;
    for (const sel of submitSelectors) {
      const btn = session.page.locator(sel).first();
      if ((await btn.count()) === 0) continue;
      try {
        await btn.click({ timeout: 3000 });
        triggered = true;
        break;
      } catch {
        // try next
      }
    }
    if (!triggered) {
      await logEvent(applicationId, "complete_submit_not_found", {});
      return { ok: false, succeeded: false, error: "submit_not_found" };
    }
    await logEvent(applicationId, "complete_initial_submit_clicked", {});

    // Wait for the code input to become visible. Reddit's modal usually
    // appears within 2-4 seconds of the click.
    const codeInput = session.page.locator(codeInputSelector).first();
    const captchaAppeared = await codeInput
      .waitFor({ state: "visible", timeout: 15_000 })
      .then(() => true)
      .catch(() => false);

    if (!captchaAppeared) {
      // No CAPTCHA appeared — maybe the form submitted directly this time?
      // Check for thank-you signals.
      await session.page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
      const bodyText = (await session.page.locator("body").textContent().catch(() => "")) ?? "";
      const thankYou = /thank you|your application|application.{0,20}(submitted|received)|we'?ll be in touch/i.test(
        bodyText.slice(0, 4000),
      );
      if (thankYou) {
        await db
          .update(application)
          .set({ status: "submitted", submittedAt: new Date() })
          .where(eq(application.id, applicationId));
        await logEvent(applicationId, "complete_no_captcha_submitted", {});
        return { ok: true, succeeded: true, error: null };
      }
      await logEvent(applicationId, "complete_captcha_not_visible", {
        bodyPreview: bodyText.replace(/\s+/g, " ").slice(0, 600),
      });
      return { ok: false, succeeded: false, error: "captcha_not_visible" };
    }

    await logEvent(applicationId, "complete_captcha_visible", {});

    // Poll Gmail for the fresh code. Submit happened seconds ago — give
    // the email up to ~40s to arrive.
    const gmail = gmailForUser(userRow.refreshToken);
    let code: string | null = null;
    const pollDeadline = Date.now() + 45_000;
    while (Date.now() < pollDeadline) {
      code = await findVerificationCode(gmail, {
        company: row.jobRow.company,
        sinceMinutes: 3,
      }).catch(() => null);
      if (code) break;
      await new Promise((r) => setTimeout(r, 5000));
    }
    if (!code) {
      await logEvent(applicationId, "complete_code_not_in_gmail", {});
      return { ok: false, succeeded: false, error: "code_not_in_gmail" };
    }
    await logEvent(applicationId, "complete_code_found", { codePreview: code.slice(0, 2) + "…" });

    // Type the code into the code input. Single-input first, fallback to
    // per-digit inputs.
    let filled = false;
    try {
      await codeInput.fill(code, { timeout: 3000 });
      filled = true;
    } catch {
      const digitInputs = await session.page
        .locator("input[maxlength='1'][type='text'], input[maxlength='1']:not([type])")
        .all();
      if (digitInputs.length >= code.length) {
        for (let i = 0; i < code.length; i++) {
          await digitInputs[i].fill(code[i]).catch(() => {});
        }
        filled = true;
      }
    }
    if (!filled) {
      await logEvent(applicationId, "complete_code_input_fill_failed", {});
      return { ok: false, succeeded: false, error: "code_fill_failed" };
    }

    // Click the modal's Submit / Verify / Continue button.
    const modalSubmitSelectors = [
      "button:has-text('Verify'):visible",
      "button:has-text('Submit'):visible",
      "button:has-text('Continue'):visible",
      "button[type='submit']:visible",
    ];
    let finalClicked = false;
    for (const sel of modalSubmitSelectors) {
      const btn = session.page.locator(sel).last();
      if ((await btn.count()) === 0) continue;
      try {
        await btn.click({ timeout: 3000 });
        finalClicked = true;
        break;
      } catch {
        // try next
      }
    }
    if (!finalClicked) {
      await logEvent(applicationId, "complete_final_submit_not_found", {});
      return { ok: false, succeeded: false, error: "final_submit_not_found" };
    }

    await session.page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
    await session.page.waitForTimeout(2000);

    const bodyText = (await session.page.locator("body").textContent().catch(() => "")) ?? "";
    const finalShot = await session.page.screenshot({ fullPage: true, type: "jpeg", quality: 70 });
    const succeeded = /thank you|your application|application.{0,20}(submitted|received)|we'?ll be in touch/i.test(
      bodyText.slice(0, 4000),
    );

    await logEvent(applicationId, "complete_screenshot_after_code", {
      size: finalShot.length,
      imageBase64: finalShot.toString("base64"),
      succeeded,
      bodyPreview: bodyText.replace(/\s+/g, " ").slice(0, 600),
    });

    await db
      .update(application)
      .set({
        status: succeeded ? "submitted" : "needsHuman",
        submittedAt: new Date(),
      })
      .where(eq(application.id, applicationId));

    return { ok: true, succeeded, error: null };
  } catch (e) {
    const error = e instanceof Error ? e.message : "unknown";
    await logEvent(applicationId, "complete_with_code_error", { error });
    return { ok: false, succeeded: false, error };
  } finally {
    if (session) await session.close();
  }
}

function splitName(full: string | null): { first: string; last: string } {
  if (!full) return { first: "", last: "" };
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

async function logEvent(applicationId: string, step: string, payload: unknown) {
  try {
    await db.insert(applicationEvent).values({
      applicationId,
      step,
      payloadJson: payload as Record<string, unknown>,
    });
  } catch {
    // ignore
  }
}
