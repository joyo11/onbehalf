/**
 * Greenhouse content-script filler (Phase 3 wave 2 — basic identity
 * fields + resume + cover-letter only).
 *
 * Phase 3 scope cap (per The Guy): port enough to land first_name,
 * last_name, email, phone, resume upload, and cover-letter upload.
 * That's the 80% case. Everything else (React-Selects, EEO dropdowns,
 * smart-fill textareas) routes to the server's existing pipeline in
 * a Phase 4 follow-up, or to Anthropic Computer Use as a fallback.
 *
 * Why this scope: the basic fields are what makes the form
 * submittable. EEO selects are optional on most forms. Cover letters
 * we already render server-side as a PDF; the extension uploads the
 * bytes. The complicated React-Select + smart-fill code is the
 * highest-risk port — we ship without it first, prove the wire, then
 * port incrementally.
 *
 * Uses window.__onbehalfDomSurface (injected by dom-surface.js).
 * Pure browser code, no imports.
 */

(function () {
  const surface = window.__onbehalfDomSurface;
  if (!surface) {
    console.error("[Onbehalf] dom-surface not loaded; bailing");
    return;
  }

  /**
   * Fill an identity field (first_name, last_name, email, phone).
   * Returns true if filled, false if no matching input was found.
   */
  async function fillByName(selectors, value) {
    if (!value) return false;
    for (const sel of selectors) {
      const matches = await surface.$$(sel);
      for (const el of matches) {
        if (!(await surface.isVisible(el))) continue;
        const existing = await surface.getValue(el);
        if (existing && existing.trim().length > 0) continue;
        await surface.fill(el, value);
        return true;
      }
    }
    return false;
  }

  /**
   * Find an input via name/id selectors OR by walking visible labels
   * matching a regex. Used for LinkedIn / Other Website / Portfolio
   * which have inconsistent name attributes across boards.
   */
  async function fillByLabel(labelRe, nameSelectors, value) {
    if (!value) return false;
    // Try the name selectors first.
    if (await fillByName(nameSelectors, value)) return true;
    // Walk labels.
    const inputs = await surface.$$("input[type='text'], input[type='url'], input:not([type])");
    for (const el of inputs) {
      if (!(await surface.isVisible(el))) continue;
      // Skip React-Select hidden inputs (would garble URL into a dropdown)
      if (
        el.closest(
          "[class*='select__control' i], [class*='Select__control' i], [class*='select__value-container' i]",
        )
      ) {
        continue;
      }
      const existing = await surface.getValue(el);
      if (existing && existing.trim().length > 0) continue;
      const label = await surface.labelFor(el);
      if (label && labelRe.test(label)) {
        await surface.fill(el, value);
        return true;
      }
    }
    return false;
  }

  /**
   * Find the resume file input and upload bytes into it.
   */
  async function uploadResume(filename, bytes) {
    const selectors = [
      "input[type='file'][name*='resume' i]",
      "input[type='file'][id*='resume' i]",
    ];
    for (const sel of selectors) {
      const matches = await surface.$$(sel);
      for (const el of matches) {
        if (!(await surface.isVisible(el))) {
          // Greenhouse hides the real <input type=file> behind a styled
          // button. Still functional even when "not visible" by CSS —
          // try the upload anyway.
        }
        await surface.setFile(el, filename, bytes, "application/pdf");
        return true;
      }
    }
    return false;
  }

  /**
   * Find a cover-letter file input. Greenhouse's standard shape is a
   * second file input with name/id containing "cover_letter" or
   * "cover-letter". Returns a tag describing how it was filled:
   *   "file" — uploaded into a file input
   *   "textarea" — pasted into the Additional Information / Cover
   *                letter textarea (Figma and others have no file
   *                input — only a free-text box)
   *   null — neither found
   */
  async function uploadCoverLetter(filename, bytes, text) {
    if (bytes && filename) {
      const selectors = [
        "input[type='file'][name*='cover_letter' i]",
        "input[type='file'][name*='cover-letter' i]",
        "input[type='file'][id*='cover_letter' i]",
      ];
      for (const sel of selectors) {
        const matches = await surface.$$(sel);
        for (const el of matches) {
          await surface.setFile(el, filename, bytes, "application/pdf");
          return "file";
        }
      }
    }
    // Fallback: paste the cover letter text into a labelled textarea.
    // Figma and most newer Greenhouse forms drop the dedicated file
    // input and present an "Additional Information" or "Cover Letter"
    // textarea instead.
    if (text) {
      const textareas = await surface.$$("textarea");
      for (const ta of textareas) {
        if (!(await surface.isVisible(ta))) continue;
        const existing = await surface.getValue(ta);
        if (existing && existing.trim().length > 0) continue;
        const label = (await surface.labelFor(ta)).toLowerCase();
        if (/cover letter|additional info|anything else|share more|tell us more about/i.test(label)) {
          await surface.fill(ta, text);
          return "textarea";
        }
      }
    }
    return null;
  }

  /**
   * Find the Submit button. Returns null if not found.
   */
  async function findSubmit() {
    const selectors = [
      "button[type='submit']",
      "input[type='submit']",
      "button[aria-label*='submit' i]",
    ];
    for (const sel of selectors) {
      const matches = await surface.$$(sel);
      for (const el of matches) {
        if (!(await surface.isVisible(el))) continue;
        const text = (await surface.getText(el)).toLowerCase();
        if (text.includes("submit") || text.includes("apply") || text.includes("send")) {
          return el;
        }
      }
    }
    // Fallback to the first visible submit-type button regardless of text.
    for (const sel of selectors) {
      const matches = await surface.$$(sel);
      for (const el of matches) {
        if (await surface.isVisible(el)) return el;
      }
    }
    return null;
  }

  /**
   * Phase 6b — scan visible required text inputs + textareas, stamp
   * each with a UUID, ask the server's smart-fill to generate answers
   * via batched Claude, fill in the returned answers by UUID.
   *
   * Returns { filled, skipped, total } where total includes every
   * field considered (filled + abstained + skipped).
   */
  async function smartFillUnknownTextFields(applicationId) {
    const candidates = [];
    const inputs = await surface.$$(
      "input[type='text'], input:not([type]), textarea",
    );
    for (const el of inputs) {
      if (!(await surface.isVisible(el))) continue;
      // Fix from 2026-05-30 launch test: React-Select renders a hidden
      // text input inside its control for type-to-filter. If we treat
      // it as a normal text input and let Claude write into it, the
      // React-Select renders the answer as garbage instead of picking
      // an option. Skip any input that lives inside a React-Select.
      if (
        el.closest(
          "[class*='select__control' i], [class*='Select__control' i], [class*='select__value-container' i]",
        )
      ) {
        continue;
      }
      const existing = await surface.getValue(el);
      if (existing && existing.trim().length > 0) continue;
      const type = await surface.attr(el, "type");
      if (type === "file") continue;
      const label = await surface.labelFor(el);
      if (!label || label.length < 6) continue;
      const required = !!(await surface.attr(el, "required"));
      const ariaRequired = (await surface.attr(el, "aria-required")) === "true";
      const labelStar = /\*\s*$/.test(label);
      if (!required && !ariaRequired && !labelStar) continue;
      const tag = el.tagName.toLowerCase();
      const kind = tag === "textarea" ? "textarea" : "text";
      const id = uuid();
      el.setAttribute("data-onbehalf-field-id", id);
      const maxLengthAttr = await surface.attr(el, "maxlength");
      const maxLength = maxLengthAttr ? parseInt(maxLengthAttr, 10) : undefined;
      candidates.push({
        selector: id,
        label,
        kind,
        maxLength: Number.isFinite(maxLength) ? maxLength : undefined,
      });
    }
    if (candidates.length === 0) return { filled: 0, skipped: 0, total: 0 };

    const resp = await sendBackground({
      type: "SMART_FILL",
      payload: { applicationId, fields: candidates },
    });
    if (!resp?.ok || !resp.body?.answers) {
      return { filled: 0, skipped: candidates.length, total: candidates.length };
    }

    let filled = 0;
    let skipped = 0;
    for (const c of candidates) {
      const ans = resp.body.answers[c.selector];
      const el = document.querySelector(
        `[data-onbehalf-field-id='${c.selector}']`,
      );
      if (!el) continue;
      if (typeof ans === "string" && ans.trim().length > 0) {
        await surface.fill(el, ans);
        filled++;
      } else {
        skipped++;
      }
      el.removeAttribute("data-onbehalf-field-id");
    }
    return { filled, skipped, total: candidates.length };
  }

  function uuid() {
    return "ob-" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }

  /**
   * Phase 6c (post-launch-test refactor) — find every dropdown DIRECTLY
   * instead of starting from a label and walking to find its control.
   * Rationale: Figma's EEO section has labels that aren't ancestors of
   * the React-Select; my old ancestor-walk missed them. New approach:
   *
   *   1. Native <select>: enumerate, get label from labelFor()
   *   2. React-Select controls: query for every .select__control
   *      and walk BACK to find the label
   *
   * Returns { filled, abstained, total }.
   */
  async function resolveDropdowns(applicationId) {
    let filled = 0;
    let abstained = 0;
    let total = 0;

    // 1. Native <select>.
    const selects = await surface.$$("select");
    for (const sel of selects) {
      if (!(await surface.isVisible(sel))) continue;
      const currentVal = await surface.getValue(sel);
      if (currentVal && currentVal.trim().length > 0) continue;
      const label = await surface.labelFor(sel);
      if (!label || label.length < 4) continue;
      total++;
      const options = Array.from(sel.options || [])
        .map((o) => o.text.trim())
        .filter((t) => t.length > 0 && !/^select\.\.\.$|^select an option$/i.test(t));
      if (options.length === 0) {
        abstained++;
        continue;
      }
      const resp = await sendBackground({
        type: "RESOLVE_FIELD",
        payload: { applicationId, label, options },
      });
      if (resp?.ok && resp.body?.value) {
        let didFill = false;
        for (const o of Array.from(sel.options || [])) {
          if (o.text.trim().toLowerCase() === resp.body.value.trim().toLowerCase()) {
            sel.value = o.value;
            sel.dispatchEvent(new Event("change", { bubbles: true }));
            filled++;
            didFill = true;
            break;
          }
        }
        if (!didFill) abstained++;
      } else {
        abstained++;
      }
    }

    // 2. React-Select controls — find directly, then walk back to label.
    const controls = await surface.$$(
      "[class*='select__control' i], [class*='Select__control' i]",
    );
    for (const ctl of controls) {
      if (!(await surface.isVisible(ctl))) continue;
      // Already filled? React-Select shows .select__single-value when
      // a value is committed, .select__placeholder when not.
      const hasValue = ctl.querySelector("[class*='single-value' i]");
      const hasPlaceholder = ctl.querySelector("[class*='placeholder' i]");
      if (hasValue) continue;
      if (!hasPlaceholder) continue; // not a populated/empty Select; weird state

      // Find the label by walking up from the control and looking for
      // any nearby label/legend/heading. We expand to also check the
      // PARENT's sibling labels (Figma puts label and select side-by-
      // side as sibling divs under a section container).
      const labelText = await findNearbyLabel(ctl);
      if (!labelText || labelText.length < 4) continue;

      total++;
      ctl.click();
      await sleep(280);
      const optionEls = Array.from(
        document.querySelectorAll(
          "[role='option'], [class*='option' i]:not([class*='disabled' i])",
        ),
      ).filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
      const optionTexts = optionEls
        .map((el) => (el.textContent ?? "").trim())
        .filter((t) => t.length > 0);
      if (optionTexts.length === 0) {
        document.body.click();
        abstained++;
        continue;
      }

      const resp = await sendBackground({
        type: "RESOLVE_FIELD",
        payload: { applicationId, label: labelText, options: optionTexts },
      });

      if (resp?.ok && resp.body?.value) {
        const pickedLower = resp.body.value.trim().toLowerCase();
        const match = optionEls.find(
          (el) => (el.textContent ?? "").trim().toLowerCase() === pickedLower,
        );
        if (match) {
          match.click();
          filled++;
          await sleep(150);
          continue;
        }
      }
      document.body.click();
      abstained++;
    }

    return { filled, abstained, total };
  }

  /**
   * Walk back from a React-Select control to find the closest label
   * text. Tries (in order):
   *   - aria-labelledby on the control
   *   - previous label/legend sibling at each ancestor level up to 5
   *   - heading inside the same ancestor (h3/h4/.label)
   */
  async function findNearbyLabel(ctl) {
    const ariaLabelledBy = ctl.getAttribute("aria-labelledby");
    if (ariaLabelledBy) {
      const el = document.getElementById(ariaLabelledBy);
      if (el?.textContent) return el.textContent.replace(/\s+/g, " ").trim();
    }
    let node = ctl.parentElement;
    for (let depth = 0; node && depth < 5; depth++, node = node.parentElement) {
      // Check previous siblings of this node for a label/legend/heading
      let sib = node.previousElementSibling;
      while (sib) {
        if (
          sib.matches("label, legend, .label, h3, h4") &&
          sib.textContent &&
          sib.textContent.trim().length > 0
        ) {
          return sib.textContent.replace(/\s+/g, " ").trim().slice(0, 200);
        }
        // Sometimes label is wrapped in a div above
        const inner = sib.querySelector("label, legend");
        if (inner?.textContent) {
          return inner.textContent.replace(/\s+/g, " ").trim().slice(0, 200);
        }
        sib = sib.previousElementSibling;
      }
      // Or a label INSIDE the current ancestor (above the control)
      const heading = node.querySelector("label, legend, .label, h3, h4");
      if (heading && heading.textContent && heading.textContent.trim().length > 0) {
        const t = heading.textContent.replace(/\s+/g, " ").trim();
        // Reject if the "label" is actually inside the React-Select itself
        if (!heading.closest("[class*='select__control' i]")) {
          return t.slice(0, 200);
        }
      }
    }
    return "";
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function sendBackground(msg) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(msg, (resp) => resolve(resp ?? { ok: false }));
    });
  }

  /**
   * Run the fill against the active page. Profile shape mirrors the
   * server's SubmissionProfile but only the fields the extension uses.
   *
   * Returns a structured result for the background script to send back
   * to the server.
   */
  async function fillGreenhouseForm(profile) {
    const filled = [];
    const skipped = [];

    if (await fillByName(["#first_name", "input[name='first_name']", "input[id*='first_name' i]"], profile.firstName)) {
      filled.push({ field: "first_name", value: profile.firstName });
    } else {
      skipped.push("first_name");
    }
    if (await fillByName(["#last_name", "input[name='last_name']", "input[id*='last_name' i]"], profile.lastName)) {
      filled.push({ field: "last_name", value: profile.lastName });
    } else {
      skipped.push("last_name");
    }
    if (await fillByName(["#email", "input[type='email']", "input[name='email']"], profile.email)) {
      filled.push({ field: "email", value: profile.email });
    } else {
      skipped.push("email");
    }
    if (profile.phone) {
      if (await fillByName(["#phone", "input[type='tel']", "input[name='phone']"], profile.phone)) {
        filled.push({ field: "phone", value: profile.phone });
      } else {
        skipped.push("phone");
      }
    }

    // Profile URL fields — LinkedIn, GitHub, portfolio. Optional but
    // worth filling when present so the user doesn't have to.
    if (profile.linkedinUrl) {
      if (
        await fillByLabel(
          /linkedin/i,
          ["input[name*='linkedin' i]", "input[id*='linkedin' i]"],
          profile.linkedinUrl,
        )
      ) {
        filled.push({ field: "linkedin", value: profile.linkedinUrl });
      }
    }
    if (profile.githubUrl) {
      if (
        await fillByLabel(
          /github/i,
          ["input[name*='github' i]", "input[id*='github' i]"],
          profile.githubUrl,
        )
      ) {
        filled.push({ field: "github", value: profile.githubUrl });
      }
    }
    if (profile.portfolioUrl) {
      if (
        await fillByLabel(
          /portfolio|website|personal site/i,
          ["input[name*='portfolio' i]", "input[name*='website' i]"],
          profile.portfolioUrl,
        )
      ) {
        filled.push({ field: "portfolio", value: profile.portfolioUrl });
      }
    }

    if (profile.resume && profile.resume.bytes) {
      const bytes = base64ToBytes(profile.resume.bytes);
      if (await uploadResume(profile.resume.filename, bytes)) {
        filled.push({ field: "resume", value: profile.resume.filename });
      } else {
        skipped.push("resume");
      }
    }

    if (profile.coverLetter) {
      const bytes = profile.coverLetter.bytes ? base64ToBytes(profile.coverLetter.bytes) : null;
      const how = await uploadCoverLetter(
        profile.coverLetter.filename,
        bytes,
        profile.coverLetter.text,
      );
      if (how === "file") {
        filled.push({ field: "cover_letter (file)", value: profile.coverLetter.filename });
      } else if (how === "textarea") {
        filled.push({ field: "cover_letter (textarea)", value: "(pasted)" });
      } else {
        skipped.push("cover_letter");
      }
    }

    // Phase 6c — walk all unfilled selects (native + React-Select) and
    // ask the server's resolveSelectField to pick from the real
    // options. Runs BEFORE smart-fill because picking a country
    // sometimes reveals a state dropdown.
    let drops = { filled: 0, abstained: 0, total: 0 };
    if (profile.applicationId) {
      try {
        drops = await resolveDropdowns(profile.applicationId);
      } catch (e) {
        console.error("[Onbehalf] dropdown resolution threw:", e);
      }
    }
    if (drops.filled > 0) {
      filled.push({ field: `dropdowns (${drops.filled})`, value: `LLM picked ${drops.filled} options` });
    }
    if (drops.abstained > 0) {
      skipped.push(`dropdowns_abstained (${drops.abstained})`);
    }

    // Phase 6b — once the deterministic identity fields and dropdowns
    // are in, sweep the remaining required text/textarea fields and
    // let Claude generate answers for them.
    let smart = { filled: 0, skipped: 0, total: 0 };
    if (profile.applicationId) {
      try {
        smart = await smartFillUnknownTextFields(profile.applicationId);
      } catch (e) {
        console.error("[Onbehalf] smart fill threw:", e);
      }
    }
    if (smart.filled > 0) {
      filled.push({ field: `smart_fill (${smart.filled})`, value: `Claude answered ${smart.filled} required fields` });
    }
    if (smart.skipped > 0) {
      skipped.push(`smart_fill_abstained (${smart.skipped})`);
    }

    const submit = await findSubmit();

    return {
      filled,
      skipped,
      submitButtonFound: !!submit,
      url: location.href,
      title: document.title,
    };
  }

  function base64ToBytes(b64) {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  // Expose for content.js to call.
  window.__onbehalfFillGreenhouse = fillGreenhouseForm;
})();
