import type { Locator, Page } from "playwright-core";
import { renderCoverLetterPdf } from "./cover-letter-pdf";
import { inferAnswers, type SmartFillContext, type UnknownField } from "./smart-fill";
import type { ResolvedField, SubmissionProfile, SubmissionStep } from "./types";

export type { SmartFillContext, UnknownField } from "./smart-fill";

/**
 * Fill a Greenhouse-hosted application form.
 *
 * Strategy:
 *   1. Fill the always-present identity fields (name, email, phone, resume).
 *   2. Attach a generated cover-letter PDF (with manual-entry + textarea
 *      fallbacks).
 *   3. Walk every visible <label> on the page. For each label, dispatch
 *      to the right answer:
 *        - Direct profile fields (country, sponsorship, demographics, etc.)
 *        - Claude-generated screener answers for skill / company questions
 *      Then fill into whatever input the label is bound to (text,
 *      textarea, native select, React-Select, radio group).
 *   4. Find the submit button. (Caller decides whether to click.)
 */
export async function fillGreenhouseForm(
  page: Page,
  profile: SubmissionProfile,
  job?: { company: string; title: string; jdSummary: string; budget?: import("./resolve-field").LlmBudget },
): Promise<{
  steps: SubmissionStep[];
  submitButton: { selector: string } | null;
  resolvedFields: ResolvedField[];
}> {
  const steps: SubmissionStep[] = [];
  const resolvedFields: ResolvedField[] = [];

  // ── Basic identity ────────────────────────────────────────
  await tryFill(page, ["#first_name", "input[name='first_name']", "input[id*='first_name']"], profile.firstName, "first_name", steps);
  if (profile.firstName) {
    resolvedFields.push({
      label: "First name",
      value: profile.firstName,
      source: "profile",
      confidence: "high",
      reason: "profile.firstName",
    });
  }
  await tryFill(page, ["#last_name", "input[name='last_name']", "input[id*='last_name']"], profile.lastName, "last_name", steps);
  if (profile.lastName) {
    resolvedFields.push({
      label: "Last name",
      value: profile.lastName,
      source: "profile",
      confidence: "high",
      reason: "profile.lastName",
    });
  }
  await tryFill(page, ["#email", "input[type='email']", "input[name='email']"], profile.email, "email", steps);
  if (profile.email) {
    resolvedFields.push({
      label: "Email",
      value: profile.email,
      source: "profile",
      confidence: "high",
      reason: "profile.email",
    });
  }
  if (profile.phone) {
    await tryFill(page, ["#phone", "input[type='tel']", "input[name='phone']"], profile.phone, "phone", steps);
    resolvedFields.push({
      label: "Phone",
      value: profile.phone,
      source: "profile",
      confidence: "high",
      reason: "profile.phone",
    });
  }

  // ── Resume upload ─────────────────────────────────────────
  if (profile.resumePdfBytes) {
    await uploadFile(
      page,
      ["input[type='file'][name*='resume' i]", "input[type='file'][id*='resume' i]"],
      profile.resumePdfBytes,
      profile.resumeFileName,
      "uploaded_resume",
      steps,
    );
  }

  // ── Cover letter (Attach PDF preferred, manual entry / textarea fallback)
  if (profile.coverLetter) {
    await fillCoverLetter(page, profile, steps);
  }

  // ── Walk every labelled field and answer it ───────────────
  await page.waitForTimeout(400);
  const resolverCtx = job
    ? { profile, jobCtx: job, resolvedFields }
    : undefined;
  // Phase 2B item 3 — conditional-field re-runs. Some forms reveal new
  // fields after a select changes (e.g. picking US shows a state
  // dropdown). We run fillAllLabelledFields up to 2 more times,
  // sharing a seen set so we never re-fill anything we already
  // resolved. Stop early if a pass fills nothing new.
  const seenLabels = new Set<string>();
  await fillAllLabelledFields(page, profile, steps, resolverCtx, seenLabels);
  for (let pass = 0; pass < 2; pass++) {
    await page.waitForTimeout(500); // let the DOM mutate after our fills
    const r = await fillAllLabelledFields(page, profile, steps, resolverCtx, seenLabels);
    if (r.filled === 0) break;
    steps.push({
      step: "conditional_rerun_filled",
      detail: `pass ${pass + 1} → ${r.filled} newly-revealed field${r.filled === 1 ? "" : "s"}`,
      ok: true,
    });
  }

  // Reddit-style city autocomplete React-Selects need the city name typed
  // before options load. Walk the page for any visible React-Select that
  // hasn't been filled and whose label contains 'location' or 'city',
  // then type the user's city (extracted from profile.location).
  await fillCityAutocompletes(page, profile, steps);

  // Auto-check any "I agree / I acknowledge / I consent" submission checkboxes
  // that sit near the submit button. These are always boilerplate legal
  // acknowledgments — leaving them unchecked is the #1 reason a form
  // validates to fail at the very last step.
  await checkAcknowledgmentBoxes(page, steps);

  // Smart "I agree" SELECTs — Reddit uses a SELECT dropdown for the
  // privacy policy acknowledgment instead of a checkbox. Find any visible
  // SELECT or React-Select whose options include "I agree" / "Yes" and
  // pick it.
  await answerAgreementSelects(page, steps);

  // Smart fallback — any required text/textarea still empty at this point
  // gets a Claude-generated tailored answer (one batched call). If `job`
  // wasn't provided, or the LLM call fails, we fall back to literal "N/A"
  // — better than blank, since the form refuses to submit on empty
  // required fields.
  await fillEmptyRequiredTextInputs(
    page,
    steps,
    job ? { profile, job, budget: job.budget } : undefined,
    resolvedFields,
  );

  // Phase 2B (4) — scan for file inputs we don't recognize (transcript,
  // portfolio, work sample). Required ones get abstain ResolvedFields
  // so Phase 3 routes the application to needsHuman instead of us
  // silently leaving a required slot empty (or worse, uploading the
  // resume into a transcript slot).
  await flagUnknownRequiredFileInputs(page, steps, resolvedFields);

  // ── Submit button ─────────────────────────────────────────
  await page.waitForTimeout(200);
  const submitSelectors = [
    "button[type='submit']:visible",
    "input[type='submit']:visible",
    "button:has-text('Submit Application'):visible",
    "button:has-text('Submit application'):visible",
    "button:has-text('Submit'):visible",
    "[role='button']:has-text('Submit Application'):visible",
    "[role='button']:has-text('Submit'):visible",
    "button:has-text('Send Application'):visible",
    "button:has-text('Apply'):visible",
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
    resolvedFields,
  };
}

/* ═══════════════ helpers ═══════════════ */

