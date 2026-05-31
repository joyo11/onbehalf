/**
 * Phase 7B executor — coordinate-based clicks.
 *
 * Replaces the label-walk executor (which couldn't reach React-Select
 * controls reliably) with elementFromPoint. Claude returns pixel
 * coordinates from the screenshot it analyzed; we use those directly
 * to find the right element.
 *
 * Plan action shape (mirrors server):
 *   {
 *     fieldName: string,
 *     action: "type" | "select" | "click" | "check" | "abstain",
 *     coord: { x: number, y: number },
 *     value: string | null,
 *     optionCoord?: { x, y },
 *     reason?: string
 *   }
 *
 * Coordinate space: chrome.tabs.captureVisibleTab returns the image
 * at the DEVICE pixel resolution — on Retina that's 2x the viewport.
 * The background script downscales the screenshot to viewport
 * dimensions before sending to Claude, so by the time the plan
 * arrives here, 1 coord pixel == 1 viewport CSS pixel ==
 * elementFromPoint's coordinate system.
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

  /**
   * Find the actually-fillable element at a coordinate. elementFromPoint
   * can return a label or a div instead of the underlying input — walk
   * up + sideways to find the real form control.
   */
  function findFormElementAt(x, y) {
    let el = document.elementFromPoint(x, y);
    if (!el) return null;
    // If we hit a label, find its for= target or nearest input.
    if (el.tagName === "LABEL") {
      const forId = el.getAttribute("for");
      if (forId) {
        const target = document.getElementById(forId);
        if (target) return target;
      }
      const inside = el.querySelector("input, textarea, select");
      if (inside) return inside;
    }
    // If we hit a wrapper div, look for a form control inside.
    if (el.tagName !== "INPUT" && el.tagName !== "TEXTAREA" && el.tagName !== "SELECT") {
      const inside = el.querySelector?.("input, textarea, select");
      if (inside) return inside;
    }
    return el;
  }

  /**
   * Determine if an element is a React-Select (or any non-native
   * combobox-style) dropdown vs a normal input/textarea/select.
   */
  function isComboboxLike(el) {
    if (!el) return false;
    if (el.tagName === "SELECT") return true;
    if (el.closest?.("[class*='select__' i]")) return true;
    if (el.getAttribute?.("role") === "combobox") return true;
    if (el.matches?.("[class*='Select__control' i], [class*='select__control' i]")) return true;
    return false;
  }

  async function doType(el, value) {
    // DO NOT scrollIntoView here. Claude returned a coordinate based
    // on the screenshot's viewport — if we scroll, every subsequent
    // action's coordinate maps to the wrong element. The field is
    // already in the viewport (Claude wouldn't have seen it otherwise).
    try {
      el.focus();
    } catch {
      /* not focusable — surface.fill still works for some surfaces */
    }
    await sleep(30);
    await surface.fill(el, value);
  }

  /**
   * For native <select>: set value matching the option text.
   * For React-Select: click to open, find option by text, click it.
   */
  async function doSelect(el, optionText) {
    const target = (optionText ?? "").trim().toLowerCase();
    if (!target) return { ok: false, reason: "no option text" };

    if (el.tagName === "SELECT") {
      for (const o of Array.from(el.options || [])) {
        if (o.text.trim().toLowerCase() === target) {
          el.value = o.value;
          el.dispatchEvent(new Event("change", { bubbles: true }));
          return { ok: true };
        }
      }
      return { ok: false, reason: "option not in <select>" };
    }

    // React-Select: click to open, type into the filter input so the
    // virtualized option list renders the option we want, then click
    // it. Do NOT scrollIntoView — same reasoning as doType (would
    // shift the viewport for subsequent actions).
    const control =
      el.closest?.("[class*='select__control' i], [class*='Select__control' i]") ?? el;
    control.click();
    await sleep(350); // wait for menu portal to mount

    // After opening, React-Select focuses a hidden combobox input.
    // Type the target text so the menu filters down to a small list
    // — necessary for huge dropdowns like Country (200+ options) that
    // virtualize and only render ~10 options at a time.
    const filterInput =
      control.querySelector?.("input[role='combobox'], input[type='text']") ??
      document.activeElement;
    if (filterInput && filterInput.tagName === "INPUT") {
      try {
        await surface.fill(filterInput, optionText);
        await sleep(250); // let the filter re-render
      } catch {
        /* fall through to non-filtered search */
      }
    }

    // Find option whose visible text matches target. Look across the
    // whole document because React-Select portals the menu to body.
    function findOptions() {
      return Array.from(
        document.querySelectorAll(
          "[role='option'], [class*='option' i]:not([class*='disabled' i])",
        ),
      ).filter((o) => {
        const r = o.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
    }
    let optionEls = findOptions();
    let match = optionEls.find(
      (o) => (o.textContent ?? "").trim().toLowerCase() === target,
    );
    // If exact match isn't visible yet, give the menu another beat.
    if (!match) {
      await sleep(200);
      optionEls = findOptions();
      match = optionEls.find(
        (o) => (o.textContent ?? "").trim().toLowerCase() === target,
      );
    }
    if (match) {
      match.click();
      await sleep(150);
      return { ok: true };
    }
    // Try partial match before giving up
    const partial = optionEls.find((o) =>
      (o.textContent ?? "").trim().toLowerCase().includes(target),
    );
    if (partial) {
      partial.click();
      await sleep(150);
      return { ok: true, partial: true };
    }
    // Close menu by pressing Escape
    document.body.click();
    return { ok: false, reason: `option "${optionText}" not visible after filter` };
  }

  async function executeAction(action) {
    const { fieldName, action: kind, coord, value, reason } = action;
    const result = {
      fieldName,
      action: kind,
      value,
      reason,
      status: "skipped",
      detail: "",
    };

    if (kind === "abstain") {
      result.status = "abstained";
      result.detail = reason ?? "(no reason)";
      return result;
    }

    if (!coord || typeof coord.x !== "number" || typeof coord.y !== "number") {
      result.status = "bad_coord";
      result.detail = "coord missing or invalid";
      return result;
    }

    const el = findFormElementAt(coord.x, coord.y);
    if (!el) {
      result.status = "not_found";
      result.detail = `nothing at (${coord.x}, ${coord.y}) — viewport=${window.innerWidth}x${window.innerHeight} dpr=${window.devicePixelRatio}`;
      console.warn(`[Onbehalf] ${fieldName}: not_found at (${coord.x}, ${coord.y})`);
      return result;
    }
    result.detail = `${el.tagName.toLowerCase()}${el.name ? `[name=${el.name}]` : ""}${el.id ? `#${el.id}` : ""}`;
    console.log(`[Onbehalf] ${fieldName}: hit ${result.detail} at (${coord.x}, ${coord.y})`);

    try {
      if (kind === "type") {
        // If we landed on a combobox by mistake, the type intent is
        // probably wrong — fail loud rather than typing garbage.
        if (isComboboxLike(el)) {
          result.status = "wrong_action";
          result.detail = `type at (${coord.x}, ${coord.y}) hit a dropdown — Claude probably meant 'select'`;
          return result;
        }
        if (typeof value !== "string") {
          result.status = "bad_value";
          return result;
        }
        await doType(el, value);
        result.status = "filled";
        return result;
      }
      if (kind === "select") {
        if (typeof value !== "string") {
          result.status = "bad_value";
          return result;
        }
        const r = await doSelect(el, value);
        result.status = r.ok ? (r.partial ? "filled_partial" : "filled") : "option_not_found";
        if (!r.ok && r.reason) result.detail += ` — ${r.reason}`;
        return result;
      }
      if (kind === "click" || kind === "check") {
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

  async function executePlan(plan) {
    // Snapshot the scroll position at plan start. Claude's coordinates
    // are viewport-relative to this scroll position. If anything
    // (focus event, React-Select menu, validation banner) shifts the
    // viewport between actions, we restore the original scroll so
    // every elementFromPoint hit is on the geometry Claude analyzed.
    const baseScrollX = window.scrollX;
    const baseScrollY = window.scrollY;

    const results = [];
    for (const action of plan) {
      if (window.scrollX !== baseScrollX || window.scrollY !== baseScrollY) {
        window.scrollTo(baseScrollX, baseScrollY);
        await sleep(50);
      }
      const r = await executeAction(action);
      results.push(r);
      await sleep(120);
    }
    const summary = {
      total: results.length,
      filled: results.filter((r) => r.status === "filled" || r.status === "filled_partial").length,
      abstained: results.filter((r) => r.status === "abstained").length,
      notFound: results.filter((r) => r.status === "not_found").length,
      errored: results.filter((r) => r.status === "errored" || r.status === "bad_coord" || r.status === "wrong_action").length,
    };
    return { results, summary };
  }

  window.__onbehalfExecutePlan = executePlan;
})();
