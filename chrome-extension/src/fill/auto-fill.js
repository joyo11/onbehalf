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

  async function executeAnswers(answers, refs) {
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
