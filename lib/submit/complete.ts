import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { application, applicationEvent, job, profile, user as userTable } from "../db/schema";
import { startSession } from "./browserbase";
import { fillGreenhouseForm } from "./greenhouse";
import type { SubmissionProfile } from "./types";

/**
 * Phase B of the CAPTCHA flow — called by /api/complete-with-code after
 * the verification code is extracted from Gmail. Opens a fresh Browserbase
 * session, navigates to the apply URL, re-runs the form-fill (the cached
 * tailoring + profile data are reused), types the verification code into
 * the security code field, and clicks Submit.
 *
 * Why we have to re-fill: Browserbase sessions are killed when the
 * runSubmission function returns. The previous session is gone. Reddit's
 * form state was tied to that session. So we run the form again — fast,
 * because tailoring is cached.
 */
export async function completeWithCode(
  applicationId: string,
  code: string,
): Promise<{ ok: boolean; succeeded: boolean; error: string | null }> {
  const [row] = await db
    .select({ app: application, jobRow: job, profileRow: profile })
    .from(application)
    .innerJoin(job, eq(application.jobId, job.id))
    .innerJoin(profile, eq(profile.userId, application.userId))
    .where(eq(application.id, applicationId))
    .limit(1);
  if (!row) return { ok: false, succeeded: false, error: "application_not_found" };

  // Pull email
  const userRow = await db.query.user
    .findFirst({ where: (u, { eq }) => eq(u.id, row.app.userId) })
    .catch(() => null);
  const email = userRow?.email ?? "";

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

  await logEvent(applicationId, "complete_with_code_started", { codePreview: code.slice(0, 2) + "…" });

  let session: Awaited<ReturnType<typeof startSession>> | null = null;
  try {
    session = await startSession();
    await session.page.goto(row.jobRow.applyUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await session.page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});

    // Re-run the form fill so all fields are populated.
    await fillGreenhouseForm(session.page, subProfile);

    // Find the security code input. Reddit calls it "Security code"; some
    // boards call it "Verification code" or have a code-input class.
    const codeInputSelectors = [
      "input[name*='security' i]",
      "input[name*='code' i][name*='verif' i]",
      "input[name*='verification' i]",
      "input[placeholder*='code' i]",
      "input[aria-label*='security code' i]",
      "input[aria-label*='verification code' i]",
    ];
    let filled = false;
    for (const sel of codeInputSelectors) {
      const inp = session.page.locator(sel).first();
      if ((await inp.count()) === 0) continue;
      if (!(await inp.isVisible().catch(() => false))) continue;
      try {
        await inp.fill(code, { timeout: 3000 });
        await logEvent(applicationId, "code_filled", { selector: sel, code: code.slice(0, 2) + "…" });
        filled = true;
        break;
      } catch {
        // try next
      }
    }
    if (!filled) {
      // Some forms split the code across separate per-digit inputs.
      const digitInputs = await session.page
        .locator("input[maxlength='1'][type='text'], input[maxlength='1']:not([type])")
        .all();
      if (digitInputs.length >= code.length) {
        for (let i = 0; i < code.length; i++) {
          await digitInputs[i].fill(code[i]).catch(() => {});
        }
        await logEvent(applicationId, "code_filled_per_digit", { length: digitInputs.length });
        filled = true;
      }
    }

    if (!filled) {
      await logEvent(applicationId, "code_input_not_found", { code: code.slice(0, 2) + "…" });
      return { ok: false, succeeded: false, error: "code_input_not_found" };
    }

    // Click Submit
    const submitSelectors = [
      "button[type='submit']:visible",
      "button:has-text('Submit Application'):visible",
      "button:has-text('Submit'):visible",
    ];
    let clicked = false;
    for (const sel of submitSelectors) {
      const btn = session.page.locator(sel).first();
      if ((await btn.count()) === 0) continue;
      try {
        await btn.click({ timeout: 3000 });
        clicked = true;
        break;
      } catch {
        // try next
      }
    }
    if (!clicked) {
      await logEvent(applicationId, "code_submit_not_found", {});
      return { ok: false, succeeded: false, error: "submit_not_found" };
    }

    await session.page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
    await session.page.waitForTimeout(1500);

    const bodyText = (await session.page.locator("body").textContent().catch(() => "")) ?? "";
    const finalShot = await session.page.screenshot({ fullPage: true, type: "jpeg", quality: 70 });
    const looksLikeThankYou = /thank you|your application|application.{0,20}(submitted|received)|we'?ll be in touch/i.test(
      bodyText.slice(0, 4000),
    );
    const succeeded = looksLikeThankYou;

    await logEvent(applicationId, "screenshot_after_code", {
      size: finalShot.length,
      imageBase64: finalShot.toString("base64"),
      succeeded,
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
