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
   * "cover-letter".
   */
  async function uploadCoverLetter(filename, bytes) {
    const selectors = [
      "input[type='file'][name*='cover_letter' i]",
      "input[type='file'][name*='cover-letter' i]",
      "input[type='file'][id*='cover_letter' i]",
    ];
    for (const sel of selectors) {
      const matches = await surface.$$(sel);
      for (const el of matches) {
        await surface.setFile(el, filename, bytes, "application/pdf");
        return true;
      }
    }
    return false;
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

    if (profile.resume && profile.resume.bytes) {
      const bytes = base64ToBytes(profile.resume.bytes);
      if (await uploadResume(profile.resume.filename, bytes)) {
        filled.push({ field: "resume", value: profile.resume.filename });
      } else {
        skipped.push("resume");
      }
    }

    if (profile.coverLetter && profile.coverLetter.bytes) {
      const bytes = base64ToBytes(profile.coverLetter.bytes);
      if (await uploadCoverLetter(profile.coverLetter.filename, bytes)) {
        filled.push({ field: "cover_letter", value: profile.coverLetter.filename });
      } else {
        skipped.push("cover_letter");
      }
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
