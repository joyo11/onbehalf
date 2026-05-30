/**
 * DOM implementation of the shared FillSurface interface.
 *
 * Pure browser code — runs in the content script's MAIN world via
 * scripting.executeScript. No imports, no bundler needed (V3 service
 * workers can dynamic-import ES modules, content scripts can't).
 *
 * Mirrors lib/submit/shared/fill-surface.ts's contract. If those
 * methods change, this file changes too — they're intentionally kept
 * in sync by hand for now (no shared type file, just discipline).
 *
 * React forms — and Greenhouse's are React forms — require dispatching
 * input/change events after value sets, otherwise the framework's
 * internal state doesn't notice. setNativeValue handles that.
 */

(function () {
  const DomSurface = {
    async $$(selector) {
      return Array.from(document.querySelectorAll(selector));
    },

    async isVisible(el) {
      if (!(el instanceof HTMLElement)) return false;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return false;
      const cs = window.getComputedStyle(el);
      return cs.display !== "none" && cs.visibility !== "hidden" && cs.opacity !== "0";
    },

    async click(el) {
      el.click();
    },

    async fill(el, value) {
      setNativeValue(el, value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    },

    async setFile(el, filename, bytes, mime) {
      const file = new File([bytes], filename, { type: mime || "application/octet-stream" });
      const dt = new DataTransfer();
      dt.items.add(file);
      el.files = dt.files;
      el.dispatchEvent(new Event("change", { bubbles: true }));
    },

    async getValue(el) {
      return el.value ?? "";
    },

    async getText(el) {
      return el.textContent?.trim() ?? "";
    },

    async labelFor(el) {
      if (el.id) {
        const l = document.querySelector(`label[for='${CSS.escape(el.id)}']`);
        if (l?.textContent) return l.textContent.trim().slice(0, 200);
      }
      const wrap = el.closest("label");
      if (wrap?.textContent) return wrap.textContent.trim().slice(0, 200);
      const aria = el.getAttribute("aria-label");
      if (aria) return aria.trim();
      let p = el.parentElement;
      for (let i = 0; i < 4 && p; i++) {
        const heading = p.querySelector("label, legend, .question, .label, h3, h4");
        if (heading?.textContent && heading.textContent.trim()) {
          return heading.textContent.trim().slice(0, 200);
        }
        p = p.parentElement;
      }
      return "";
    },

    async attr(el, name) {
      return el.getAttribute(name);
    },
  };

  // React tracks native input values via a hidden _valueTracker. Setting
  // .value directly bypasses the tracker, so the next dispatch event
  // doesn't trigger an onChange. Use the prototype setter so React notices.
  function setNativeValue(el, value) {
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) {
      setter.call(el, value);
    } else {
      el.value = value;
    }
  }

  // Expose globally so greenhouse.js can read it without an import.
  window.__onbehalfDomSurface = DomSurface;
})();
