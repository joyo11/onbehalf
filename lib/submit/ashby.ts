import type { Locator, Page } from "playwright-core";
import { renderCoverLetterPdf } from "./cover-letter-pdf";
import {
  fillCityAutocompletes,
  fillEmptyRequiredTextInputs,
  fillReactSelect,
  mapEeoToOption,
} from "./greenhouse";
import type { SmartFillContext } from "./smart-fill";
import type { ResolvedField, SubmissionProfile, SubmissionStep } from "./types";

/**
 * Fill an Ashby-hosted application form.
 *
 * Ashby is a single-page React app served at
 *   https://jobs.ashbyhq.com/{company}/{job-slug}/application
 *
 * Key markup differences vs Greenhouse:
 *   - System fields use underscored names: `_systemfield_name`,
 *     `_systemfield_email`, `_systemfield_phone`, `_systemfield_resume`.
 *   - Ashby renders ONE "Full Name" input rather than First / Last.
 *   - Dropdowns are mostly React-Select (same class patterns —
 *     `[class*='select__control']`, `[role='combobox']` — as Greenhouse).
 *   - Each custom question is wrapped in a `*_ApplicationForm-fieldEntry`
 *     style div with the question text in a `<label>` above the control.
 *   - File inputs: resume + (optional) cover letter, plus arbitrary
 *     "additional documents" file inputs for some boards.
 *   - Submit button text is usually "Submit Application".
 *
 * Strategy mirrors greenhouse.ts:
 *   1. Identity (name, email, phone, resume).
 *   2. Cover letter — file upload preferred, textarea fallback.
 *   3. Walk every visible <label>, dispatch to the right widget.
 *   4. Location autocomplete + N/A fallback for empty required inputs.
 *   5. Locate submit button — caller decides whether to click.
 */