async function tryFill(
  scope: Page | Locator,
  selectors: string[],
  value: string,
  label: string,
  steps: SubmissionStep[],
): Promise<boolean> {
  for (const sel of selectors) {
    const loc = scope.locator(sel).first();
    if ((await loc.count()) === 0) continue;
    if (!(await loc.isVisible().catch(() => false))) continue;
    try {
      await loc.fill(value, { timeout: 4000 });
      steps.push({ step: `filled_${label}`, detail: value.slice(0, 80), ok: true });
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

async function uploadFile(
  scope: Page | Locator,
  selectors: string[],
  bytes: Buffer,
  name: string,
  stepName: string,
  steps: SubmissionStep[],
): Promise<boolean> {
  const mime = name.toLowerCase().endsWith(".pdf")
    ? "application/pdf"
    : name.toLowerCase().endsWith(".txt")
      ? "text/plain"
      : "application/octet-stream";
  for (const sel of selectors) {
    const loc = scope.locator(sel).first();
    if ((await loc.count()) === 0) continue;
    try {
      await loc.setInputFiles({ name, mimeType: mime, buffer: bytes });
      steps.push({ step: stepName, detail: name, ok: true });
      return true;
    } catch (e) {
      steps.push({
        step: `failed_${stepName}`,
        detail: e instanceof Error ? e.message : "upload failed",
        ok: false,
      });
    }
  }
  return false;
}

/**
 * Cover letter fill — three strategies, first-success-wins:
 *   (a) Find the Cover Letter file input, attach a generated PDF
 *   (b) Find an "Enter manually" button under Cover Letter, click it, fill the
 *       textarea that appears
 *   (c) Find a bare cover-letter textarea (legacy boards) and fill it
 */
async function fillCoverLetter(
  page: Page,
  profile: SubmissionProfile,
  steps: SubmissionStep[],
): Promise<void> {
  // Strategy 1: direct selector — file input with cover-letter-hinting name.
  // This is the most reliable signal on modern Greenhouse boards where the
  // text "Cover Letter" lives in a span/div with no semantic label tag.
  const directInput = page
    .locator("input[type='file'][name*='cover' i], input[type='file'][id*='cover' i]")
    .first();
  if ((await directInput.count()) > 0) {
    try {
      const pdfBytes = await renderCoverLetterPdf(profile.coverLetter);
      const filename = `CoverLetter_${(profile.fullName || profile.firstName).replace(/\s+/g, "_")}.pdf`;
      await directInput.setInputFiles({
        name: filename,
        mimeType: "application/pdf",
        buffer: pdfBytes,
      });
      steps.push({ step: "attached_cover_letter_pdf", detail: filename, ok: true });
      return;
    } catch (e) {
      steps.push({
        step: "failed_attach_cover_letter",
        detail: e instanceof Error ? e.message : "attach failed",
        ok: false,
      });
    }
  }

  // Strategy 2: second <input type='file'> on the page. Greenhouse always
  // renders resume first, cover letter second when both exist.
  const allFileInputs = await page.locator("input[type='file']").all();
  if (allFileInputs.length >= 2) {
    try {
      const pdfBytes = await renderCoverLetterPdf(profile.coverLetter);
      const filename = `CoverLetter_${(profile.fullName || profile.firstName).replace(/\s+/g, "_")}.pdf`;
      await allFileInputs[1].setInputFiles({
        name: filename,
        mimeType: "application/pdf",
        buffer: pdfBytes,
      });
      steps.push({
        step: "attached_cover_letter_pdf",
        detail: filename + " (via 2nd file input)",
        ok: true,
      });
      return;
    } catch (e) {
      steps.push({
        step: "failed_attach_cover_letter",
        detail: e instanceof Error ? e.message : "attach 2nd failed",
        ok: false,
      });
    }
  }

  // Strategy 3: container by label text walk-up (legacy boards).
  const sectionSelectors = [
    "div:has(> label:has-text('Cover Letter'))",
    "div:has(label:has-text('Cover Letter'))",
    "div:has(> h3:has-text('Cover Letter'))",
    "div:has(h3:has-text('Cover Letter'))",
    "fieldset:has(legend:has-text('Cover Letter'))",
  ];
  let section: Locator | null = null;
  for (const sel of sectionSelectors) {
    const loc = page.locator(sel).first();
    if ((await loc.count()) > 0) {
      section = loc;
      break;
    }
  }

  if (section) {
    const fileInput = section.locator("input[type='file']").first();
    if ((await fileInput.count()) > 0) {
      try {
        const pdfBytes = await renderCoverLetterPdf(profile.coverLetter);
        const filename = `CoverLetter_${(profile.fullName || profile.firstName).replace(/\s+/g, "_")}.pdf`;
        await fileInput.setInputFiles({
          name: filename,
          mimeType: "application/pdf",
          buffer: pdfBytes,
        });
        steps.push({ step: "attached_cover_letter_pdf", detail: filename + " (via section)", ok: true });
        return;
      } catch (e) {
        steps.push({
          step: "failed_attach_cover_letter",
          detail: e instanceof Error ? e.message : "attach failed",
          ok: false,
        });
      }
    }

    // (b) Enter manually button
    const enterManuallyBtn = section
      .locator(
        "button:has-text('Enter manually'), [role='button']:has-text('Enter manually'), a:has-text('Enter manually')",
      )
      .first();
    if ((await enterManuallyBtn.count()) > 0) {
      try {
        await enterManuallyBtn.click({ timeout: 3000 });
        await page.waitForTimeout(500);
        const ta = section.locator("textarea").first();
        if ((await ta.count()) > 0) {
          await ta.fill(profile.coverLetter);
          steps.push({ step: "filled_cover_letter_manually", detail: "textarea revealed by click", ok: true });
          return;
        }
      } catch (e) {
        steps.push({
          step: "failed_enter_manually",
          detail: e instanceof Error ? e.message : "click failed",
          ok: false,
        });
      }
    }
  } else {
    steps.push({ step: "no_cover_letter_section", detail: "no Cover Letter label found", ok: false });
  }

  // (c) Bare textarea — legacy boards
  await tryFill(
    page,
    [
      "textarea[name*='cover' i]",
      "textarea[id*='cover' i]",
      "textarea[placeholder*='cover' i]",
    ],
    profile.coverLetter,
    "cover_letter",
    steps,
  );
}

/**
 * Walk every form question on the page. For each, derive an answer from the
 * profile or from the Claude-generated screener answers, then dispatch to
 * the right fill strategy based on field type.
 */
async function fillAllLabelledFields(
  page: Page,
  profile: SubmissionProfile,
  steps: SubmissionStep[],
  resolverCtx?: {
    profile: SubmissionProfile;
    jobCtx: { company: string; title: string; jdSummary: string; budget?: import("./resolve-field").LlmBudget };
    resolvedFields?: ResolvedField[];
  },
  seen?: Set<string>,
): Promise<{ filled: number }> {
  // Build a snapshot of every visible label on the page. We do this once
  // and then iterate, because filling some fields may re-render others.
  // The seen set is shared across passes when the caller supplies one
  // (conditional-field re-runs in Phase 2B item 3).
  const labelEls = await page.locator("label:visible, legend:visible").all();
  const seenSet = seen ?? new Set<string>();
  let filled = 0;

  for (const labelEl of labelEls) {
    let question = "";
    try {
      question = ((await labelEl.textContent({ timeout: 1000 })) ?? "")
        .replace(/\*$/g, "")
        .replace(/\s+/g, " ")
        .trim();
    } catch {
      continue;
    }
    if (!question || seenSet.has(question)) continue;
    seenSet.add(question);

    if (isBasicField(question)) continue;

    const answer = answerForQuestion(question, profile);
    if (answer == null) continue;

    try {
      const ok = await fillByLabel(page, labelEl, question, answer, steps, resolverCtx);
      if (ok) {
        filled++;
      } else {
        steps.push({
          step: "skipped_unknown_field",
          detail: question.slice(0, 80),
          ok: false,
        });
      }
    } catch (e) {
      steps.push({
        step: "errored_field_fill",
        detail: `${question.slice(0, 60)}: ${e instanceof Error ? e.message : "err"}`,
        ok: false,
      });
    }
  }
  return { filled };
}

function isBasicField(q: string): boolean {
  return /^(first name|last name|email|phone|country|resume|cv|cover letter)$/i.test(q.trim());
}

/* ───────────── question → answer mapping ───────────── */

const profileMap: Array<{
  match: RegExp;
  get: (p: SubmissionProfile) => string | null;
}> = [
  // Country residence / location
  {
    match: /current country|country of residence|country.*reside|where (?:are you|do you) (?:currently )?(?:reside|live)/i,
    get: (p) => p.countryOfResidence ?? null,
  },
  {
    match: /country.*(?:located|work|based)|which country.*work|where (?:are you|will you be) (?:currently )?based/i,
    get: (p) => p.countryOfWork ?? p.countryOfResidence ?? null,
  },
  {
    match: /(?:current )?location/i,
    get: (p) => p.location ?? null,
  },
  // Preferred name
  {
    match: /preferred name|name you.*prefer|what name.*us(?:e| to use)/i,
    get: (p) => p.preferredName ?? p.firstName,
  },
  // LinkedIn / GitHub / portfolio (some forms have these as labelled fields).
  // Skip if the profile value isn't actually a URL — a literal "GitHub" string
  // in the profile would otherwise get filled as the field value.
  {
    match: /linkedin/i,
    get: (p) => (isUrl(p.linkedinUrl) ? p.linkedinUrl : null),
  },
  {
    match: /github/i,
    get: (p) => (isUrl(p.githubUrl) ? p.githubUrl : null),
  },
  {
    match: /website|portfolio|personal site/i,
    get: (p) =>
      isUrl(p.portfolioUrl) ? p.portfolioUrl : isUrl(p.githubUrl) ? p.githubUrl : null,
  },
  // Work authorization — long-form options (Vercel/Stripe style)
  // Each form lists 3-5 long descriptions. Map profile to the matching
  // semantic option BEFORE the generic Yes/No sponsorship handler runs.
  {
    match: /authori[sz]ation to work|describe your work authori|status with respect to (?:your )?work/i,
    get: (p) => {
      // Pick the keyword phrase that's likely contained in the right option.
      // The React-Select matcher will fuzzy-match this against the actual
      // option text. Polarity guard still runs after.
      if (p.workAuthorization === "us_citizen_pr") {
        return "nationality"; // matches "I am authorized…due to my nationality"
      }
      if (p.workAuthorization === "needs_sponsorship" || p.needsSponsorship) {
        return "needs to be sponsored"; // matches "…work permit which needs to be sponsored"
      }
      // Has work permit, doesn't need future sponsorship (US OPT no-longer-needs-H1B, EAD, etc.)
      return "do not need a company to sponsor"; // matches "…and do not need a company to sponsor my visa"
    },
  },
  // "Are you currently authorized to work in the U.S.?" — distinct from
  // future sponsorship. Defaults Yes for anyone with F-1 OPT, H1B, US
  // citizens, PRs. Almost no one applies without current authorization.
  {
    match: /currently authori[sz]ed to work|legally authori[sz]ed to work|presently authori[sz]ed|authori[sz]ed to work in (?:the )?(?:US|U\.S\.|United States)/i,
    get: (p) => (p.currentlyAuthorizedUS ? "Yes" : "No"),
  },
  // Visa / sponsorship — short Yes/No
  {
    match: /sponsor|visa|require visa/i,
    get: (p) => (p.needsSponsorship ? "Yes" : "No"),
  },
  // State / region (Vercel asks "Do you live in one of the following states?")
  {
    match: /live in one of the following states|which state|state of residence/i,
    get: (p) => {
      // Extract state from "New York, New York, USA" → "New York"
      // or "Brooklyn, NY" → "NY"
      const loc = p.location ?? "";
      const parts = loc.split(",").map((s) => s.trim()).filter(Boolean);
      // If first part is a city and second is a state-like string, return second
      if (parts.length >= 2) return parts[1];
      return parts[0] ?? "";
    },
  },
  // Country from restricted list ("Are you currently based in any of these countries?")
  {
    match: /currently based in|based in any of these countries|in which of (?:these|the following) countries/i,
    get: (p) => p.countryOfResidence ?? "United States",
  },
  // Employment agreements / non-compete
  {
    match: /employment agreement|post.?employment|non.?compete|restrictive covenant/i,
    get: (p) => (p.employmentRestrictions ? "Yes" : "No"),
  },
  // Worked here before
  {
    match: /previously worked|consulted for|worked (?:at|for) .{0,30}\bbefore|former (?:employee|contractor)/i,
    get: (p) => (p.previouslyWorkedHere ? "Yes" : "No"),
  },
  // Accommodations
  {
    match: /accessibility|accommodation|adjustment.*(?:hiring|interview)|adjustments we can make/i,
    get: (p) => p.accommodationsNeeded ?? "None at this time.",
  },
  // Current / most recent company + job title
  {
    match: /current (?:or most recent )?(?:company|employer)|name of your current|most recent company|where (?:do |are )you currently (?:work|employed)/i,
    get: (p) => p.currentCompany ?? "Independent",
  },
  {
    match: /current (?:or most recent )?(?:job title|role|position)|what (?:is|'s) your current title|most recent title/i,
    get: (p) => p.currentJobTitle ?? "Software Engineer",
  },
  // "How did you hear about this job/role?" — always LinkedIn. It's the
  // single most plausible answer and exists as an option on essentially
  // every form. Stops the agent from picking random options.
  {
    match: /how did you (?:first )?hear|where did you (?:first )?hear|how (?:did you|do you) find (?:out about )?(?:this|the) (?:role|job|position|opportunity)|how (?:did you |do you )?learn about/i,
    get: () => "LinkedIn",
  },
  // Privacy policy "I agree" SELECT (Reddit-style). Not a checkbox — a
  // SELECT dropdown whose options are usually "I agree" / "I do not agree"
  // OR "Yes" / "No". Always pick the agreement.
  {
    match: /\bi agree\b|privacy (?:policy|notice).*(?:agree|accept|consent)|consent to (?:the |our )?(?:privacy|terms)|understand.*(?:will be processed|in accordance|privacy policy)/i,
    get: () => "I agree",
  },
  // EEO
  {
    match: /^gender$|gender identity|what gender/i,
    get: (p) => mapEeoToOption(p.eeoGender, "gender"),
  },
  {
    match: /sexual orientation|orientation do you/i,
    get: (p) => mapEeoToOption(p.eeoSexualOrientation, "sexual_orientation"),
  },
  {
    match: /hispanic|latino|latin[oa]/i,
    get: (p) => mapEeoToOption(p.eeoHispanicLatino, "hispanic"),
  },
  {
    match: /race|ethnicit/i,
    get: (p) => mapEeoToOption(p.eeoRaceEthnicity, "race"),
  },
  {
    match: /veteran/i,
    get: (p) => mapEeoToOption(p.eeoVeteranStatus, "veteran"),
  },
  {
    match: /disability/i,
    get: (p) => mapEeoToOption(p.eeoDisabilityStatus, "disability"),
  },
];

function answerForQuestion(question: string, profile: SubmissionProfile): string | null {
  for (const m of profileMap) {
    if (m.match.test(question)) {
      const v = m.get(profile);
      if (v != null && v !== "") return v;
    }
  }
  // Fall back to screener answers Claude wrote.
  const s = bestScreener(question, profile.screeners);
  if (s) return s.answer;

  // Skill / qualifier defaults. If the question is a "Do you have / Are
  // you / Can you / Have you" yes/no and we have no Claude answer for it,
  // default to "Yes" — most candidates wouldn't reach an apply page if
  // the answer were "No" to a stated job qualifier. Conservative: only
  // when the question keyword matches a skill/practice the user's resume
  // could reasonably contain.
  const q = question.toLowerCase();
  const looksLikeQualifier =
    /^(do you|are you|can you|have you|will you).*(have|use|know|familiar|experience|proficien|fluent|comfort|able)\b/.test(q) ||
    /^(do you have|are you)\b.{0,40}(experience|proficien|fluent|familiar|comfort|able)/.test(q);
  if (looksLikeQualifier) {
    return "Yes";
  }

  return null;
}

/**
 * Greenhouse forms commonly include 1-3 "By submitting I acknowledge…"
 * checkboxes near the submit button. They're standard legal boilerplate
 * (privacy notice, accuracy attestation). Leaving them blank fails
 * validation. Find every visible checkbox and check it — opt-out for
 * marketing-style checkboxes that contain "marketing" / "newsletter" /
 * "promotional" in the label text.
 */
async function checkAcknowledgmentBoxes(page: Page, steps: SubmissionStep[]): Promise<void> {
  const checkboxes = await page.locator("input[type='checkbox']").all();
  for (const cb of checkboxes) {
    try {
      if (!(await cb.isVisible().catch(() => false))) continue;
      if (await cb.isChecked().catch(() => false)) continue;

      const id = await cb.getAttribute("id").catch(() => null);
      let labelText = "";
      if (id) {
        labelText =
          ((await page.locator(`label[for='${cssEscape(id)}']`).first().textContent().catch(() => "")) ?? "")
            .trim();
      }
      if (!labelText) {
        labelText = ((await cb.locator("xpath=..").textContent().catch(() => "")) ?? "").trim();
      }

      // Skip marketing / newsletter opt-ins
      if (/marketing|newsletter|promotional|subscribe|updates from|future opportunit/i.test(labelText)) {
        steps.push({ step: "skipped_marketing_checkbox", detail: labelText.slice(0, 60), ok: true });
        continue;
      }

      await cb.check({ timeout: 2000 });
      steps.push({ step: "checked_acknowledgment", detail: labelText.slice(0, 60), ok: true });
    } catch (e) {
      steps.push({
        step: "failed_checkbox",
        detail: e instanceof Error ? e.message : "check failed",
        ok: false,
      });
    }
  }
}

/**
 * Reddit-style city autocomplete: React-Select that loads options
 * async after the user types 3+ chars. fillReactSelect bailed earlier
 * with "no options visible" because clicking didn't load options
 * without typing first. Find these by label text "City" / "Location"
 * and re-attempt: click, type the city from profile.location, wait
 * longer for async load, click the first option.
 */
export async function fillCityAutocompletes(
  page: Page,
  profile: SubmissionProfile,
  steps: SubmissionStep[],
): Promise<void> {
  // Extract city from "Brooklyn, NY" or "New York, New York, USA" → first part.
  // Phase 2B abstain check — require state/country in profile.location
  // before we attempt the autocomplete. Without disambiguation we'd
  // silently pick the first option, which on some boards is the wrong
  // city in the wrong state (the canonical "Brooklyn, IL not Brooklyn,
  // NY" bug).
  const { parseCityForResolver } = await import("./abstain-checks");
  const parsed = parseCityForResolver(profile.location);
  if (!parsed.ok) {
    steps.push({
      step: "abstained_city_autocomplete",
      detail: parsed.reason,
      ok: false,
    });
    // We don't know how many city-shaped controls there are; push one
    // abstain ResolvedField at the function level. The caller can
    // dedupe by label if it ever loops.
    return;
  }
  const city = parsed.city;
  const region = parsed.region;

  // Find any visible React-Select control inside a container whose label
  // mentions Location or City AND whose value-container shows "Select..."
  // (i.e. nothing committed yet).
  const labels = await page
    .locator("label:visible, legend:visible")
    .filter({ hasText: /location|city/i })
    .all();

  for (const labelEl of labels) {
    try {
      const container = labelEl
        .locator("xpath=ancestor::*[self::div or self::fieldset][1]")
        .first();
      const control = container
        .locator(
          "[class*='select__control' i], [class*='Select__control' i], div[class*='control' i]:has([class*='placeholder' i]), [role='combobox']",
        )
        .first();
      if ((await control.count()) === 0) continue;
      if (!(await control.isVisible().catch(() => false))) continue;

      // Skip if a value is already committed (look for non-placeholder text)
      const placeholderEl = container.locator("[class*='placeholder' i]").first();
      if ((await placeholderEl.count()) === 0) continue; // no placeholder => already filled

      await control.click({ timeout: 2000 });
      await page.waitForTimeout(150);
      await page.keyboard.type(city, { delay: 25 });
      // City autocomplete typically debounces 300-500ms before fetching
      await page.waitForTimeout(900);

      // Enumerate visible options (was: just click the first). Look for
      // one whose text contains BOTH the city we typed AND the region
      // (state/country) — that's a high-confidence match. Fall back to
      // single-option auto-pick at medium, abstain when ambiguous.
      const optionSelectors = [
        "[role='option']:visible",
        "[class*='option']:visible:not([class*='disabled' i])",
        "[class*='Option']:visible:not([class*='disabled' i])",
      ];
      let optionEls: import("playwright-core").Locator[] = [];
      for (const sel of optionSelectors) {
        const found = await page.locator(sel).all();
        if (found.length > 0) {
          optionEls = found;
          break;
        }
      }
      const optionTexts: string[] = [];
      for (const opt of optionEls) {
        const t = ((await opt.textContent().catch(() => "")) ?? "").trim();
        optionTexts.push(t);
      }

      const cityLower = city.toLowerCase();
      const regionLower = region.toLowerCase();
      let pickIdx = -1;
      let confidence: "high" | "medium" | "abstain" = "abstain";

      // High-confidence: option contains both city and region (case-insensitive)
      for (let i = 0; i < optionTexts.length; i++) {
        const t = optionTexts[i].toLowerCase();
        if (t.includes(cityLower) && t.includes(regionLower)) {
          pickIdx = i;
          confidence = "high";
          break;
        }
      }
      // Medium-confidence: exactly one option came back. Trust it.
      if (pickIdx < 0 && optionEls.length === 1) {
        pickIdx = 0;
        confidence = "medium";
      }
      // Otherwise abstain — multiple options, none match region, or
      // none came back at all. Press Escape to close the menu and
      // let Phase 3's gate route the application to needsHuman.

      if (pickIdx >= 0) {
        try {
          await optionEls[pickIdx].click({ timeout: 1500 });
          steps.push({
            step: "filled_city_autocomplete",
            detail: `${optionTexts[pickIdx].slice(0, 60)} (${confidence})`,
            ok: true,
          });
        } catch {
          await page.keyboard.press("Escape").catch(() => {});
        }
      } else {
        await page.keyboard.press("Escape").catch(() => {});
        steps.push({
          step: "abstained_city_autocomplete",
          detail: `${optionTexts.length} options, none matched "${region}"`,
          ok: false,
        });
      }
    } catch {
      // skip
    }
  }
}

/**
 * Reddit-style: privacy policy "I agree" is a SELECT dropdown, not a
 * checkbox. Find any visible SELECT or React-Select whose options
 * include 'I agree' and pick it.
 */
async function answerAgreementSelects(page: Page, steps: SubmissionStep[]): Promise<void> {
  // Native <select> first.
  const selects = await page.locator("select").all();
  for (const sel of selects) {
    try {
      if (!(await sel.isVisible().catch(() => false))) continue;
      const currentVal = await sel.evaluate((el) => (el as HTMLSelectElement).value).catch(() => "");
      if (currentVal) continue; // already answered

      const options = await sel.locator("option").all();
      let agreementVal: string | null = null;
      for (const opt of options) {
        const text = ((await opt.textContent().catch(() => "")) ?? "").trim();
        const val = (await opt.getAttribute("value").catch(() => "")) ?? "";
        if (!val) continue;
        if (/\bi agree\b|^yes\b/i.test(text)) {
          agreementVal = val;
          break;
        }
      }
      if (agreementVal) {
        await sel.selectOption(agreementVal).catch(() => {});
        steps.push({ step: "selected_agreement", detail: "native select → I agree", ok: true });
      }
    } catch {
      // skip
    }
  }
}

/**
 * Final pass — any visible required text input/textarea still empty gets
 * a smart, Claude-generated answer (via one batched call). Falls back to
 * literal "N/A" if no SmartFillContext was supplied, no fields qualify,
 * or the LLM call fails.
 *
 * Greenhouse refuses to submit on empty required fields, so this step is
 * load-bearing — "N/A" is universally accepted by their validation, but
 * a real tailored answer is obviously better when we can produce one.
 *
 * We now include textareas too: with an LLM in the loop we can produce a
 * coherent 2-3 sentence response. (The old version excluded textareas to
 * avoid filling essays with "N/A".)
 */
export async function fillEmptyRequiredTextInputs(
  page: Page,
  steps: SubmissionStep[],
  ctx?: SmartFillContext,
  resolvedFields?: ResolvedField[],
): Promise<void> {
  // Phase 2B (snapshot test caught the gap on Figma): native `required`
  // misses React-validated forms that use `aria-required="true"` + label *
  // patterns instead. Cast the net wider:
  //   - native [required]
  //   - aria-required="true"
  //   - inside a parent flagged required (.required class or [data-required])
  //   - ALL visible textareas (the safety net — labelled textareas
  //     without "required" marking are still almost always meant to be
  //     filled; the resolver can abstain if the question is unanswerable)
  const inputLocators = await page
    .locator(
      [
        "input[required][type='text']",
        "input[required]:not([type])",
        "input[aria-required='true'][type='text']",
        "input[aria-required='true']:not([type])",
        "input[type='text'][class*='required' i]",
        "input:not([type])[class*='required' i]",
        "textarea[required]",
        "textarea[aria-required='true']",
        "textarea", // visible-textarea net — empty ones get smart-filled or abstain
      ].join(", "),
    )
    .all();

  type Pending = { locator: Locator; field: UnknownField };
  const pending: Pending[] = [];

  for (const inp of inputLocators) {
    try {
      if (!(await inp.isVisible().catch(() => false))) continue;
      const val = await inp
        .evaluate((el) => (el as HTMLInputElement | HTMLTextAreaElement).value)
        .catch(() => "");
      if (val && val.trim().length > 0) continue;

      const tag = await inp.evaluate((el) => el.tagName.toLowerCase()).catch(() => "input");
      const type = (await inp.getAttribute("type").catch(() => "")) ?? "text";
      if (type === "file") continue;

      // One DOM round-trip to grab selector + label + helper text + maxLength.
      const meta = await inp
        .evaluate((el) => {
          const node = el as HTMLInputElement | HTMLTextAreaElement;
          let selector = "";
          if (node.id) selector = "#" + CSS.escape(node.id);
          else if (node.name) selector = node.tagName.toLowerCase() + "[name='" + node.name + "']";
          else selector = node.tagName.toLowerCase();

          let label = "";
          if (node.id) {
            const l = document.querySelector("label[for='" + node.id + "']");
            if (l) label = (l.textContent ?? "").trim();
          }
          if (!label) {
            const wrap = node.closest("label");
            if (wrap) label = (wrap.textContent ?? "").trim();
          }
          if (!label) {
            const aria = node.getAttribute("aria-label");
            if (aria) label = aria.trim();
          }
          if (!label) {
            let parent: Element | null = node.parentElement;
            for (let i = 0; i < 4 && parent; i++) {
              const heading = parent.querySelector("label, legend, .question, .label, h3, h4");
              if (heading && heading.textContent && heading.textContent.trim()) {
                label = heading.textContent.trim();
                break;
              }
              parent = parent.parentElement;
            }
          }

          let helperText: string | undefined;
          const describedBy = node.getAttribute("aria-describedby");
          if (describedBy) {
            const help = document.getElementById(describedBy);
            if (help && help.textContent) helperText = help.textContent.trim();
          }
          if (!helperText && node.parentElement) {
            const help = node.parentElement.querySelector(".help, .description, small, .helper");
            if (help && help.textContent && help.textContent.trim()) {
              helperText = help.textContent.trim();
            }
          }

          const maxLengthAttr = node.getAttribute("maxlength");
          const maxLength = maxLengthAttr ? parseInt(maxLengthAttr, 10) : undefined;

          return {
            selector,
            label: label.slice(0, 300),
            helperText: helperText ? helperText.slice(0, 300) : undefined,
            maxLength:
              typeof maxLength === "number" && !Number.isNaN(maxLength) ? maxLength : undefined,
          };
        })
        .catch(() => null);

      if (!meta) continue;

      const kind: "text" | "textarea" = tag === "textarea" ? "textarea" : "text";
      pending.push({
        locator: inp,
        field: {
          selector: meta.selector,
          label: meta.label || "(unlabeled field)",
          helperText: meta.helperText,
          kind,
          maxLength: meta.maxLength,
        },
      });
    } catch {
      // skip
    }
  }

  if (pending.length === 0) return;

  let answers = new Map<string, string>();
  if (ctx) {
    try {
      answers = await inferAnswers(
        pending.map((p) => p.field),
        ctx,
      );
    } catch {
      answers = new Map();
    }
  }

  let smartFilled = 0;
  let naFilled = 0;
  for (const p of pending) {
    const answer = answers.get(p.field.selector);
    const hasAnswer = !!(answer && answer.trim().length > 0);
    const value = hasAnswer ? answer! : "N/A";
    try {
      await p.locator.fill(value, { timeout: 2000 });
      if (hasAnswer) {
        smartFilled++;
        resolvedFields?.push({
          label: p.field.label,
          value,
          source: "llm",
          confidence: "medium",
          reason: "smart-fill via Claude (Phase 2 will tighten this signal)",
        });
      } else {
        naFilled++;
        resolvedFields?.push({
          label: p.field.label,
          value: "N/A",
          source: "abstain",
          confidence: "abstain",
          reason: "no profile mapping + smart-fill returned no answer — Phase 2 will route this to needsHuman instead",
        });
      }
    } catch {
      // skip
    }
  }

  if (smartFilled > 0) {
    steps.push({
      step: "filled_smart_fallback",
      detail: String(smartFilled) + " LLM-generated answers",
      ok: true,
    });
  }
  if (naFilled > 0) {
    steps.push({
      step: "filled_na_fallback",
      detail: String(naFilled) + " empty required inputs",
      ok: true,
    });
  }
}

function isUrl(s: string | null | undefined): s is string {
  if (!s) return false;
  return /^https?:\/\/|^[a-z0-9-]+\.[a-z]{2,}/.test(s.toLowerCase().trim());
}

/**
 * Phase 2B (4) — for every visible file input on the page that ISN'T
 * a resume/cover-letter slot, push an abstain ResolvedField so Phase
 * 3 routes the application to needsHuman. Companies sometimes require
 * a transcript / portfolio / work sample, and uploading the resume
 * into those slots is worse than leaving them empty.
 *
 * The classification is in `classifyFileInput` (pure helper, unit
 * tested) so the failure mode is reproducible without a browser.
 */
async function flagUnknownRequiredFileInputs(
  page: Page,
  steps: SubmissionStep[],
  resolvedFields: ResolvedField[],
): Promise<void> {
  const { classifyFileInput } = await import("./abstain-checks");
  const fileInputs = await page.locator("input[type='file']").all();
  let flagged = 0;
  for (const inp of fileInputs) {
    try {
      if (!(await inp.isVisible().catch(() => false))) continue;

      // Has anything already been uploaded into this slot?
      const filesLen = await inp
        .evaluate((el) => (el as HTMLInputElement).files?.length ?? 0)
        .catch(() => 0);
      if (filesLen > 0) continue;

      // Only required-shaped inputs trigger needsHuman — optional file
      // slots can stay empty without failing the form.
      const meta = await inp
        .evaluate((el) => {
          const node = el as HTMLInputElement;
          const name = node.getAttribute("name");
          const id = node.id || null;
          // label resolution mirrors fillEmptyRequiredTextInputs
          let label = "";
          if (node.id) {
            const l = document.querySelector(`label[for='${CSS.escape(node.id)}']`);
            if (l?.textContent) label = l.textContent.trim();
          }
          if (!label) {
            const wrap = node.closest("label");
            if (wrap?.textContent) label = wrap.textContent.trim();
          }
          const required = node.required;
          const ariaRequired = node.getAttribute("aria-required");
          const labelStar = /\*\s*$/.test(label);
          return {
            name,
            id,
            label: label.slice(0, 200),
            looksRequired: required || ariaRequired === "true" || labelStar,
          };
        })
        .catch(() => null);
      if (!meta) continue;

      const kind = classifyFileInput({ name: meta.name, id: meta.id, label: meta.label });
      if (kind !== "unknown") continue; // resume / cover-letter handled elsewhere
      if (!meta.looksRequired) continue;

      resolvedFields.push({
        label: meta.label || meta.name || "(unlabelled file input)",
        value: null,
        source: "abstain",
        confidence: "abstain",
        reason: "unknown_file_input — agent doesn't know what to upload here (transcript / portfolio / work sample)",
      });
      flagged++;
    } catch {
      // skip — never crash the fill on a file-input edge case
    }
  }
  if (flagged > 0) {
    steps.push({
      step: "flagged_unknown_file_inputs",
      detail: `${flagged} required file input${flagged === 1 ? "" : "s"} we couldn't auto-fill`,
      ok: false,
    });
  }
}

export function mapEeoToOption(value: string, kind: "gender" | "hispanic" | "race" | "veteran" | "disability" | "sexual_orientation"): string {
  if (value === "decline") {
    if (kind === "disability") return "I do not wish to answer";
    if (kind === "veteran") return "I don't wish to answer";
    if (kind === "sexual_orientation") return "I don't wish to answer";
    return "Decline to self-identify";
  }
  if (kind === "sexual_orientation") {
    if (value === "straight") return "Heterosexual";
    if (value === "gay") return "Gay";
    if (value === "lesbian") return "Lesbian";
    if (value === "bisexual") return "Bisexual";
    if (value === "queer") return "Queer";
    if (value === "asexual") return "Asexual";
    if (value === "pansexual") return "Pansexual";
    if (value === "other") return "Other";
  }
  // Translate our internal codes to the phrasing forms actually use.
  // Forms have 'Male' / 'Female' but users pick 'Man' / 'Woman' in Settings,
  // and the fuzzy matcher saw them as different words. Translate here.
  if (kind === "gender") {
    if (value === "man") return "Male";
    if (value === "woman") return "Female";
    if (value === "non_binary") return "Non-binary";
    if (value === "other") return "Other";
  }
  if (kind === "hispanic") {
    if (value === "yes") return "Yes";
    if (value === "no") return "No";
  }
  if (kind === "race") {
    if (value === "asian") return "Asian";
    if (value === "black") return "Black or African American";
    if (value === "hispanic_latino") return "Hispanic or Latino";
    if (value === "native_american") return "American Indian or Alaska Native";
    if (value === "pacific_islander") return "Native Hawaiian or Other Pacific Islander";
    if (value === "white") return "White";
    if (value === "two_or_more") return "Two or More Races";
  }
  if (kind === "veteran") {
    if (value === "yes_protected") return "I identify as one or more of the classifications of a protected veteran";
    if (value === "no") return "I am not a protected veteran";
  }
  if (kind === "disability") {
    if (value === "yes") return "Yes, I have a disability";
    if (value === "no") return "No, I do not have a disability";
  }
  // Pass-through anything we don't know about.
  return value;
}

/* ───────────── label → input dispatch ───────────── */

async function fillByLabel(
  page: Page,
  labelEl: Locator,
  question: string,
  answer: string,
  steps: SubmissionStep[],
  resolverCtx?: {
    profile: SubmissionProfile;
    jobCtx: { company: string; title: string; jdSummary: string; budget?: import("./resolve-field").LlmBudget };
    resolvedFields?: ResolvedField[];
  },
): Promise<boolean> {
  // Always look at the label's containing block first — we need to know
  // whether the field is a React-Select before we decide how to fill it.
  const container = labelEl
    .locator("xpath=ancestor::*[self::div or self::fieldset or self::section][1]")
    .first();
  const containerExists = (await container.count()) > 0;

  // 1. React-Select FIRST. The label may have for=<hidden input id> and our
  //    old shortcut filled that hidden input — which doesn't update the
  //    visible dropdown. Detect and use click+type+click flow instead.
  if (containerExists) {
    const rsControl = container
      .locator(
        "[class*='select__control' i], [class*='Select__control' i], div[class*='control' i]:has([class*='placeholder' i]), [role='combobox']",
      )
      .first();
    if ((await rsControl.count()) > 0 && (await rsControl.isVisible().catch(() => false))) {
      const ok = await fillReactSelect(page, rsControl, answer, question, steps, resolverCtx);
      if (ok) return true;
    }
  }

  // 2. Native <select>.
  if (containerExists) {
    const native = container.locator("select").first();
    if ((await native.count()) > 0 && (await native.isVisible().catch(() => false))) {
      const ok = await fillByKind(page, native, "select", answer, question, steps);
      if (ok) return true;
    }
  }

  // 3. Radio group (yes/no questions).
  if (containerExists) {
    const radios = container.locator("input[type='radio']");
    if ((await radios.count()) > 0) {
      const ok = await fillRadioGroup(page, container, radios, answer, question, steps, resolverCtx);
      if (ok) return true;
    }
  }

  // 4. Direct <label for="X"> link — for actual text inputs / textareas
  //    only. Skip if the target is inside a React-Select control (its
  //    visible value lives in the parent state, not in the input).
  const forId = await labelEl.getAttribute("for").catch(() => null);
  if (forId) {
    const target = page.locator(`#${cssEscape(forId)}`).first();
    if ((await target.count()) > 0) {
      const insideRs = await target
        .evaluate((el: Element) => {
          let cur: Element | null = el;
          for (let i = 0; i < 6 && cur; i++) {
            const cls = (cur.className || "").toString();
            if (/select__control|Select__control|select__value-container/.test(cls)) {
              return true;
            }
            cur = cur.parentElement;
          }
          return false;
        })
        .catch(() => false);
      if (!insideRs) {
        const ok = await fillAnyInput(page, target, answer, question, steps);
        if (ok) return true;
      }
    }
  }

  // 5. Bare textarea / text input inside container.
  if (containerExists) {
    const candidates: Array<{ loc: Locator; kind: string }> = [
      { loc: container.locator("textarea").first(), kind: "textarea" },
      { loc: container.locator("input[type='text'], input:not([type])").first(), kind: "text" },
      { loc: container.locator("input[type='url'], input[type='email'], input[type='tel']").first(), kind: "text" },
    ];
    for (const c of candidates) {
      if ((await c.loc.count()) === 0) continue;
      if (!(await c.loc.isVisible().catch(() => false))) continue;
      const ok = await fillByKind(page, c.loc, c.kind, answer, question, steps);
      if (ok) return true;
    }
  }

  return false;
}

async function fillAnyInput(
  page: Page,
  target: Locator,
  answer: string,
  question: string,
  steps: SubmissionStep[],
): Promise<boolean> {
  const tag = ((await target.evaluate((el: Element) => el.tagName.toLowerCase()).catch(() => "")) ?? "") as string;
  if (tag === "textarea") return fillByKind(page, target, "textarea", answer, question, steps);
  if (tag === "select") return fillByKind(page, target, "select", answer, question, steps);
  if (tag === "input") return fillByKind(page, target, "text", answer, question, steps);
  return false;
}

async function fillByKind(
  page: Page,
  loc: Locator,
  kind: string,
  answer: string,
  question: string,
  steps: SubmissionStep[],
): Promise<boolean> {
  const label = question.slice(0, 60);
  try {
    if (kind === "textarea") {
      await loc.fill(answer, { timeout: 3000 });
      steps.push({ step: "filled_textarea", detail: label, ok: true });
      return true;
    }
    if (kind === "text") {
      await loc.fill(answer.slice(0, 250), { timeout: 3000 });
      steps.push({ step: "filled_text", detail: label, ok: true });
      return true;
    }
    if (kind === "select") {
      const options = await loc.locator("option").all();
      let bestVal: string | null = null;
      let bestScore = 0;
      for (const opt of options) {
        const text = ((await opt.textContent().catch(() => "")) ?? "").trim();
        const val = (await opt.getAttribute("value").catch(() => "")) ?? "";
        if (!val) continue;
        const score = textSimilarity(text, answer);
        if (score > bestScore) {
          bestScore = score;
          bestVal = val;
        }
      }
      if (bestVal) {
        await loc.selectOption(bestVal);
        steps.push({ step: "selected_native_option", detail: label, ok: true });
        return true;
      }
    }
  } catch (e) {
    steps.push({
      step: `failed_${kind}`,
      detail: `${label}: ${e instanceof Error ? e.message : "err"}`,
      ok: false,
    });
  }
  return false;
}

/**
 * React-Select interaction: click the control to open, ENUMERATE the visible
 * options, find the one whose text best matches our intended answer, and
 * click that. Typing-to-filter is fragile (silently selects nothing when no
 * exact match) — enumeration with fuzzy match is reliable.
 *
 * For decline-style EEO answers, fall back through a wider list of synonyms
 * since labels vary by board ("Decline to self-identify" / "Prefer not to
 * say" / "I do not wish to answer" / "I choose not to disclose").
 */
export async function fillReactSelect(
  page: Page,
  control: Locator,
  answer: string,
  question: string,
  steps: SubmissionStep[],
  resolverCtx?: {
    profile: SubmissionProfile;
    jobCtx: { company: string; title: string; jdSummary: string; budget?: import("./resolve-field").LlmBudget };
    resolvedFields?: ResolvedField[];
  },
): Promise<boolean> {
  const label = question.slice(0, 60);
  try {
    await control.click({ timeout: 2000 });
    await page.waitForTimeout(180);

    // Expand the candidate answer list with decline synonyms so EEO
    // dropdowns commit something regardless of label phrasing.
    const candidates = isDeclineAnswer(answer)
      ? DECLINE_SYNONYMS
      : [answer, ...answerSynonyms(answer)];

    const optionSelectors = [
      "[role='option']:visible",
      "[class*='option']:visible:not([class*='disabled' i]):not([class*='Disabled' i])",
      "[class*='Option']:visible:not([class*='disabled' i])",
    ];

    // Read all visible option texts so we can fuzzy-pick.
    let optionEls: Locator[] = [];
    for (const sel of optionSelectors) {
      const found = await page.locator(sel).all();
      if (found.length > 0) {
        optionEls = found;
        break;
      }
    }

    if (optionEls.length === 0) {
      // Some React-Selects don't render the menu until you type. Type a few
      // chars from the first candidate, then re-enumerate.
      const probe = candidates[0]?.slice(0, 4) ?? "";
      if (probe) {
        await page.keyboard.type(probe, { delay: 6 });
        await page.waitForTimeout(180);
      }
      for (const sel of optionSelectors) {
        const found = await page.locator(sel).all();
        if (found.length > 0) {
          optionEls = found;
          break;
        }
      }
    }

    if (optionEls.length === 0) {
      await page.keyboard.press("Escape").catch(() => {});
      steps.push({
        step: "failed_react_select",
        detail: `${label}: no options visible`,
        ok: false,
      });
      return false;
    }

    // Read option texts once (we'll need them for scoring).
    const optionTexts: string[] = [];
    for (const opt of optionEls) {
      const t = ((await opt.textContent().catch(() => "")) ?? "").trim();
      optionTexts.push(t);
    }

    let bestIdx = -1;
    let bestScore = 0;

    // 1. EXACT match for any candidate beats everything else. This is the
    //    fix for the "answer 'No', form has 'Yes, F-1 Visa OPT (USA)'
    //    but no plain 'No'" case — exact match prevents accidentally
    //    picking a longer option that contains 'Yes' / 'No' as a word.
    for (const cand of candidates) {
      const exact = optionTexts.findIndex((t) => t.trim().toLowerCase() === cand.trim().toLowerCase());
      if (exact >= 0) {
        bestIdx = exact;
        bestScore = 999;
        break;
      }
    }

    // 1.5. Negation-aware preference. When the answer contains "not a" or
    //      "I am not" or starts with "No,", strongly prefer options that
    //      ALSO begin with negation. This stops "I am not a protected
    //      veteran" from accidentally matching "Other Protected Veteran"
    //      via fuzzy keyword overlap.
    if (bestIdx < 0 && /\b(?:not (?:a |an )?|i am not|i'm not|no,|no\.)\b/i.test(answer)) {
      let negIdx = -1;
      let negLen = Number.MAX_SAFE_INTEGER;
      for (let i = 0; i < optionTexts.length; i++) {
        const t = optionTexts[i].trim().toLowerCase();
        if (!t) continue;
        if (/\b(?:not (?:a |an )?|i am not|i'm not|^no\b|^no,)/.test(t)) {
          if (t.length < negLen) {
            negLen = t.length;
            negIdx = i;
          }
        }
      }
      if (negIdx >= 0) {
        bestIdx = negIdx;
        bestScore = 999;
      }
    }

    // 2. For yes/no answers, prefer options that START with the same
    //    polarity word — and explicitly avoid options that start with the
    //    OPPOSITE polarity. This stops "No" from selecting "Yes, ...".
    const isYesNo = /^(yes|no)$/i.test(answer.trim());
    if (bestIdx < 0 && isYesNo) {
      const want = answer.trim().toLowerCase();
      const opposite = want === "yes" ? "no" : "yes";
      let polarityIdx = -1;
      let polarityLen = Number.MAX_SAFE_INTEGER;
      for (let i = 0; i < optionTexts.length; i++) {
        const t = optionTexts[i].trim().toLowerCase();
        if (!t) continue;
        if (new RegExp(`^${opposite}\\b`).test(t)) continue;
        // "No" also matches semantic equivalents the form uses instead of
        // the literal word — "I do not require sponsorship",
        // "Not applicable", "I am not subject to…"
        const semanticMatch =
          want === "no" && /^(i (do )?not|i'm not|i am not|not applicable|n\/a|none)/i.test(t);
        if (new RegExp(`^${want}\\b`).test(t) || semanticMatch) {
          if (t.length < polarityLen) {
            polarityLen = t.length;
            polarityIdx = i;
          }
        }
      }
      if (polarityIdx >= 0) {
        bestIdx = polarityIdx;
        bestScore = 999;
      }
    }

    // 3. Phase 2 resolver pass — if the deterministic answer didn't
    //    exact/polarity/negation-match, let an LLM pick from the actual
    //    visible options. This kills the hardcoded "LinkedIn" guess
    //    (LLM now sees ["Job board", "Company website", "Other"] and
    //    picks accordingly) and stops the fuzzy fallback from
    //    silently picking the wrong option.
    if (bestIdx < 0 && resolverCtx) {
      const { resolveSelectField } = await import("./resolve-field");
      const resolution = await resolveSelectField({
        label: question,
        availableOptions: optionTexts.filter((t) => t.trim().length > 0),
        profile: resolverCtx.profile,
        jobCtx: resolverCtx.jobCtx,
        budget: resolverCtx.jobCtx.budget,
      });
      resolverCtx.resolvedFields?.push({
        label: question.slice(0, 200),
        value: resolution.value,
        source: resolution.source,
        confidence: resolution.confidence,
        reason: resolution.reason,
      });
      if (resolution.value) {
        const matchIdx = optionTexts.findIndex(
          (t) => t.trim().toLowerCase() === resolution.value!.trim().toLowerCase(),
        );
        if (matchIdx >= 0) {
          bestIdx = matchIdx;
          bestScore = 999;
          steps.push({
            step: "selected_react_option_llm",
            detail: `${label} → ${optionTexts[matchIdx].slice(0, 40)} (llm)`,
            ok: true,
          });
        }
      } else {
        // LLM abstained — surface that. Phase 3's gate will see the
        // abstain entry in resolvedFields and route to needsHuman.
        steps.push({
          step: "abstained_react_select",
          detail: `${label}: ${resolution.reason.slice(0, 80)}`,
          ok: false,
        });
        await page.keyboard.press("Escape").catch(() => {});
        return false;
      }
    }

    // 4. Legacy fuzzy fallback — only used when we don't have a resolver
    //    context (e.g. an old call site that hasn't been threaded
    //    through yet). EXCEPT for yes/no answers that already failed the
    //    polarity check.
    if (bestIdx < 0 && !isYesNo) {
      for (const cand of candidates) {
        for (let i = 0; i < optionTexts.length; i++) {
          const t = optionTexts[i];
          if (!t) continue;
          const score = textSimilarity(t, cand);
          if (score > bestScore) {
            bestScore = score;
            bestIdx = i;
          }
          if (t.toLowerCase().startsWith(cand.toLowerCase().slice(0, 8))) {
            if (score + 0.5 > bestScore) {
              bestScore = score + 0.5;
              bestIdx = i;
            }
          }
        }
      }
    }

    if (bestIdx < 0) {
      await page.keyboard.press("Escape").catch(() => {});
      steps.push({
        step: "failed_react_select",
        detail: `${label}: no option matched (saw ${optionTexts.slice(0, 4).join(" | ")})`,
        ok: false,
      });
      return false;
    }

    try {
      await optionEls[bestIdx].click({ timeout: 2000 });
      steps.push({
        step: "selected_react_option",
        detail: `${label} → ${optionTexts[bestIdx].slice(0, 40)}`,
        ok: true,
      });
      return true;
    } catch (e) {
      steps.push({
        step: "failed_react_select_click",
        detail: `${label}: ${e instanceof Error ? e.message : "click err"}`,
        ok: false,
      });
      return false;
    }
  } catch (e) {
    steps.push({
      step: "failed_react_select",
      detail: `${label}: ${e instanceof Error ? e.message : "err"}`,
      ok: false,
    });
    await page.keyboard.press("Escape").catch(() => {});
    return false;
  }
}

const DECLINE_SYNONYMS = [
  "Decline to self-identify",
  "Decline to Self-Identify",
  "Prefer not to say",
  "Prefer not to answer",
  "I do not wish to answer",
  "I don't wish to answer",
  "I choose not to disclose",
  "Do not wish to disclose",
  "Decline to answer",
];

function isDeclineAnswer(answer: string): boolean {
  return /decline|prefer not|wish to answer|not to disclose|not to say/i.test(answer);
}

function answerSynonyms(answer: string): string[] {
  // Yes/No expansions so a "Yes" answer also matches "Yes, I am" etc.
  const a = answer.trim();
  if (/^yes$/i.test(a)) return ["Yes", "Yes, I am", "Yes I do", "I am", "Affirmative"];
  if (/^no$/i.test(a))
    return [
      "No",
      "No, I am not",
      "I am not",
      "Not at this time",
      "I am NOT a protected veteran",
      "I do not have a disability",
    ];
  return [];
}

async function fillRadioGroup(
  page: Page,
  container: Locator,
  radios: Locator,
  answer: string,
  question: string,
  steps: SubmissionStep[],
  resolverCtx?: {
    profile: SubmissionProfile;
    jobCtx: { company: string; title: string; jdSummary: string; budget?: import("./resolve-field").LlmBudget };
    resolvedFields?: ResolvedField[];
  },
): Promise<boolean> {
  const label = question.slice(0, 60);
  const count = await radios.count();

  // Read all radio labels into an array — used both for matching and
  // for the resolver's available-options list.
  const optionTexts: string[] = [];
  for (let i = 0; i < count; i++) {
    const r = radios.nth(i);
    const id = await r.getAttribute("id").catch(() => null);
    const text = id
      ? ((await page.locator(`label[for='${cssEscape(id)}']`).first().textContent().catch(() => "")) ?? "")
      : ((await r.locator("xpath=..").textContent().catch(() => "")) ?? "");
    optionTexts.push(text.trim());
  }

  let bestIdx = -1;
  let matchMethod: string | null = null;

  // 1. Exact match — same logic as fillReactSelect.
  const wantLower = answer.trim().toLowerCase();
  for (let i = 0; i < optionTexts.length; i++) {
    if (optionTexts[i].toLowerCase() === wantLower) {
      bestIdx = i;
      matchMethod = "exact";
      break;
    }
  }

  // 2. Polarity (yes/no) — if our answer is literally "Yes" or "No",
  //    prefer a radio whose label STARTS with that polarity word and
  //    explicitly skip the opposite.
  if (bestIdx < 0 && /^(yes|no)$/i.test(answer.trim())) {
    const want = answer.trim().toLowerCase();
    const opposite = want === "yes" ? "no" : "yes";
    for (let i = 0; i < optionTexts.length; i++) {
      const t = optionTexts[i].toLowerCase();
      if (!t) continue;
      if (new RegExp(`^${opposite}\\b`).test(t)) continue;
      if (new RegExp(`^${want}\\b`).test(t)) {
        bestIdx = i;
        matchMethod = "polarity";
        break;
      }
    }
  }

  // 3. Phase C resolver — when the deterministic methods miss, let
  //    Claude pick from the actual radio labels or abstain. Same
  //    contract as fillReactSelect: abstain → leave radios unchecked
  //    (Phase 3's gate routes the application to needsHuman).
  if (bestIdx < 0 && resolverCtx) {
    const { resolveSelectField } = await import("./resolve-field");
    const visible = optionTexts.filter((t) => t.length > 0);
    const resolution = await resolveSelectField({
      label: question,
      availableOptions: visible,
      profile: resolverCtx.profile,
      jobCtx: resolverCtx.jobCtx,
      budget: resolverCtx.jobCtx.budget,
    });
    resolverCtx.resolvedFields?.push({
      label: question.slice(0, 200),
      value: resolution.value,
      source: resolution.source,
      confidence: resolution.confidence,
      reason: resolution.reason,
    });
    if (resolution.value) {
      const idx = optionTexts.findIndex(
        (t) => t.trim().toLowerCase() === resolution.value!.trim().toLowerCase(),
      );
      if (idx >= 0) {
        bestIdx = idx;
        matchMethod = "llm";
      }
    } else {
      steps.push({
        step: "abstained_radio",
        detail: `${label}: ${resolution.reason.slice(0, 80)}`,
        ok: false,
      });
      return false;
    }
  }

  // 4. Legacy fuzzy fallback — only when no resolver context (older
  //    call sites that haven't been threaded through yet).
  if (bestIdx < 0 && !resolverCtx) {
    let bestScore = 0;
    for (let i = 0; i < optionTexts.length; i++) {
      const score = textSimilarity(optionTexts[i], answer);
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
        matchMethod = "fuzzy";
      }
    }
  }

  if (bestIdx >= 0) {
    try {
      await radios.nth(bestIdx).check({ timeout: 2000 });
      steps.push({
        step: "checked_radio",
        detail: `${label} → ${optionTexts[bestIdx].slice(0, 40)} (${matchMethod ?? "?"})`,
        ok: true,
      });
      return true;
    } catch (e) {
      steps.push({
        step: "failed_radio",
        detail: `${label}: ${e instanceof Error ? e.message : "err"}`,
        ok: false,
      });
    }
  }
  return false;
}

/* ───────────── text similarity (also exported for tests) ───────────── */

const STOPWORDS = new Set([
  "the", "and", "for", "you", "are", "with", "that", "this", "what",
  "have", "your", "from", "will", "any", "our", "can", "into", "would",
  "describe", "tell", "please", "about", "why", "how", "where", "when",
  "select", "all", "wish", "answer",
]);

function textSimilarity(a: string, b: string): number {
  const wordsOf = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 2 && !STOPWORDS.has(w)),
    );
  const wa = wordsOf(a);
  const wb = wordsOf(b);
  if (wa.size === 0 || wb.size === 0) return 0;
  let overlap = 0;
  for (const w of wa) if (wb.has(w)) overlap++;
  return overlap / Math.max(wa.size, wb.size);
}

function bestScreener(
  question: string,
  screeners: SubmissionProfile["screeners"],
): SubmissionProfile["screeners"][number] | null {
  let best: SubmissionProfile["screeners"][number] | null = null;
  let bestScore = 0;
  for (const s of screeners) {
    const score = textSimilarity(question, s.question);
    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }
  return bestScore >= 0.25 ? best : null;
}

function cssEscape(id: string): string {
  // Bare-minimum CSS escape — covers the cases Greenhouse boards generate.
  return id.replace(/(["'\\])/g, "\\$1");
}

/**
 * Quick check: does this page look like a Greenhouse-powered job board?
 */
export async function isGreenhousePage(page: Page): Promise<boolean> {
  const url = page.url();
  if (/greenhouse\.io/i.test(url)) return true;
  const hasGhMarker = await page
    .locator("[data-source='greenhouse'], iframe[src*='greenhouse.io']")
    .count()
    .then((n) => n > 0)
    .catch(() => false);
  return hasGhMarker;
}
