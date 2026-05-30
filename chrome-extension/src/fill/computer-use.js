/**
 * Phase 7 — Computer Use executor (content-script side).
 *
 * Architecture:
 *   1. Popup asks background to capture the visible tab as JPEG
 *   2. Background POSTs to /api/extension/computer-use with screenshot
 *      + applicationId. Server calls Claude Sonnet with vision and
 *      returns a fill plan: PlanAction[]
 *   3. Content script (this file) walks the plan and executes each
 *      action against the live DOM
 *
 * Plan action shape (mirrors server):
 *   {
 *     targetLabel: string,    // visible label text Claude saw on the form
 *     action: "type" | "select" | "click" | "abstain",
 *     value: string | null,   // what to type or option text to pick
 *     reason?: string
 *   }
 *
 * Element matching: we look for the label text on the page using a
 * heuristic walk (label tag, fieldset legend, nearby h3/h4) then
 * resolve the associated input. This is more forgiving than CSS
 * selectors and matches the way Claude was told to identify fields.
 */

(function () {
  const surface = window.__onbehalfDomSurface;
  if (!surface) {
    console.error("[Onbehalf] dom-surface not loaded; bailing");
    return;
  }

  /**
   * Find an input/textarea/select-like element associated with a label
   * whose text matches `targetLabel`. Strategy:
   *   1. Find every visible label/legend/heading whose text contains
   *      targetLabel (case-insensitive, asterisks/colons stripped)
   *   2. For each candidate label, find the related input by:
   *      a) for[id] attribute on label
   *      b) nearest sibling input/select/textarea/.select__control
   *      c) querySelector inside the label's parent container
   *   3. Return the first match
   */
  function findElementForLabel(targetLabel) {
    const norm = (s) =>
      (s ?? "")
        .replace(/[*:]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
    const target = norm(targetLabel);
    if (!target) return null;

    const candidates = Array.from(
      document.querySelectorAll("label, legend, h3, h4, .label, [class*='label' i]"),
    );

    for (const lbl of candidates) {
      const text = norm(lbl.textContent ?? "");
      if (!text) continue;
      if (!text.includes(target) && !target.includes(text)) continue;

      // (a) for attribute
      const forId = lbl.getAttribute && lbl.getAttribute("for");
      if (forId) {
        const el = document.getElementById(forId);
        if (el && isVisible(el)) return el;
      }

      // (b) closest sibling input
      let sib = lbl.nextElementSibling;
      let depth = 0;
      while (sib && depth < 3) {
        const found =
          sib.matches?.(
            "input, textarea, select, [class*='select__control' i], [role='combobox']",
          )
            ? sib
            : sib.querySelector?.(
                "input, textarea, select, [class*='select__control' i], [role='combobox']",
              );
        if (found && isVisible(found)) return found;
        sib = sib.nextElementSibling;
        depth++;
      }

      // (c) parent container search
      const parent = lbl.parentElement;
      if (parent) {
        const inputs = parent.querySelectorAll(
          "input, textarea, select, [class*='select__control' i], [role='combobox']",
        );
        for (const el of inputs) {
          if (isVisible(el)) return el;
        }
        // Or walk up one more level
        const gp = parent.parentElement;
        if (gp) {
          const more = gp.querySelectorAll(
            "input, textarea, select, [class*='select__control' i], [role='combobox']",
          );
          for (const el of more) {
            if (isVisible(el)) return el;
          }
        }
      }
    }
    return null;
  }

  function isVisible(el) {
    if (!(el instanceof HTMLElement)) return false;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    const cs = window.getComputedStyle(el);
    return cs.display !== "none" && cs.visibility !== "hidden" && cs.opacity !== "0";
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  /**
   * Type into a text input or textarea.
   */
  async function doType(el, value) {
    await surface.fill(el, value);
  }

  /**
   * Select an option. Handles both native <select> and React-Select.
   * Returns true if matched + clicked, false on miss.
   */
  async function doSelect(el, optionText) {
    const target = (optionText ?? "").trim().toLowerCase();
    if (!target) return false;

    // Native <select>
    if (el.tagName === "SELECT") {
      for (const o of Array.from(el.options || [])) {
        if (o.text.trim().toLowerCase() === target) {
          el.value = o.value;
          el.dispatchEvent(new Event("change", { bubbles: true }));
          return true;
        }
      }
      return false;
    }

    // React-Select control — click to open, find option, click it.
    const isReactSelect =
      el.matches?.("[class*='select__control' i], [class*='Select__control' i]") ||
      el.querySelector?.("[class*='placeholder' i]");
    if (isReactSelect) {
      el.click();
      await sleep(280);
      const optionEls = Array.from(
        document.querySelectorAll(
          "[role='option'], [class*='option' i]:not([class*='disabled' i])",
        ),
      ).filter(isVisible);
      const match = optionEls.find(
        (o) => (o.textContent ?? "").trim().toLowerCase() === target,
      );
      if (match) {
        match.click();
        await sleep(150);
        return true;
      }
      // close menu
      document.body.click();
      return false;
    }
    return false;
  }

  /**
   * Execute one action from the plan. Returns a structured result so
   * the popup can render what happened.
   */
  async function executeAction(action) {
    const { targetLabel, action: kind, value, reason } = action;
    const result = {
      targetLabel,
      action: kind,
      value,
      reason,
      status: "skipped",
      detail: "",
    };

    if (kind === "abstain") {
      result.status = "abstained";
      result.detail = reason ?? "(no reason given)";
      return result;
    }

    const el = findElementForLabel(targetLabel);
    if (!el) {
      result.status = "not_found";
      result.detail = "no element matched targetLabel";
      return result;
    }

    try {
      if (kind === "type") {
        if (typeof value !== "string") {
          result.status = "bad_value";
          result.detail = "value missing for type";
          return result;
        }
        await doType(el, value);
        result.status = "filled";
        return result;
      }
      if (kind === "select") {
        if (typeof value !== "string") {
          result.status = "bad_value";
          result.detail = "value missing for select";
          return result;
        }
        const picked = await doSelect(el, value);
        result.status = picked ? "filled" : "option_not_found";
        return result;
      }
      if (kind === "click") {
        el.click();
        result.status = "clicked";
        return result;
      }
      result.status = "unknown_action";
      return result;
    } catch (e) {
      result.status = "errored";
      result.detail = e?.message ?? "unknown error";
      return result;
    }
  }

  /**
   * Walk the plan, execute each, return a summary the popup can show.
   */
  async function executePlan(plan) {
    const results = [];
    for (const action of plan) {
      const r = await executeAction(action);
      results.push(r);
      // Small pause between actions so React-driven UIs settle. Helps
      // when filling one field triggers a re-render that affects the
      // next field we're about to touch.
      await sleep(80);
    }
    const summary = {
      total: results.length,
      filled: results.filter((r) => r.status === "filled").length,
      abstained: results.filter((r) => r.status === "abstained").length,
      notFound: results.filter((r) => r.status === "not_found").length,
      errored: results.filter((r) => r.status === "errored").length,
    };
    return { results, summary };
  }

  // Expose for content.js to call.
  window.__onbehalfExecutePlan = executePlan;
})();
