/**
 * Phase 8 — auto-fill executor.
 *
 * Consumes two things from the same page-load:
 *   1. `inventory` — the output of __onbehalfWalkForm() (kept in memory
 *      so we don't have to re-walk; refs map id → element).
 *   2. `answers` — the list returned by /api/extension/auto-fill.
 *
 * For each answer, look up the original element by opaque id and
 * apply the action. Returns a per-field result so the popup can
 * show what filled, what was skipped, what errored.
 *
 * No screenshots. No coordinates. No vision. Pure DOM work driven
 * by Claude's text-only judgment.
 */

(function () {
  const surface = window.__onbehalfDomSurface;
  if (!surface) {
    console.error("[Onbehalf] dom-surface not loaded; bailing");
    return;
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function lc(s) {
    return (s ?? "").toString().trim().toLowerCase();
  }

  async function fillText(el, value) {
    try {
      el.focus();
    } catch {
      /* not focusable — fill still works */
    }
    await sleep(20);
    await surface.fill(el, value);
  }

  async function fillNativeSelect(el, optionText) {
    const target = lc(optionText);
    if (!target) return { ok: false, reason: "empty option text" };
    for (const o of Array.from(el.options || [])) {
      if (lc(o.text) === target) {
        el.value = o.value;
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return { ok: true };
      }
    }
    // Partial: some forms have "United States of America" when we asked for "United States"
    for (const o of Array.from(el.options || [])) {
      if (lc(o.text).includes(target) || target.includes(lc(o.text))) {
        el.value = o.value;
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return { ok: true, partial: true };
      }
    }
    return { ok: false, reason: `option "${optionText}" not in <select>` };
  }

  async function fillReactSelect(controlEl, optionText) {
    const target = lc(optionText);
    if (!target) return { ok: false, reason: "empty option text" };
    // Click control to open the menu
    controlEl.click();
    await sleep(350);

    // Type into the combobox input so the menu filters to a short list
    const filterInput =
      controlEl.querySelector?.("input[role='combobox'], input[type='text']") ??
      (document.activeElement?.tagName === "INPUT" ? document.activeElement : null);
    if (filterInput) {
      try {
        await surface.fill(filterInput, optionText);
        await sleep(250);
      } catch {
        /* fall through */
      }
    }

    function findOpts() {
      return Array.from(
        document.querySelectorAll(
          "[role='option'], [class*='option' i]:not([class*='disabled' i])",
        ),
      ).filter((o) => {
        const r = o.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
    }
    let opts = findOpts();
    let exact = opts.find((o) => lc(o.textContent) === target);
    if (!exact) {
      await sleep(200);
      opts = findOpts();
      exact = opts.find((o) => lc(o.textContent) === target);
    }
    if (exact) {
      exact.click();
      await sleep(150);
      return { ok: true };
    }
    const partial = opts.find(
      (o) =>
        lc(o.textContent).includes(target) || target.includes(lc(o.textContent)),
    );
    if (partial) {
      partial.click();
      await sleep(150);
      return { ok: true, partial: true };
    }
    // Couldn't find — close menu by clicking outside
    document.body.click();
    return { ok: false, reason: `option "${optionText}" not visible after filter` };
  }

  async function fillRadio(group, optionText) {
    const target = lc(optionText);
    if (!target) return { ok: false, reason: "empty option text" };
    const elements = group.elements;
    for (const el of elements) {
      const id = el.id;
      const lbl = id
        ? document.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent
        : "";
      const candidate = lc(lbl || el.value || el.parentElement?.textContent || "");
      if (candidate === target) {
        el.click();
        return { ok: true };
      }
    }
    // Partial
    for (const el of elements) {
      const id = el.id;
      const lbl = id
        ? document.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent
        : "";
      const candidate = lc(lbl || el.value || el.parentElement?.textContent || "");
      if (candidate.includes(target) || target.includes(candidate)) {
        el.click();
        return { ok: true, partial: true };
      }
    }
    return { ok: false, reason: `radio option "${optionText}" not found` };
  }

  async function applyAnswer(answer, ref) {
    const result = {
      id: answer.id,
      label: ref?.__label ?? "",
      action: answer.action,
      value: answer.value,
      confidence: answer.confidence,
      reason: answer.reason,
      status: "skipped",
      detail: "",
    };

    if (!ref) {
      result.status = "no_ref";
      result.detail = `no DOM element kept for ${answer.id}`;
      return result;
    }

    if (answer.action === "skip") {
      result.status = "skipped";
      return result;
    }

    try {
      if (answer.action === "fill") {
        if (typeof answer.value !== "string") {
          result.status = "bad_value";
          return result;
        }
        await fillText(ref, answer.value);
        result.status = "filled";
        return result;
      }

      if (answer.action === "select") {
        if (typeof answer.value !== "string") {
          result.status = "bad_value";
          return result;
        }
        let r;
        if (ref.__radioGroup) {
          r = await fillRadio(ref, answer.value);
        } else if (ref.tagName === "SELECT") {
          r = await fillNativeSelect(ref, answer.value);
        } else {
          r = await fillReactSelect(ref, answer.value);
        }
        result.status = r.ok ? (r.partial ? "filled_partial" : "filled") : "option_not_found";
        if (!r.ok && r.reason) result.detail = r.reason;
        return result;
      }

      if (answer.action === "check") {
        if (lc(answer.value) === "yes" || answer.value === true) {
          if (!ref.checked) ref.click();
          result.status = "filled";
          return result;
        }
        if (lc(answer.value) === "no" || answer.value === false) {
          if (ref.checked) ref.click();
          result.status = "filled";
          return result;
        }
        result.status = "bad_value";
        return result;
      }

      result.status = "unknown_action";
      return result;
    } catch (e) {
      result.status = "errored";
      result.detail = e?.message ?? "unknown error";
      console.warn(`[Onbehalf] ${answer.id} (${ref?.tagName ?? "?"}) errored:`, e);
      return result;
    }
  }

  /**
   * Find the "Enter manually" / "Enter text" link near a file input.
   * Greenhouse-style forms render this as a button or anchor right
   * below the file picker. Clicking it swaps the file input for a
   * textarea so candidates can paste text directly.
   */
  function findEnterManuallyLink(fileEl) {
    const wrapper =
      fileEl.closest?.(
        "div.field, .form-field, .application-question, [class*='field' i], .form-group, [class*='question' i]",
      ) ?? fileEl.parentElement?.parentElement;
    if (!wrapper) return null;
    const candidates = Array.from(
      wrapper.querySelectorAll("button, a, [role='button'], span"),
    );
    return (
      candidates.find((c) => {
        const t = lc(c.textContent);
        return (
          t === "enter manually" ||
          t === "paste" ||
          t === "paste manually" ||
          t.includes("enter manually") ||
          t.includes("enter text")
        );
      }) || null
    );
  }

  /**
   * Handle the file_cover_letter field: click "Enter manually" to
   * reveal a textarea, then fill it with the application's cover
   * letter text. Falls back to noop if the link isn't there.
   */
  async function handleCoverLetterField(fileEl, coverLetterText) {
    if (!coverLetterText) return { status: "skipped", detail: "no cover letter text" };
    fileEl.scrollIntoView({ behavior: "instant", block: "center" });
    await sleep(60);
    const wrapper =
      fileEl.closest?.(
        "div.field, .form-field, .application-question, [class*='field' i], .form-group, [class*='question' i]",
      ) ?? fileEl.parentElement?.parentElement;
    const link = findEnterManuallyLink(fileEl);
    if (!link) return { status: "skipped", detail: "no Enter manually link" };
    link.click();
    await sleep(400);
    // After click, look for the textarea that just appeared in the same wrapper
    const ta = wrapper?.querySelector?.("textarea");
    if (!ta) return { status: "errored", detail: "textarea did not appear" };
    await fillText(ta, coverLetterText);
    return { status: "filled", detail: "cover letter pasted via Enter manually" };
  }

  /**
   * Handle the file_resume field: fetch the resume PDF bytes from the
   * server, build a File object, and drop it on the input via
   * DataTransfer. React forms also need a 'change' event.
   */
  async function handleResumeField(fileEl) {
    try {
      const res = await fetch("https://onbehalfai.vercel.app/api/extension/resume", {
        method: "GET",
        credentials: "include",
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        return { status: "errored", detail: e?.error ?? `server ${res.status}` };
      }
      const data = await res.json();
      const { filename, mime, base64 } = data;
      // Decode base64 → Uint8Array → File
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      await surface.setFile(fileEl, filename, bytes, mime);
      return { status: "filled", detail: `uploaded ${filename}` };
    } catch (e) {
      return { status: "errored", detail: e?.message ?? "resume upload threw" };
    }
  }

  async function executeAnswers(answers, refs, inventory) {
    const results = [];
    // Snapshot scroll so per-field focus doesn't drift the viewport
    const baseScrollX = window.scrollX;
    const baseScrollY = window.scrollY;

    for (const a of answers) {
      const ref = refs[a.id];
      const r = await applyAnswer(a, ref);
      results.push(r);
      await sleep(80);
      if (window.scrollX !== baseScrollX || window.scrollY !== baseScrollY) {
        window.scrollTo(baseScrollX, baseScrollY);
      }
    }

    // Second pass — file uploads the LLM can't do via text.
    if (Array.isArray(inventory)) {
      // Look up cover letter text from the application context via the
      // answer for any "cover letter" textarea field, OR by reusing the
      // server's slim profile. Easiest: ask the page if the popup
      // injected it. We'll fall back to a small inline endpoint hit.
      let coverLetterText = window.__onbehalfCoverLetterText ?? null;
      if (!coverLetterText) {
        try {
          const r = await fetch(
            "https://onbehalfai.vercel.app/api/extension/cover-letter",
            { credentials: "include" },
          );
          if (r.ok) {
            const j = await r.json().catch(() => null);
            coverLetterText = j?.text ?? null;
          }
        } catch {
          /* keep going */
        }
      }

      const fileResumeFields = inventory.filter((f) => f.type === "file_resume");
      const fileCoverFields = inventory.filter((f) => f.type === "file_cover_letter");
      console.log(
        `[Onbehalf] post-pass: ${fileResumeFields.length} resume field(s), ${fileCoverFields.length} cover-letter field(s); cover letter text length=${coverLetterText?.length ?? 0}`,
      );

      for (const field of fileResumeFields) {
        const ref = refs[field.id];
        if (!ref) {
          console.warn(`[Onbehalf] resume field ${field.id} has no ref`);
          continue;
        }
        console.log(`[Onbehalf] uploading resume to`, ref);
        const out = await handleResumeField(ref);
        console.log(`[Onbehalf] resume upload result:`, out);
        results.push({
          id: field.id,
          label: field.label,
          action: "upload",
          value: "(resume PDF)",
          confidence: "high",
          reason: "extension uploads resume from profile",
          status: out.status,
          detail: out.detail,
        });
        await sleep(150);
      }

      for (const field of fileCoverFields) {
        const ref = refs[field.id];
        if (!ref) {
          console.warn(`[Onbehalf] cover-letter field ${field.id} has no ref`);
          continue;
        }
        console.log(`[Onbehalf] pasting cover letter into`, ref);
        const out = await handleCoverLetterField(ref, coverLetterText);
        console.log(`[Onbehalf] cover letter result:`, out);
        results.push({
          id: field.id,
          label: field.label,
          action: "fill",
          value: "(cover letter)",
          confidence: "high",
          reason: "extension pastes cover letter via Enter manually",
          status: out.status,
          detail: out.detail,
        });
        await sleep(150);
      }
    }

    const summary = {
      total: results.length,
      filled: results.filter((r) => r.status === "filled" || r.status === "filled_partial").length,
      skipped: results.filter((r) => r.status === "skipped").length,
      errored: results.filter(
        (r) =>
          r.status === "errored" ||
          r.status === "option_not_found" ||
          r.status === "bad_value" ||
          r.status === "no_ref" ||
          r.status === "unknown_action",
      ).length,
      highConfidence: results.filter(
        (r) => (r.status === "filled" || r.status === "filled_partial") && r.confidence === "high",
      ).length,
    };
    return { results, summary };
  }

  window.__onbehalfExecuteAnswers = executeAnswers;
})();