export async function fillAshbyForm(
  page: Page,
  profile: SubmissionProfile,
  job?: { company: string; title: string; jdSummary: string; budget?: import("./resolve-field").LlmBudget },
): Promise<{
  steps: SubmissionStep[];
  submitButton: { selector: string } | null;
  resolvedFields: ResolvedField[];
}> {
  const llmCtx: SmartFillContext | undefined = job ? { profile, job } : undefined;
  const steps: SubmissionStep[] = [];
  const resolvedFields: ResolvedField[] = [];

  // Ashby is a React SPA — domcontentloaded fires before the form mounts.
  // Wait for ANY of the markers that signal the application form is on
  // the page. 12s — long enough for a normally-rendering Ashby SPA,
  // short enough that a non-rendering page doesn't blow the 60s function
  // budget (Phase 1 of the 2026-05-30 plan tightened this from 25s).
  const markerSelector =
    "input[type='file'], input[name*='_systemfield' i], input[name='name'], input[name='email'], form[class*='application' i], [class*='ashby-application'], [data-ashby-application-form], [class*='application-form']";
  const ready = await page
    .waitForSelector(markerSelector, { timeout: 12_000, state: "attached" })
    .then(() => true)
    .catch(() => false);
  steps.push({ step: "ashby_form_ready", detail: String(ready), ok: ready });
  if (!ready) {
    // Snapshot what we did see so a human can diagnose. This is short
    // and runs only on the failure path so it doesn't add latency to the
    // happy path.
    const bodyText = (await page.locator("body").textContent().catch(() => "")) ?? "";
    const inputCount = await page.locator("input").count().catch(() => -1);
    const buttonCount = await page.locator("button").count().catch(() => -1);
    const url = page.url();
    steps.push({
      step: "ashby_debug_no_form",
      detail: JSON.stringify({
        url,
        inputCount,
        buttonCount,
        bodyPreview: bodyText.replace(/\s+/g, " ").slice(0, 400),
      }),
      ok: false,
    });
  } else {
    // Once a marker is attached, give React one more tick to finish
    // populating the rest of the fields (helps when the file input
    // mounts first and the other inputs lag behind).
    await page.waitForTimeout(1000);
  }

  // ── Basic identity ────────────────────────────────────────
  // Ashby uses a single full-name field; fall back to first/last variants
  // for the rare boards that use two inputs.
  await tryFill(
    page,
    [
      "input[name='_systemfield_name']",
      "input[id='_systemfield_name']",
      "input[name='name']",
      "input[id*='name']:not([name*='first' i]):not([name*='last' i])",
    ],
    profile.fullName || `${profile.firstName} ${profile.lastName}`.trim(),
    "full_name",
    steps,
  );
  // Some Ashby boards do render separate first/last name inputs.
  await tryFill(
    page,
    ["input[name='first_name']", "input[id*='first_name']", "input[name*='firstName']"],
    profile.firstName,
    "first_name",
    steps,
  );
  await tryFill(
    page,
    ["input[name='last_name']", "input[id*='last_name']", "input[name*='lastName']"],
    profile.lastName,
    "last_name",
    steps,
  );

  await tryFill(
    page,
    [
      "input[name='_systemfield_email']",
      "input[id='_systemfield_email']",
      "input[type='email']",
      "input[name='email']",
    ],
    profile.email,
    "email",
    steps,
  );

  if (profile.phone) {
    await tryFill(
      page,
      [
        "input[name='_systemfield_phone']",
        "input[id='_systemfield_phone']",
        "input[type='tel']",
        "input[name='phone']",
      ],
      profile.phone,
      "phone",
      steps,
    );
  }

  // ── Resume upload ─────────────────────────────────────────
  if (profile.resumePdfBytes) {
    await uploadFile(
      page,
      [
        "input[type='file'][name='_systemfield_resume']",
        "input[type='file'][id*='_systemfield_resume']",
        "input[type='file'][name*='resume' i]",
        "input[type='file'][id*='resume' i]",
      ],
      profile.resumePdfBytes,
      profile.resumeFileName,
      "uploaded_resume",
      steps,
    );
  }

  // ── Cover letter ──────────────────────────────────────────
  if (profile.coverLetter) {
    await fillCoverLetter(page, profile, steps);
  }

  // ── Walk every labelled field and answer it ───────────────
  await page.waitForTimeout(400);
  await fillAllLabelledFields(page, profile, steps);

  // City autocomplete fallback — re-uses the shared Greenhouse helper which
  // looks for any visible React-Select inside a container labelled
  // 'location' / 'city' and types the profile city.
  await fillCityAutocompletes(page, profile, steps);

  // Ashby's privacy policy / consent is typically a checkbox rather than a
  // SELECT, so check any acknowledgment-style boxes that sit unchecked
  // near the bottom of the form.
  await checkAcknowledgmentBoxes(page, steps);

  // N/A fallback for empty required text inputs.
  await fillEmptyRequiredTextInputs(page, steps, llmCtx, resolvedFields);

  // ── Submit button ─────────────────────────────────────────
  await page.waitForTimeout(200);
  const submitSelectors = [
    "button[type='submit']:visible",
    "button:has-text('Submit Application'):visible",
    "button:has-text('Submit application'):visible",
    "button:has-text('Submit'):visible",
    "[role='button']:has-text('Submit Application'):visible",
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
 * Cover letter fill for Ashby. Strategies:
 *   (a) Direct selector — file input named/id'd with "cover".
 *   (b) Section walk-up — find any container whose label is "Cover Letter"
 *       and look inside for a file input OR textarea.
 *   (c) Bare textarea fallback (legacy boards / open-ended question).
 *   (d) If we found exactly two file inputs total on the page, treat the
 *       second one as cover letter (Ashby standard ordering when both
 *       are enabled).
 */
async function fillCoverLetter(
  page: Page,
  profile: SubmissionProfile,
  steps: SubmissionStep[],
): Promise<void> {
  const filename = `CoverLetter_${(profile.fullName || profile.firstName).replace(/\s+/g, "_")}.pdf`;

  // Strategy (a): direct selector.
  const directInput = page
    .locator(
      "input[type='file'][name*='cover' i], input[type='file'][id*='cover' i], input[type='file'][name*='_systemfield_coverLetter' i]",
    )
    .first();
  if ((await directInput.count()) > 0) {
    try {
      const pdfBytes = await renderCoverLetterPdf(profile.coverLetter);
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

  // Strategy (b): section walk-up by label text.
  const sectionSelectors = [
    "div:has(> label:has-text('Cover Letter'))",
    "div:has(label:has-text('Cover Letter'))",
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
        await fileInput.setInputFiles({
          name: filename,
          mimeType: "application/pdf",
          buffer: pdfBytes,
        });
        steps.push({
          step: "attached_cover_letter_pdf",
          detail: filename + " (via section)",
          ok: true,
        });
        return;
      } catch (e) {
        steps.push({
          step: "failed_attach_cover_letter",
          detail: e instanceof Error ? e.message : "attach failed",
          ok: false,
        });
      }
    }
    const ta = section.locator("textarea").first();
    if ((await ta.count()) > 0) {
      try {
        await ta.fill(profile.coverLetter);
        steps.push({ step: "filled_cover_letter_textarea", detail: "section textarea", ok: true });
        return;
      } catch {
        // fall through
      }
    }
  }

  // Strategy (c): bare textarea fallback.
  const fillOk = await tryFill(
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
  if (fillOk) return;

  // Strategy (d): second file input on the page (resume is first).
  const allFileInputs = await page.locator("input[type='file']").all();
  if (allFileInputs.length >= 2) {
    try {
      const pdfBytes = await renderCoverLetterPdf(profile.coverLetter);
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
}

/**
 * Walk every visible label/legend on the page; for each, derive an
 * answer from the profile or screener bank, then dispatch to the
 * correct widget type. Mirrors Greenhouse's fillAllLabelledFields.
 */
async function fillAllLabelledFields(
  page: Page,
  profile: SubmissionProfile,
  steps: SubmissionStep[],
): Promise<void> {
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
  return /^(full name|name|first name|last name|email|phone|country|resume|cv|cover letter|resume \/ cv)$/i.test(
    q.trim(),
  );
}

/* ───────────── question → answer mapping ───────────── */

const profileMap: Array<{
  match: RegExp;
  get: (p: SubmissionProfile) => string | null;
}> = [
  {
    match:
      /current country|country of residence|country.*reside|where (?:are you|do you) (?:currently )?(?:reside|live)/i,
    get: (p) => p.countryOfResidence ?? null,
  },
  {
    match:
      /country.*(?:located|work|based)|which country.*work|where (?:are you|will you be) (?:currently )?based/i,
    get: (p) => p.countryOfWork ?? p.countryOfResidence ?? null,
  },
  {
    match: /(?:current )?location|where are you located|city.*state/i,
    get: (p) => p.location ?? null,
  },
  {
    match: /preferred name|name you.*prefer|what name.*us(?:e| to use)/i,
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
  {
    match:
      /authori[sz]ation to work|describe your work authori|status with respect to (?:your )?work/i,
    get: (p) => {
      if (p.workAuthorization === "us_citizen_pr") return "nationality";
      if (p.workAuthorization === "needs_sponsorship" || p.needsSponsorship) {
        return "needs to be sponsored";
      }
      return "do not need a company to sponsor";
    },
  },
  {
    match:
      /currently authori[sz]ed to work|legally authori[sz]ed to work|presently authori[sz]ed|authori[sz]ed to work in (?:the )?(?:US|U\.S\.|United States)/i,
    get: (p) => (p.currentlyAuthorizedUS ? "Yes" : "No"),
  },
  {
    match: /sponsor|visa|require visa/i,
    get: (p) => (p.needsSponsorship ? "Yes" : "No"),
  },
  {
    match: /live in one of the following states|which state|state of residence/i,
    get: (p) => {
      const loc = p.location ?? "";
      const parts = loc.split(",").map((s) => s.trim()).filter(Boolean);
      if (parts.length >= 2) return parts[1];
      return parts[0] ?? "";
    },
  },
  {
    match:
      /currently based in|based in any of these countries|in which of (?:these|the following) countries/i,
    get: (p) => p.countryOfResidence ?? "United States",
  },
  {
    match: /employment agreement|post.?employment|non.?compete|restrictive covenant/i,
    get: (p) => (p.employmentRestrictions ? "Yes" : "No"),
  },
  {
    match:
      /previously worked|consulted for|worked (?:at|for) .{0,30}\bbefore|former (?:employee|contractor)/i,
    get: (p) => (p.previouslyWorkedHere ? "Yes" : "No"),
  },
  {
    match: /accessibility|accommodation|adjustment.*(?:hiring|interview)|adjustments we can make/i,
    get: (p) => p.accommodationsNeeded ?? "None at this time.",
  },
  {
    match:
      /current (?:or most recent )?(?:company|employer)|name of your current|most recent company|where (?:do |are )you currently (?:work|employed)/i,
    get: (p) => p.currentCompany ?? "Independent",
  },
  {
    match:
      /current (?:or most recent )?(?:job title|role|position)|what (?:is|'s) your current title|most recent title/i,
    get: (p) => p.currentJobTitle ?? "Software Engineer",
  },
  {
    match:
      /how did you (?:first )?hear|where did you (?:first )?hear|how (?:did you|do you) find (?:out about )?(?:this|the) (?:role|job|position|opportunity)|how (?:did you |do you )?learn about/i,
    get: () => "LinkedIn",
  },
  {
    match:
      /\bi agree\b|privacy (?:policy|notice).*(?:agree|accept|consent)|consent to (?:the |our )?(?:privacy|terms)|understand.*(?:will be processed|in accordance|privacy policy)/i,
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
  const s = bestScreener(question, profile.screeners);
  if (s) return s.answer;

  const q = question.toLowerCase();
  const looksLikeQualifier =
    /^(do you|are you|can you|have you|will you).*(have|use|know|familiar|experience|proficien|fluent|comfort|able)\b/.test(
      q,
    ) ||
    /^(do you have|are you)\b.{0,40}(experience|proficien|fluent|familiar|comfort|able)/.test(q);
  if (looksLikeQualifier) return "Yes";
  return null;
}

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
          ((await page
            .locator(`label[for='${cssEscape(id)}']`)
            .first()
            .textContent()
            .catch(() => "")) ?? "").trim();
      }
      if (!labelText) {
        labelText = ((await cb.locator("xpath=..").textContent().catch(() => "")) ?? "").trim();
      }

      if (
        /marketing|newsletter|promotional|subscribe|updates from|future opportunit/i.test(
          labelText,
        )
      ) {
        steps.push({
          step: "skipped_marketing_checkbox",
          detail: labelText.slice(0, 60),
          ok: true,
        });
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

/* ───────────── label → input dispatch ───────────── */

async function fillByLabel(
  page: Page,
  labelEl: Locator,
  question: string,
  answer: string,
  steps: SubmissionStep[],
): Promise<boolean> {
  const container = labelEl
    .locator("xpath=ancestor::*[self::div or self::fieldset or self::section][1]")
    .first();
  const containerExists = (await container.count()) > 0;

  // 1. React-Select first.
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

  // 3. Radio group.
  if (containerExists) {
    const radios = container.locator("input[type='radio']");
    if ((await radios.count()) > 0) {
      const ok = await fillRadioGroup(page, radios, answer, question, steps);
      if (ok) return true;
    }
  }

  // 4. label[for] → text input / textarea.
  const forId = await labelEl.getAttribute("for").catch(() => null);
  if (forId) {
    const target = page.locator(`#${cssEscape(forId)}`).first();
    if ((await target.count()) > 0) {
      const insideRs = await target
        .evaluate((el: Element) => {
          let cur: Element | null = el;
          for (let i = 0; i < 6 && cur; i++) {
            const cls = (cur.className || "").toString();
            if (/select__control|Select__control|select__value-container/.test(cls)) return true;
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

  // 5. Bare textarea / input inside container.
  if (containerExists) {
    const candidates: Array<{ loc: Locator; kind: string }> = [
      { loc: container.locator("textarea").first(), kind: "textarea" },
      { loc: container.locator("input[type='text'], input:not([type])").first(), kind: "text" },
      {
        loc: container.locator("input[type='url'], input[type='email'], input[type='tel']").first(),
        kind: "text",
      },
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
  // page intentionally unused for textarea/text/select branches above
  void page;
  return false;
}

async function fillRadioGroup(
  page: Page,
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
      ? ((await page
          .locator(`label[for='${cssEscape(id)}']`)
          .first()
          .textContent()
          .catch(() => "")) ?? "")
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

/* ───────────── text similarity + screener pick ───────────── */

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
  return id.replace(/(["'\\])/g, "\\$1");
}

/**
 * Quick check: does this page look like an Ashby-powered job board?
 * Reliable markers:
 *   - jobs.ashbyhq.com or ashbyhq.com in the URL
 *   - presence of any input named `_systemfield_*` (Ashby's signature)
 *   - the `ashby-application-form-` class prefix on form elements
 */
export async function isAshbyPage(page: Page): Promise<boolean> {
  const url = page.url();
  if (/ashbyhq\.com/i.test(url)) return true;
  const hasAshbyMarker = await page
    .locator(
      "input[name^='_systemfield_'], [class*='ashby-application-form-'], iframe[src*='ashbyhq.com']",
    )
    .count()
    .then((n) => n > 0)
    .catch(() => false);
  return hasAshbyMarker;
}
