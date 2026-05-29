import type { Locator, Page } from "playwright-core";
import type { SubmissionProfile, SubmissionStep } from "./types";

/**
 * Fill a Greenhouse-hosted application form.
 *
 * Greenhouse boards come in two flavors:
 *   1. boards.greenhouse.io/{slug}/jobs/{id} (legacy)
 *   2. job-boards.greenhouse.io/{slug}/jobs/{id} (modern)
 * Modern boards are an SPA built on top of the same data model — slightly
 * different selectors but the same fields.
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

  // ── Basic identity ────────────────────────────────────────
  await tryFill(["#first_name", "input[name='first_name']", "input[id*='first_name']"], profile.firstName, "first_name");
  await tryFill(["#last_name", "input[name='last_name']", "input[id*='last_name']"], profile.lastName, "last_name");
  await tryFill(["#email", "input[type='email']", "input[name='email']"], profile.email, "email");
  if (profile.phone) {
    await tryFill(["#phone", "input[type='tel']", "input[name='phone']"], profile.phone, "phone");
  }

  // ── URL fields ────────────────────────────────────────────
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
        "input[id*='github' i]",
      ],
      profile.portfolioUrl ?? profile.githubUrl!,
      "website",
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
    await tryFill(
      [
        "textarea[name*='cover' i]",
        "textarea[id*='cover' i]",
        "textarea[placeholder*='cover' i]",
        "textarea[aria-label*='cover' i]",
      ],
      profile.coverLetter,
      "cover_letter",
    );
  }

  // ── Custom screener questions ─────────────────────────────
  // Walk every visible form field on the page that isn't part of the basics
  // above and try to match it to one of the screener answers Claude wrote.
  await fillCustomScreeners(page, profile.screeners, steps);

  // ── Demographic / EEO section ─────────────────────────────
  // Greenhouse appends a standard EEO survey on most boards. None of it is
  // truly required to submit, but if any are marked required we want to
  // pick a "decline" option rather than leave blank.
  await declineDemographics(page, steps);

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
 * Lowercased keyword-overlap similarity. Cheap, no deps, good enough for
 * matching "Why are you interested in working at Anthropic?" to a Claude
 * screener question of "Tell us why Anthropic specifically interests you."
 */
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
const STOPWORDS = new Set([
  "the", "and", "for", "you", "are", "with", "that", "this", "what",
  "have", "your", "from", "will", "any", "our", "can", "into", "would",
  "describe", "tell", "please", "about", "why", "how", "where", "when",
]);

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

/**
 * Walk all custom form questions and try to match each to a screener answer.
 * Resilient: any single field that fails doesn't abort the loop.
 */
async function fillCustomScreeners(
  page: Page,
  screeners: SubmissionProfile["screeners"],
  steps: SubmissionStep[],
): Promise<void> {
  if (screeners.length === 0) return;

  // Modern Greenhouse boards wrap each question in one of these containers.
  // Legacy boards use simpler structures — we fall back to bare labels.
  const containerSelectors = [
    "[class*='application-question']",
    "[class*='custom-question']",
    "[data-qa*='question']",
    "fieldset",
    ".field",
  ];

  const seenLabels = new Set<string>();

  for (const containerSel of containerSelectors) {
    const blocks = await page.locator(containerSel).all();
    for (const block of blocks) {
      try {
        const labelLoc = block.locator("label, legend").first();
        const rawLabel = (await labelLoc.textContent().catch(() => "")) ?? "";
        const question = rawLabel.replace(/\*\s*$/, "").replace(/\s+/g, " ").trim();
        if (!question || seenLabels.has(question)) continue;
        seenLabels.add(question);

        // Skip basics we already handled.
        if (/first.*name|last.*name|email|phone|resume|cover.*letter|linkedin|website|location/i.test(question)) {
          continue;
        }

        const match = bestScreener(question, screeners);
        if (!match) continue;

        await fillOneField(block, match.answer, question.slice(0, 80), steps);
      } catch {
        // Skip this block — move to the next.
      }
    }
  }
}

/**
 * Fill a single question block — figure out what kind of input it has and
 * apply the answer in a sensible way.
 */
