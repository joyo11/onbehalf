import type { Locator, Page } from "playwright-core";
import { renderCoverLetterPdf } from "./cover-letter-pdf";
import type { SubmissionProfile, SubmissionStep } from "./types";

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
): Promise<{ steps: SubmissionStep[]; submitButton: { selector: string } | null }> {
  const steps: SubmissionStep[] = [];

  // ── Basic identity ────────────────────────────────────────
  await tryFill(page, ["#first_name", "input[name='first_name']", "input[id*='first_name']"], profile.firstName, "first_name", steps);
  await tryFill(page, ["#last_name", "input[name='last_name']", "input[id*='last_name']"], profile.lastName, "last_name", steps);
  await tryFill(page, ["#email", "input[type='email']", "input[name='email']"], profile.email, "email", steps);
  if (profile.phone) {
    await tryFill(page, ["#phone", "input[type='tel']", "input[name='phone']"], profile.phone, "phone", steps);
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
  await fillAllLabelledFields(page, profile, steps);

  // Auto-check any "I agree / I acknowledge / I consent" submission checkboxes
  // that sit near the submit button. These are always boilerplate legal
  // acknowledgments — leaving them unchecked is the #1 reason a form
  // validates to fail at the very last step.
  await checkAcknowledgmentBoxes(page, steps);

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
): Promise<void> {
  // Build a snapshot of every visible label on the page. We do this once
  // and then iterate, because filling some fields may re-render others.
  const labelEls = await page.locator("label:visible, legend:visible").all();
  const seen = new Set<string>();

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
    if (!question || seen.has(question)) continue;
    seen.add(question);

    if (isBasicField(question)) continue;

    const answer = answerForQuestion(question, profile);
    if (answer == null) continue;

    try {
      const ok = await fillByLabel(page, labelEl, question, answer, steps);
      if (!ok) {
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
  // EEO
  {
    match: /^gender$|gender identity/i,
    get: (p) => mapEeoToOption(p.eeoGender, "gender"),
  },
  {
    match: /hispanic|latino|latin[oa]/i,
    get: (p) => mapEeoToOption(p.eeoHispanicLatino, "hispanic"),
  },
  {
    match: /race|ethnicity/i,
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

function isUrl(s: string | null | undefined): s is string {
  if (!s) return false;
  return /^https?:\/\/|^[a-z0-9-]+\.[a-z]{2,}/.test(s.toLowerCase().trim());
}

function mapEeoToOption(value: string, kind: "gender" | "hispanic" | "race" | "veteran" | "disability"): string {
  if (value === "decline") {
    if (kind === "disability") return "I do not wish to answer";
    if (kind === "veteran") return "I don't wish to answer";
    return "Decline to self-identify";
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
      const ok = await fillReactSelect(page, rsControl, answer, question, steps);
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
      const ok = await fillRadioGroup(page, container, radios, answer, question, steps);
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
async function fillReactSelect(
  page: Page,
  control: Locator,
  answer: string,
  question: string,
  steps: SubmissionStep[],
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

    // 3. Fall back to fuzzy keyword overlap + prefix bonus — EXCEPT for
    //    yes/no answers that already failed the polarity check. If we
    //    wanted "No" but the form has only "Yes, …" variants and no
    //    "No"/"Not"/"None" option, leave the dropdown blank rather than
    //    silently picking a Yes. The form may reject for missing field
    //    but at least we're honest about the answer.
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
): Promise<boolean> {
  const label = question.slice(0, 60);
  const count = await radios.count();
  let bestIdx = -1;
  let bestScore = 0;
  for (let i = 0; i < count; i++) {
    const r = radios.nth(i);
    const id = await r.getAttribute("id").catch(() => null);
    const text = id
      ? ((await page.locator(`label[for='${cssEscape(id)}']`).first().textContent().catch(() => "")) ?? "")
      : ((await r.locator("xpath=..").textContent().catch(() => "")) ?? "");
    const score = textSimilarity(text, answer);
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  if (bestIdx >= 0) {
    try {
      await radios.nth(bestIdx).check({ timeout: 2000 });
      steps.push({ step: "checked_radio", detail: label, ok: true });
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
