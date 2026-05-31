/**
 * Phase 8 — DOM form walker.
 *
 * Reads the page once and returns a structured inventory:
 *   {
 *     fields: [
 *       { id, label, type, options?, required?, placeholder?, hint? }
 *     ],
 *     refs: { [id]: element }
 *   }
 *
 * `fields` is sent to the server. `refs` stays in the page so the
 * filler can look back the element when Claude returns its answers.
 *
 * Coverage:
 *   - <input type=text|email|tel|url|search|number> + textareas
 *   - <select> (native)
 *   - radio groups (collapsed to one logical field per name)
 *   - <input type=checkbox>
 *   - React-Select widgets (Greenhouse + most ATSes)
 *   - <input type=file> (labeled as "file" so the LLM can skip)
 *
 * Excluded:
 *   - type=hidden, name='honeypot', visibility:hidden, display:none
 *   - elements with zero size
 *   - duplicate radio buttons in a group (only one entry per group)
 *
 * Label extraction priority:
 *   1. <label for="X"> when control has id=X
 *   2. closest ancestor <label> wrapping the control
 *   3. nearest preceding <label> sibling text
 *   4. aria-label / aria-labelledby
 *   5. placeholder (last resort)
 */

(function () {
  function isHidden(el) {
    if (!el || !el.getBoundingClientRect) return true;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return true;
    const style = window.getComputedStyle(el);
    if (style.display === "none") return true;
    if (style.visibility === "hidden") return true;
    if (style.opacity === "0") return true;
    return false;
  }

  function cleanText(s) {
    return (s ?? "")
      .replace(/\s+/g, " ")
      .replace(/[*✱✶★]/g, "")
      .trim();
  }

  function labelFor(el) {
    // 1. <label for="id">
    if (el.id) {
      try {
        const lbl = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (lbl) {
          const t = cleanText(lbl.textContent);
          if (t) return t;
        }
      } catch {
        /* ignore selector errors */
      }
    }
    // 2. ancestor <label>
    const ancestorLabel = el.closest?.("label");
    if (ancestorLabel) {
      const t = cleanText(ancestorLabel.textContent);
      if (t) return t;
    }
    // 3. preceding <label> within the same field wrapper
    const wrapper =
      el.closest?.(
        "div.field, .form-field, .application-question, [class*='field' i], .form-group, .input-group, [class*='question' i]",
      ) ?? el.parentElement;
    if (wrapper) {
      const lbl = wrapper.querySelector("label");
      if (lbl) {
        const t = cleanText(lbl.textContent);
        if (t) return t;
      }
      // For React-Select: a div with text immediately before the control
      const labelDiv = wrapper.querySelector(
        "[class*='label' i]:not([class*='placeholder' i]):not([class*='select' i])",
      );
      if (labelDiv) {
        const t = cleanText(labelDiv.textContent);
        if (t) return t;
      }
    }
    // 4. aria
    const aria = el.getAttribute?.("aria-label");
    if (aria) {
      const t = cleanText(aria);
      if (t) return t;
    }
    const ariaby = el.getAttribute?.("aria-labelledby");
    if (ariaby) {
      const ids = ariaby.split(/\s+/);
      const parts = ids
        .map((id) => document.getElementById(id)?.textContent ?? "")
        .filter(Boolean);
      if (parts.length) {
        const t = cleanText(parts.join(" "));
        if (t) return t;
      }
    }
    // 5. placeholder
    const ph = el.getAttribute?.("placeholder");
    if (ph) {
      const t = cleanText(ph);
      if (t) return t;
    }
    return "";
  }

  function isRequired(el) {
    if (el.required === true) return true;
    if (el.getAttribute?.("aria-required") === "true") return true;
    // Greenhouse marks required with a star in the label text
    const lbl = el.id
      ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`)
      : el.closest?.("label");
    const t = lbl?.textContent ?? "";
    if (/\*/.test(t)) return true;
    return false;
  }

  function nativeSelectOptions(el) {
    return Array.from(el.options || [])
      .map((o) => cleanText(o.text))
      .filter((s) => s && s.toLowerCase() !== "select..." && !/^---/.test(s));
  }

  function reactSelectOptions(controlEl) {
    // React-Select renders options to a portal AFTER click. We can't
    // know the full list without opening the menu. We probe by clicking,
    // reading the options, then closing — but that breaks the user's
    // focus and the menu can flash visually. Skip pre-extraction for
    // React-Selects; the server prompt understands that and Claude
    // is told to use the option's expected text (e.g., "Male", "United
    // States") so the filler does a fuzzy/typed match at click time.
    return [];
  }

  /**
   * Best-effort hint scraping for free-text fields. Some forms put
   * helper text below an input ("e.g., LinkedIn URL") — capturing
   * that helps Claude disambiguate. Keep short (<120 chars).
   */
  function hintFor(el) {
    const wrapper =
      el.closest?.(
        "div.field, .form-field, .application-question, [class*='field' i], .form-group, .input-group, [class*='question' i]",
      ) ?? el.parentElement;
    if (!wrapper) return "";
    const hintEl = wrapper.querySelector(
      ".help, .hint, .description, [class*='help' i], [class*='hint' i], small",
    );
    if (!hintEl) return "";
    const t = cleanText(hintEl.textContent);
    return t.length > 120 ? t.slice(0, 120) + "…" : t;
  }

  function walkForm() {
    const fields = [];
    const refs = {};
    let counter = 0;
    const nextId = () => `field_${counter++}`;

    // 1. Text-like inputs + textarea
    const textSelectors = [
      "input[type='text']",
      "input[type='email']",
      "input[type='tel']",
      "input[type='url']",
      "input[type='search']",
      "input[type='number']",
      "input:not([type])",
      "textarea",
    ].join(", ");
    const textEls = Array.from(document.querySelectorAll(textSelectors)).filter(
      (el) =>
        !isHidden(el) &&
        el.type !== "hidden" &&
        !/honeypot/i.test(el.name ?? "") &&
        !/honeypot/i.test(el.id ?? "") &&
        // Skip the search input that React-Select uses internally —
        // those have role=combobox or live inside a select__control.
        el.getAttribute("role") !== "combobox" &&
        !el.closest?.("[class*='select__control' i], [class*='Select__control' i]"),
    );
    for (const el of textEls) {
      const label = labelFor(el);
      if (!label) continue; // unlabeled input we can't reason about
      const id = nextId();
      refs[id] = el;
      fields.push({
        id,
        label,
        type:
          el.tagName === "TEXTAREA"
            ? "textarea"
            : el.type === "email"
              ? "email"
              : el.type === "tel"
                ? "tel"
                : el.type === "url"
                  ? "url"
                  : "text",
        required: isRequired(el),
        placeholder: el.getAttribute?.("placeholder") || undefined,
        hint: hintFor(el) || undefined,
      });
    }

    // 2. Native <select>
    const selectEls = Array.from(document.querySelectorAll("select")).filter(
      (el) => !isHidden(el),
    );
    for (const el of selectEls) {
      const label = labelFor(el);
      if (!label) continue;
      const id = nextId();
      refs[id] = el;
      fields.push({
        id,
        label,
        type: "select",
        options: nativeSelectOptions(el),
        required: isRequired(el),
      });
    }

    // 3. React-Select controls (Greenhouse + most ATSes)
    const rsEls = Array.from(
      document.querySelectorAll(
        "[class*='select__control' i], [class*='Select__control' i]",
      ),
    ).filter((el) => !isHidden(el));
    const seenRs = new Set();
    for (const el of rsEls) {
      if (seenRs.has(el)) continue;
      seenRs.add(el);
      const label = labelFor(el);
      if (!label) continue;
      const id = nextId();
      refs[id] = el;
      fields.push({
        id,
        label,
        type: "react-select",
        options: reactSelectOptions(el),
        required: isRequired(el),
        hint: "Options not listed because React-Select renders lazily. Pick the EXACT option string the form would use (e.g., 'United States', 'Male', 'I am not a protected veteran').",
      });
    }

    // 4. Radio groups — collapse to one field per name attribute
    const radioEls = Array.from(
      document.querySelectorAll("input[type='radio']"),
    ).filter((el) => !isHidden(el));
    const radioByName = new Map();
    for (const el of radioEls) {
      const name = el.name || el.getAttribute("name");
      if (!name) continue;
      if (!radioByName.has(name)) radioByName.set(name, []);
      radioByName.get(name).push(el);
    }
    for (const [name, group] of radioByName.entries()) {
      // Use the fieldset legend or the first input's group label
      const first = group[0];
      const fieldset = first.closest?.("fieldset");
      let label = "";
      if (fieldset) {
        const legend = fieldset.querySelector("legend");
        if (legend) label = cleanText(legend.textContent);
      }
      if (!label) {
        const groupWrap = first.closest?.(
          ".form-field, .application-question, [class*='field' i], [class*='question' i]",
        );
        if (groupWrap) {
          const groupLabel = groupWrap.querySelector("label, [class*='label' i]");
          if (groupLabel && !group.includes(groupLabel)) {
            label = cleanText(groupLabel.textContent);
          }
        }
      }
      if (!label) label = name;
      const options = group.map((opt) => {
        const optLbl =
          opt.id && document.querySelector(`label[for="${CSS.escape(opt.id)}"]`)?.textContent;
        return cleanText(optLbl || opt.value || opt.parentElement?.textContent || "");
      });
      const id = nextId();
      refs[id] = { __radioGroup: true, name, elements: group };
      fields.push({
        id,
        label,
        type: "radio",
        options: options.filter(Boolean),
        required: group.some((g) => isRequired(g)),
      });
    }

    // 5. Standalone checkboxes (not in a radio-like group)
    const checkEls = Array.from(
      document.querySelectorAll("input[type='checkbox']"),
    ).filter((el) => !isHidden(el));
    for (const el of checkEls) {
      const label = labelFor(el);
      if (!label) continue;
      const id = nextId();
      refs[id] = el;
      fields.push({
        id,
        label,
        type: "checkbox",
        required: isRequired(el),
      });
    }

    // 6. File inputs — classify as resume / cover-letter / generic so
    // the executor knows what to upload after the LLM answers come back.
    // Don't filter by visibility — ATSes routinely hide the real <input>
    // behind a styled Attach button (the input is display:none but still
    // accepts a FileList via DataTransfer).
    const fileEls = Array.from(document.querySelectorAll("input[type='file']"));
    console.log(`[Onbehalf walker] found ${fileEls.length} file input(s) total`);
    for (const el of fileEls) {
      const label = labelFor(el) || "File";
      let subtype = "file";
      if (/resume|cv|curriculum/i.test(label)) subtype = "file_resume";
      else if (/cover.*letter/i.test(label)) subtype = "file_cover_letter";
      const id = nextId();
      refs[id] = el;
      fields.push({
        id,
        label,
        type: subtype,
        required: isRequired(el),
      });
      console.log(`[Onbehalf walker] file input → ${subtype} · label="${label}"`);
    }

    return { fields, refs };
  }

  window.__onbehalfWalkForm = walkForm;
})();