async function fillOneField(
  block: Locator,
  answer: string,
  questionPreview: string,
  steps: SubmissionStep[],
): Promise<void> {
  // textarea wins over text input for long answers.
  const textarea = block.locator("textarea").first();
  if ((await textarea.count()) > 0 && (await textarea.isVisible().catch(() => false))) {
    await textarea.fill(answer).catch(() => {});
    steps.push({ step: "filled_screener_textarea", detail: questionPreview, ok: true });
    return;
  }

  const text = block.locator("input[type='text'], input:not([type])").first();
  if ((await text.count()) > 0 && (await text.isVisible().catch(() => false))) {
    await text.fill(answer.slice(0, 200)).catch(() => {});
    steps.push({ step: "filled_screener_text", detail: questionPreview, ok: true });
    return;
  }

  const select = block.locator("select").first();
  if ((await select.count()) > 0) {
    // Find the option whose label best matches the answer.
    const options = await select.locator("option").all();
    let bestVal: string | null = null;
    let bestScore = 0;
    for (const opt of options) {
      const text = (await opt.textContent().catch(() => "")) ?? "";
      const val = (await opt.getAttribute("value").catch(() => "")) ?? "";
      if (!val) continue;
      const score = textSimilarity(text, answer);
      if (score > bestScore) {
        bestScore = score;
        bestVal = val;
      }
    }
    if (bestVal) {
      await select.selectOption(bestVal).catch(() => {});
      steps.push({ step: "selected_screener", detail: questionPreview, ok: true });
    }
    return;
  }

  const radios = block.locator("input[type='radio']");
  const radioCount = await radios.count();
  if (radioCount > 0) {
    let bestIdx = -1;
    let bestScore = 0;
    for (let i = 0; i < radioCount; i++) {
      const r = radios.nth(i);
      // The label is usually the radio's sibling or wraps it.
      const id = await r.getAttribute("id").catch(() => null);
      const labelText = id
        ? ((await block.locator(`label[for='${id}']`).textContent().catch(() => "")) ?? "")
        : ((await r.locator("xpath=..").textContent().catch(() => "")) ?? "");
      const score = textSimilarity(labelText, answer);
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0) {
      await radios.nth(bestIdx).check().catch(() => {});
      steps.push({ step: "checked_screener_radio", detail: questionPreview, ok: true });
    }
  }
}

/**
 * Greenhouse boards always ship an EEO / self-identification section near
 * the bottom. None of these questions are required for submission on the
 * vast majority of boards, but Anthropic and a few others mark them
 * required. Pick the most generic "decline to self-identify" option for
 * each so we don't get blocked at submit time.
 */
async function declineDemographics(page: Page, steps: SubmissionStep[]): Promise<void> {
  const declineOptionPatterns = [
    /decline to self.identify/i,
    /decline to answer/i,
    /prefer not to answer/i,
    /prefer not to say/i,
    /do not wish to/i,
    /i don.?t wish/i,
  ];

  // Strategy 1: native <select> dropdowns whose label hints at demographics.
  const selects = await page.locator("select").all();
  for (const sel of selects) {
    try {
      // Read all options, pick the first that matches any decline pattern.
      const options = await sel.locator("option").all();
      for (const opt of options) {
        const t = (await opt.textContent().catch(() => "")) ?? "";
        if (declineOptionPatterns.some((p) => p.test(t))) {
          const value = (await opt.getAttribute("value").catch(() => "")) ?? "";
          if (!value) continue;
          const current = await sel.evaluate((el) => (el as HTMLSelectElement).value).catch(() => "");
          if (current) break; // already answered, don't override
          await sel.selectOption(value).catch(() => {});
          steps.push({ step: "declined_demographic", detail: t.slice(0, 60), ok: true });
          break;
        }
      }
    } catch {
      // skip
    }
  }

  // Strategy 2: radio groups where one option is a decline variant.
  const allRadios = await page.locator("input[type='radio']").all();
  // Group radios by name attribute (radio buttons in same group share a name).
  const byName = new Map<string, typeof allRadios>();
  for (const r of allRadios) {
    const name = (await r.getAttribute("name").catch(() => "")) ?? "";
    if (!name) continue;
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name)!.push(r);
  }
  for (const [, group] of byName) {
    try {
      // If any radio in the group is already checked, skip.
      let alreadyChecked = false;
      for (const r of group) {
        if (await r.isChecked().catch(() => false)) {
          alreadyChecked = true;
          break;
        }
      }
      if (alreadyChecked) continue;

      for (const r of group) {
        const id = await r.getAttribute("id").catch(() => null);
        const labelText = id
          ? ((await page.locator(`label[for='${id}']`).first().textContent().catch(() => "")) ?? "")
          : ((await r.locator("xpath=..").textContent().catch(() => "")) ?? "");
        if (declineOptionPatterns.some((p) => p.test(labelText))) {
          await r.check().catch(() => {});
          steps.push({
            step: "declined_demographic_radio",
            detail: labelText.slice(0, 60),
            ok: true,
          });
          break;
        }
      }
    } catch {
      // skip
    }
  }
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
