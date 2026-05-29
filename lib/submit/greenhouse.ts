import type { Page } from "playwright-core";
import type { SubmissionProfile, SubmissionStep } from "./types";

/**
 * Fill a Greenhouse-hosted application form.
 *
 * Greenhouse boards come in two flavors:
 *   1. boards.greenhouse.io/{slug}/jobs/{id} (legacy)
 *   2. job-boards.greenhouse.io/{slug}/jobs/{id} (modern)
 * Both use the same input field IDs, so one filler works for both.
 *
 * This function fills the form and returns. It does NOT click Submit —
 * the orchestrator decides whether to click based on REAL_SUBMIT_ENABLED.
 */
export async function fillGreenhouseForm(
  page: Page,
  profile: SubmissionProfile,
): Promise<{ steps: SubmissionStep[]; submitButton: { selector: string } | null }> {
  const steps: SubmissionStep[] = [];

  async function tryFill(selectors: string[], value: string, label: string) {
    for (const sel of selectors) {
      const loc = page.locator(sel).first();
      if ((await loc.count()) === 0) continue;
      if (!(await loc.isVisible().catch(() => false))) continue;
      try {
        await loc.fill(value, { timeout: 4000 });
        steps.push({ step: `filled_${label}`, detail: value, ok: true });
        return true;
      } catch (e) {
        steps.push({
          step: `failed_${label}`,
          detail: e instanceof Error ? e.message : "fill failed",
          ok: false,
        });
      }
    }
    return false;
  }

  // ── First name / Last name ────────────────────────────────
  await tryFill(["#first_name", "input[name='first_name']", "input[id*='first_name']"], profile.firstName, "first_name");
  await tryFill(["#last_name", "input[name='last_name']", "input[id*='last_name']"], profile.lastName, "last_name");

  // ── Email / Phone ─────────────────────────────────────────
  await tryFill(["#email", "input[type='email']", "input[name='email']"], profile.email, "email");
  if (profile.phone) {
    await tryFill(["#phone", "input[type='tel']", "input[name='phone']"], profile.phone, "phone");
  }

  // ── LinkedIn / Website ────────────────────────────────────
  if (profile.linkedinUrl) {
    await tryFill(
      [
        "input[id*='linkedin' i]",
        "input[name*='linkedin' i]",
        "input[placeholder*='linkedin' i]",
      ],
      profile.linkedinUrl,
      "linkedin",
    );
  }
  if (profile.portfolioUrl ?? profile.githubUrl) {
    await tryFill(
      [
        "input[id*='website' i]",
        "input[name*='website' i]",
        "input[placeholder*='website' i]",
        "input[id*='portfolio' i]",
      ],
      profile.portfolioUrl ?? profile.githubUrl!,
      "website",
    );
  }

  // ── Resume upload ─────────────────────────────────────────
  if (profile.resumePdfBytes) {
    const fileInputSelectors = [
      "input[type='file'][name*='resume' i]",
      "input[type='file'][id*='resume' i]",
      "input[type='file']",
    ];
    for (const sel of fileInputSelectors) {
      const loc = page.locator(sel).first();
      if ((await loc.count()) === 0) continue;
      try {
        await loc.setInputFiles({
          name: profile.resumeFileName,
          mimeType: "application/pdf",
          buffer: profile.resumePdfBytes,
        });
        steps.push({ step: "uploaded_resume", detail: profile.resumeFileName, ok: true });
        break;
      } catch (e) {
        steps.push({
          step: "failed_resume_upload",
          detail: e instanceof Error ? e.message : "upload failed",
          ok: false,
        });
      }
    }
  }

  // ── Cover letter ──────────────────────────────────────────
  if (profile.coverLetter) {
    // Most modern Greenhouse forms use a paste-text field rather than upload.
    await tryFill(
      [
        "textarea[name*='cover' i]",
        "textarea[id*='cover' i]",
        "textarea[placeholder*='cover' i]",
      ],
      profile.coverLetter,
      "cover_letter",
    );
  }

  // ── Location ──────────────────────────────────────────────
  if (profile.location) {
    await tryFill(
      [
        "input[id*='location' i]",
        "input[name*='location' i]",
        "input[placeholder*='location' i]",
      ],
      profile.location,
      "location",
    );
  }

  // ── Find the submit button (but don't click) ──────────────
  const submitSelectors = [
    "button[type='submit']",
    "input[type='submit']",
    "button:has-text('Submit Application')",
    "button:has-text('Submit application')",
    "button:has-text('Submit')",
  ];
  let submitSelector: string | null = null;
  for (const sel of submitSelectors) {
    if ((await page.locator(sel).count()) > 0) {
      submitSelector = sel;
      break;
    }
  }
  if (submitSelector) {
    steps.push({ step: "found_submit_button", detail: submitSelector, ok: true });
  } else {
    steps.push({ step: "no_submit_button", detail: "couldn't locate submit", ok: false });
  }

  return {
    steps,
    submitButton: submitSelector ? { selector: submitSelector } : null,
  };
}

/**
 * Quick check: does this page look like a Greenhouse-powered job board?
 */
export async function isGreenhousePage(page: Page): Promise<boolean> {
  const url = page.url();
  if (/greenhouse\.io/i.test(url)) return true;
  // Greenhouse boards are also frequently embedded on company domains under
  // /careers or /jobs paths. Check for hallmark structure.
  const hasGhMarker = await page
    .locator("[data-source='greenhouse'], iframe[src*='greenhouse.io']")
    .count()
    .then((n) => n > 0)
    .catch(() => false);
  return hasGhMarker;
}
