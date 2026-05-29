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
  await page.waitForTimeout(1000); // let everything finish rendering
  await fillAllLabelledFields(page, profile, steps);

  // ── Submit button ─────────────────────────────────────────
  await page.waitForTimeout(500);
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
  // Locate the Cover Letter section so we don't accidentally fill resume
  // inputs etc. Greenhouse renders a label/heading then the controls.
  const section = await findSectionByLabel(page, /cover letter/i);

  // (a) Attach PDF
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
 * Find the container that holds a section identified by its heading/label.
 * Returns the nearest ancestor (form section or fieldset) so locators
 * scoped to it only see fields belonging to that section.
 */
async function findSectionByLabel(page: Page, pattern: RegExp): Promise<Locator | null> {
  const candidates = await page
    .locator("label, legend, h2, h3, h4, [class*='label' i]")
    .all();
  for (const c of candidates) {
    const text = ((await c.textContent().catch(() => "")) ?? "").trim();
    if (!pattern.test(text)) continue;
    // Walk up to a sensible container — fieldset, form-section div, or
    // the immediate parent if nothing nicer.
    const handle = await c.elementHandle();
    if (!handle) continue;
    const containerHandle = await handle.evaluateHandle((el: Element) => {
      let cur: Element | null = el;
      for (let i = 0; i < 5 && cur; i++) {
        const parentEl: Element | null = cur.parentElement;
        if (!parentEl) break;
        cur = parentEl;
        if (
          cur.tagName === "FIELDSET" ||
          /(question|field|section|application-question|cover)/i.test(cur.className || "")
        ) {
          return cur;
        }
      }
      return el.parentElement;
    });
    if (containerHandle) {
      const el = containerHandle.asElement();
      if (el) {
        // Wrap as Locator by attribute (best-effort: take its data-attr or first child path).
        // pw doesn't expose ElementHandle→Locator directly; create a locator scoped to it.
        // Simplest: return a locator that uses :has(label:has-text(...))
        return page.locator(`*:has(> label:has-text(${JSON.stringify(text)})), fieldset:has(legend:has-text(${JSON.stringify(text)}))`).first();
      }
    }
  }
  return null;
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
  // LinkedIn / GitHub / portfolio (some forms have these as labelled fields)
  {
    match: /linkedin/i,
    get: (p) => p.linkedinUrl,
  },
  {
    match: /github/i,
    get: (p) => p.githubUrl,
  },
  {
    match: /website|portfolio|personal site/i,
    get: (p) => p.portfolioUrl ?? p.githubUrl,
  },
  // Visa / sponsorship
  {
    match: /sponsor|visa|work authorization|authori[sz]ed to work/i,
    get: (p) => (p.needsSponsorship ? "Yes" : "No"),
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
  return s?.answer ?? null;
}

function mapEeoToOption(value: string, kind: "gender" | "hispanic" | "race" | "veteran" | "disability"): string {
  if (value === "decline") {
    // The exact label varies by board; we'll match against options later
    // via fuzzy text similarity. Return the most common phrasing.
    if (kind === "disability") return "I do not wish to answer";
    if (kind === "veteran") return "I don't wish to answer";
    return "Decline to self-identify";
  }
  // Pass-through user-chosen value (e.g. "Female", "Yes, I have a disability")
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
  // 1. Direct <label for="X"> link.
  const forId = await labelEl.getAttribute("for").catch(() => null);
  if (forId) {
    const target = page.locator(`#${cssEscape(forId)}`).first();
    if ((await target.count()) > 0) {
      const ok = await fillAnyInput(page, target, answer, question, steps);
      if (ok) return true;
    }
  }

  // 2. Scope to the label's containing block.
  const container = labelEl.locator("xpath=ancestor::*[self::div or self::fieldset or self::section][1]").first();
  if ((await container.count()) > 0) {
    // Try various input types within the container.
    const candidates: Array<{ loc: Locator; kind: string }> = [
      { loc: container.locator("textarea").first(), kind: "textarea" },
      { loc: container.locator("input[type='text'], input:not([type])").first(), kind: "text" },
      { loc: container.locator("input[type='url'], input[type='email'], input[type='tel']").first(), kind: "text" },
      { loc: container.locator("select").first(), kind: "select" },
    ];
    for (const c of candidates) {
      if ((await c.loc.count()) === 0) continue;
      if (!(await c.loc.isVisible().catch(() => false))) continue;
      const ok = await fillByKind(page, c.loc, c.kind, answer, question, steps);
      if (ok) return true;
    }
    // React-Select (custom div control with "Select..." placeholder)
    const rsControl = container
      .locator("[class*='select__control' i], [class*='Select__control' i], [class*='control' i][role='combobox'], [role='combobox']")
      .first();
    if ((await rsControl.count()) > 0 && (await rsControl.isVisible().catch(() => false))) {
      const ok = await fillReactSelect(page, rsControl, answer, question, steps);
      if (ok) return true;
    }
    // Radio group inside container
    const radios = container.locator("input[type='radio']");
    if ((await radios.count()) > 0) {
      const ok = await fillRadioGroup(page, container, radios, answer, question, steps);
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
 * React-Select interaction: click the control to open, type the answer into
 * the live combobox input, wait for filtered options, click the first one.
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
    await control.click({ timeout: 3000 });
    await page.waitForTimeout(250);

    // The opened menu's input is now focused on the page. Type to filter.
    await page.keyboard.type(answer.slice(0, 50), { delay: 12 });
    await page.waitForTimeout(350);

    // Look for visible options. Greenhouse react-select uses
    // [class*=option] or role=option; try both.
    const optionLocs = [
      "[role='option']:visible",
      "[class*='option']:visible:not([class*='disabled'])",
      "[class*='Option']:visible:not([class*='disabled'])",
    ];
    for (const sel of optionLocs) {
      const opt = page.locator(sel).first();
      if ((await opt.count()) === 0) continue;
      try {
        await opt.click({ timeout: 2000 });
        steps.push({ step: "selected_react_option", detail: label, ok: true });
        return true;
      } catch {
        // try next
      }
    }
    // Fallback: hit Enter and hope it picks the highlighted match.
    await page.keyboard.press("Enter");
    steps.push({ step: "selected_react_option_via_enter", detail: label, ok: true });
    return true;
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
