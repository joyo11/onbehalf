import type { Locator, Page } from "playwright-core";
import { fillEmptyRequiredTextInputs, mapEeoToOption } from "./greenhouse";
import type { SmartFillContext } from "./smart-fill";
import type { SubmissionProfile, SubmissionStep } from "./types";

/**
 * Fill a Lever-hosted application form (jobs.lever.co/{company}/{job-id}/apply).
 *
 * Lever's form anatomy is simpler than Greenhouse:
 *   - Top-of-form identity: input[name='name'|'email'|'phone'|'org']
 *   - Social URLs: input[name='urls[LinkedIn]'|'urls[GitHub]'|'urls[Portfolio]']
 *   - Resume: input[type='file'][name='resume']
 *   - Cover letter / additional info: textarea[name='comments']
 *   - Custom questions: .application-question with .text label + inputs below
 *   - EEO: select[name*='eeo'] native selects at the bottom
 *
 * Mirrors fillGreenhouseForm: fills the form, returns steps, lets the caller
 * decide whether to click submit (so the orchestrator can do CAPTCHA detection).
 */
export async function fillLeverForm(
  page: Page,
  profile: SubmissionProfile,
  job?: { company: string; title: string; jdSummary: string },
): Promise<{ steps: SubmissionStep[]; submitButton: { selector: string } | null }> {
  const llmCtx: SmartFillContext | undefined = job ? { profile, job } : undefined;
  const steps: SubmissionStep[] = [];

  // ── Basic identity ────────────────────────────────────────
  // Lever uses a single full-name field instead of first/last.
  const fullName = profile.fullName || `${profile.firstName} ${profile.lastName}`.trim();
  await tryFill(page, ["input[name='name']", "input[id='name']", "input[name*='full' i][name*='name' i]"], fullName, "name", steps);
  await tryFill(page, ["input[name='email']", "input[type='email']", "input[id='email']"], profile.email, "email", steps);
  if (profile.phone) {
    await tryFill(page, ["input[name='phone']", "input[type='tel']", "input[id='phone']"], profile.phone, "phone", steps);
  }
  if (profile.currentCompany) {
    await tryFill(page, ["input[name='org']", "input[id='org']", "input[name*='company' i]"], profile.currentCompany, "current_company", steps);
  }
  if (profile.location) {
    // Lever sometimes has a free-text location field — fill it if present.
    await tryFill(
      page,
      ["input[name='location']", "input[id='location']", "input[name*='location' i]:not([type='hidden'])"],
      profile.location,
      "location",
      steps,
    );
  }

  // ── Social URLs ───────────────────────────────────────────
  if (profile.linkedinUrl && isUrl(profile.linkedinUrl)) {
    await tryFill(
      page,
      ["input[name='urls[LinkedIn]']", "input[name*='linkedin' i]", "input[id*='linkedin' i]"],
      profile.linkedinUrl,
      "linkedin_url",
      steps,
    );
  }
  if (profile.githubUrl && isUrl(profile.githubUrl)) {
    await tryFill(
      page,
      ["input[name='urls[GitHub]']", "input[name*='github' i]", "input[id*='github' i]"],
      profile.githubUrl,
      "github_url",
      steps,
    );
  }
  if (profile.portfolioUrl && isUrl(profile.portfolioUrl)) {
    await tryFill(
      page,
      [
        "input[name='urls[Portfolio]']",
        "input[name='urls[Other]']",
        "input[name*='portfolio' i]",
        "input[name*='website' i]",
        "input[id*='portfolio' i]",
      ],
      profile.portfolioUrl,
      "portfolio_url",
      steps,
    );
  }

  // ── Resume upload ─────────────────────────────────────────
  if (profile.resumePdfBytes) {
    await uploadFile(
      page,
      [
        "input[type='file'][name='resume']",
        "input[type='file'][name*='resume' i]",
        "input[type='file'][id*='resume' i]",
      ],
      profile.resumePdfBytes,
      profile.resumeFileName,
      "uploaded_resume",
      steps,
    );
  }

  // ── Cover letter / "Additional information" textarea ──────
  // Lever boards almost always use textarea[name='comments'] for the
  // free-form "anything else?" box. There's no dedicated cover-letter
  // file input on standard boards, so we paste the rendered cover-letter
  // text in here.
  if (profile.coverLetter) {
    await tryFill(
      page,
      [
        "textarea[name='comments']",
        "textarea[id='comments']",
        "textarea[name*='comment' i]",
        "textarea[placeholder*='additional' i]",
        "textarea[placeholder*='anything else' i]",
      ],
      profile.coverLetter,
      "cover_letter_comments",
      steps,
    );
  }

  // ── Custom questions (.application-question blocks) ───────
  await page.waitForTimeout(300);
  await fillCustomQuestions(page, profile, steps);

  // ── EEO native selects ────────────────────────────────────
  await fillLeverEeo(page, profile, steps);

  // ── Acknowledgment checkboxes near submit ─────────────────
  await checkAcknowledgmentBoxes(page, steps);

  // ── N/A fallback for any required text input still empty ──
  await fillEmptyRequiredTextInputs(page, steps, llmCtx);

  // ── Submit button (caller decides whether to click) ───────
  await page.waitForTimeout(200);
  const submitSelectors = [
    "button[type='submit']:visible",
    "input[type='submit']:visible",
    "button:has-text('Submit application'):visible",
    "button:has-text('Submit Application'):visible",
    "button:has-text('Submit'):visible",
    "[role='button']:has-text('Submit application'):visible",
    "[role='button']:has-text('Submit'):visible",
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
 * Iterate every .application-question block. Each block has a .text node
 * with the question and one or more inputs/selects/radios/textareas below.
 * Dispatch to the right fill based on input type.
 */
async function fillCustomQuestions(
  page: Page,
  profile: SubmissionProfile,
  steps: SubmissionStep[],
): Promise<void> {
  // Standard Lever wrapper: ul.application-additional > li.application-question
  // Newer boards sometimes use div.application-question. Cover both.
  const questionBlocks = await page
    .locator("li.application-question, div.application-question, .application-question")
    .all();

  const seen = new Set<string>();
  for (const block of questionBlocks) {
    let question = "";
    try {
      // The question text lives in .text (or .application-label .text).
      // Fall back to the first label/span in the block.
      const textNode = block.locator(".text, .application-label, label").first();
      if ((await textNode.count()) > 0) {
        question = ((await textNode.textContent({ timeout: 1000 })) ?? "")
          .replace(/\*$/g, "")
          .replace(/\(required\)/gi, "")
          .replace(/\(optional\)/gi, "")
          .replace(/\s+/g, " ")
          .trim();
      }
    } catch {
      continue;
    }
    if (!question || seen.has(question)) continue;
    seen.add(question);

    const answer = answerForQuestion(question, profile);
    if (answer == null) continue;

    try {
      const ok = await fillQuestionBlock(page, block, question, answer, steps);
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

/**
 * Dispatch a single question block to the right fill strategy based on
 * the input type present inside it.
 */
async function fillQuestionBlock(
  page: Page,
  block: Locator,
  question: string,
  answer: string,
  steps: SubmissionStep[],
): Promise<boolean> {
  const label = question.slice(0, 60);

  // 1. Radio group (yes/no)
  const radios = block.locator("input[type='radio']");
  if ((await radios.count()) > 0) {
    const ok = await fillRadioGroup(page, block, radios, answer, question, steps);
    if (ok) return true;
  }

  // 2. Checkbox group — pick the checkbox whose label best matches the answer.
  //    Skip if there's only one checkbox (that's an acknowledgment, handled
  //    elsewhere) and the answer doesn't look like a yes.
  const checkboxes = block.locator("input[type='checkbox']");
  const cbCount = await checkboxes.count();
  if (cbCount > 1) {
    const ok = await fillCheckboxGroup(page, block, checkboxes, answer, question, steps);
    if (ok) return true;
  }

  // 3. Native select
  const select = block.locator("select").first();
  if ((await select.count()) > 0 && (await select.isVisible().catch(() => false))) {
    const ok = await fillNativeSelect(select, answer, label, steps);
    if (ok) return true;
  }

  // 4. Textarea
  const textarea = block.locator("textarea").first();
  if ((await textarea.count()) > 0 && (await textarea.isVisible().catch(() => false))) {
    try {
      await textarea.fill(answer, { timeout: 3000 });
      steps.push({ step: "filled_textarea", detail: label, ok: true });
      return true;
    } catch (e) {
      steps.push({
        step: "failed_textarea",
        detail: `${label}: ${e instanceof Error ? e.message : "err"}`,
        ok: false,
      });
    }
  }

  // 5. Text input
  const textInput = block
    .locator("input[type='text'], input[type='url'], input[type='email'], input[type='tel'], input:not([type])")
    .first();
  if ((await textInput.count()) > 0 && (await textInput.isVisible().catch(() => false))) {
    try {
      await textInput.fill(answer.slice(0, 250), { timeout: 3000 });
      steps.push({ step: "filled_text", detail: label, ok: true });
      return true;
    } catch (e) {
      steps.push({
        step: "failed_text",
        detail: `${label}: ${e instanceof Error ? e.message : "err"}`,
        ok: false,
      });
    }
  }

  return false;
}

async function fillNativeSelect(
  select: Locator,
  answer: string,
  label: string,
  steps: SubmissionStep[],
): Promise<boolean> {
  try {
    const options = await select.locator("option").all();
    let bestVal: string | null = null;
    let bestScore = 0;
    let exactVal: string | null = null;
    for (const opt of options) {
      const text = ((await opt.textContent().catch(() => "")) ?? "").trim();
      const val = (await opt.getAttribute("value").catch(() => "")) ?? "";
      if (!val) continue;
      if (text.trim().toLowerCase() === answer.trim().toLowerCase()) {
        exactVal = val;
        break;
      }
      const score = textSimilarity(text, answer);
      if (score > bestScore) {
        bestScore = score;
        bestVal = val;
      }
    }
    const choose = exactVal ?? bestVal;
    if (choose) {
      await select.selectOption(choose);
      steps.push({ step: "selected_native_option", detail: label, ok: true });
      return true;
    }
  } catch (e) {
    steps.push({
      step: "failed_select",
      detail: `${label}: ${e instanceof Error ? e.message : "err"}`,
      ok: false,
    });
  }
  return false;
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

  // Yes/No special case: prefer exact polarity match.
  const isYesNo = /^(yes|no)$/i.test(answer.trim());
  if (isYesNo) {
    const want = answer.trim().toLowerCase();
    for (let i = 0; i < count; i++) {
      const r = radios.nth(i);
      const id = await r.getAttribute("id").catch(() => null);
      const value = (await r.getAttribute("value").catch(() => "")) ?? "";
      const text = id
        ? ((await page.locator(`label[for='${cssEscape(id)}']`).first().textContent().catch(() => "")) ?? "")
        : ((await r.locator("xpath=..").textContent().catch(() => "")) ?? "");
      const norm = (text || value).trim().toLowerCase();
      if (norm === want || norm.startsWith(want)) {
        bestIdx = i;
        bestScore = 999;
        break;
      }
    }
  }

  if (bestIdx < 0) {
    for (let i = 0; i < count; i++) {
      const r = radios.nth(i);
      const id = await r.getAttribute("id").catch(() => null);
      const value = (await r.getAttribute("value").catch(() => "")) ?? "";
      const text = id
        ? ((await page.locator(`label[for='${cssEscape(id)}']`).first().textContent().catch(() => "")) ?? "")
        : ((await r.locator("xpath=..").textContent().catch(() => "")) ?? "");
      const score = Math.max(textSimilarity(text, answer), textSimilarity(value, answer));
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
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

async function fillCheckboxGroup(
  page: Page,
  _container: Locator,
  checkboxes: Locator,
  answer: string,
  question: string,
  steps: SubmissionStep[],
): Promise<boolean> {
  const label = question.slice(0, 60);
  const count = await checkboxes.count();
  let bestIdx = -1;
  let bestScore = 0;
  for (let i = 0; i < count; i++) {
    const cb = checkboxes.nth(i);
    const id = await cb.getAttribute("id").catch(() => null);
    const text = id
      ? ((await page.locator(`label[for='${cssEscape(id)}']`).first().textContent().catch(() => "")) ?? "")
      : ((await cb.locator("xpath=..").textContent().catch(() => "")) ?? "");
    const score = textSimilarity(text, answer);
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  if (bestIdx >= 0 && bestScore > 0) {
    try {
      await checkboxes.nth(bestIdx).check({ timeout: 2000 });
      steps.push({ step: "checked_checkbox", detail: label, ok: true });
      return true;
    } catch (e) {
      steps.push({
        step: "failed_checkbox_group",
        detail: `${label}: ${e instanceof Error ? e.message : "err"}`,
        ok: false,
      });
    }
  }
  return false;
}

/**
 * Lever EEO is a series of native <select> elements with name attributes like
 * 'eeoGender', 'eeoRace', 'eeoVeteran', 'eeoDisability'. Each has a native
 * option list. We map our internal codes to the canonical option label via
 * mapEeoToOption (shared with Greenhouse), then fuzzy-match against the
 * actual option text in the dropdown.
 */
async function fillLeverEeo(
  page: Page,
  profile: SubmissionProfile,
  steps: SubmissionStep[],
): Promise<void> {
  const eeoSelects = await page.locator("select[name*='eeo' i], select[id*='eeo' i]").all();
  for (const sel of eeoSelects) {
    try {
      if (!(await sel.isVisible().catch(() => false))) continue;
      const name = ((await sel.getAttribute("name").catch(() => "")) ?? "").toLowerCase();
      const id = ((await sel.getAttribute("id").catch(() => "")) ?? "").toLowerCase();
      const key = `${name} ${id}`;

      let answer: string | null = null;
      if (/gender/.test(key)) {
        answer = mapEeoToOption(profile.eeoGender, "gender");
      } else if (/sexual|orientation/.test(key)) {
        answer = mapEeoToOption(profile.eeoSexualOrientation, "sexual_orientation");
      } else if (/hispanic|latino/.test(key)) {
        answer = mapEeoToOption(profile.eeoHispanicLatino, "hispanic");
      } else if (/race|ethnic/.test(key)) {
        answer = mapEeoToOption(profile.eeoRaceEthnicity, "race");
      } else if (/veteran/.test(key)) {
        answer = mapEeoToOption(profile.eeoVeteranStatus, "veteran");
      } else if (/disability/.test(key)) {
        answer = mapEeoToOption(profile.eeoDisabilityStatus, "disability");
      }
      if (!answer) continue;

      const ok = await fillNativeSelect(sel, answer, `eeo:${key.trim().slice(0, 30)}`, steps);
      if (!ok) {
        steps.push({
          step: "skipped_eeo",
          detail: `${key.trim().slice(0, 30)} → ${answer.slice(0, 30)}`,
          ok: false,
        });
      }
    } catch {
      // skip
    }
  }
}

/**
 * Mirror of Greenhouse's checkAcknowledgmentBoxes — Lever boards also
 * occasionally render a "I agree to the terms" / "I consent to processing"
 * checkbox just above the submit button. Skip marketing opt-ins.
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

      if (/marketing|newsletter|promotional|subscribe|updates from|future opportunit/i.test(labelText)) {
        steps.push({ step: "skipped_marketing_checkbox", detail: labelText.slice(0, 60), ok: true });
        continue;
      }

      // Only check things that LOOK like acknowledgments. Avoid auto-checking
      // standalone "I have a disability" / "I am a veteran" boxes that aren't
      // covered by EEO selects on the form.
      if (!/agree|acknowledge|consent|understand|certif|confirm|accept|policy|terms|privacy/i.test(labelText)) {
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
  {
    match: /preferred name|name you.*prefer/i,
    get: (p) => p.preferredName ?? p.firstName,
  },
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
  // Work authorization long-form
  {
    match: /authori[sz]ation to work|describe your work authori|status with respect to (?:your )?work/i,
    get: (p) => {
      if (p.workAuthorization === "us_citizen_pr") return "nationality";
      if (p.workAuthorization === "needs_sponsorship" || p.needsSponsorship) return "needs to be sponsored";
      return "do not need a company to sponsor";
    },
  },
  // Currently authorized
  {
    match: /currently authori[sz]ed to work|legally authori[sz]ed to work|presently authori[sz]ed|authori[sz]ed to work in (?:the )?(?:US|U\.S\.|United States)/i,
    get: (p) => (p.currentlyAuthorizedUS ? "Yes" : "No"),
  },
  // Visa / sponsorship
  {
    match: /sponsor|visa|require visa/i,
    get: (p) => (p.needsSponsorship ? "Yes" : "No"),
  },
  // Employment agreements
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
  // Current company / job title
  {
    match: /current (?:or most recent )?(?:company|employer)|most recent company/i,
    get: (p) => p.currentCompany ?? "Independent",
  },
  {
    match: /current (?:or most recent )?(?:job title|role|position)|most recent title/i,
    get: (p) => p.currentJobTitle ?? "Software Engineer",
  },
  // How did you hear
  {
    match: /how did you (?:first )?hear|where did you (?:first )?hear|how (?:did you|do you) find (?:out about )?(?:this|the) (?:role|job|position|opportunity)|how (?:did you |do you )?learn about/i,
    get: () => "LinkedIn",
  },
  // Agreement
  {
    match: /\bi agree\b|privacy (?:policy|notice).*(?:agree|accept|consent)|consent to (?:the |our )?(?:privacy|terms)/i,
    get: () => "I agree",
  },
  // EEO (rare in custom-question form on Lever — EEO usually lives in its
  // own select bank — but keep these mappings as a fallback).
  {
    match: /^gender$|gender identity/i,
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
  const s = bestScreener(question, profile.screeners);
  if (s) return s.answer;

  const q = question.toLowerCase();
  const looksLikeQualifier =
    /^(do you|are you|can you|have you|will you).*(have|use|know|familiar|experience|proficien|fluent|comfort|able)\b/.test(q) ||
    /^(do you have|are you)\b.{0,40}(experience|proficien|fluent|familiar|comfort|able)/.test(q);
  if (looksLikeQualifier) {
    return "Yes";
  }
  return null;
}

/* ───────────── text similarity ───────────── */

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

function isUrl(s: string | null | undefined): s is string {
  if (!s) return false;
  return /^https?:\/\/|^[a-z0-9-]+\.[a-z]{2,}/.test(s.toLowerCase().trim());
}

function cssEscape(id: string): string {
  return id.replace(/(["'\\])/g, "\\$1");
}

/**
 * Quick check: does this page look like a Lever-hosted application?
 *   - URL contains lever.co (jobs.lever.co/{company}/{id}/apply)
 *   - OR the page has the signature input[name='resume'] + input[name='name']
 *     combo that's near-unique to Lever's apply forms.
 */
export async function isLeverPage(page: Page): Promise<boolean> {
  const url = page.url();
  if (/lever\.co/i.test(url)) return true;
  const hasLeverMarkers = await page
    .locator(
      "input[name='urls[LinkedIn]'], input[name='urls[GitHub]'], textarea[name='comments'], .application-question",
    )
    .count()
    .then((n) => n > 0)
    .catch(() => false);
  if (hasLeverMarkers) return true;
  // Combo: name + resume + email on a single form is a strong signal too.
  const combo = await page
    .locator("input[name='name']")
    .count()
    .then(async (n) => {
      if (n === 0) return false;
      const r = await page.locator("input[type='file'][name='resume']").count();
      return r > 0;
    })
    .catch(() => false);
  return combo;
}
