/**
 * Onbehalf — in-page overlay.
 *
 * Runs on every Greenhouse / Lever / Ashby URL. On load asks the
 * background "is there a queued application matching this URL?"
 *   - yes → mounts a Shadow-DOM card top-right of the viewport
 *   - no  → stays silent (nothing rendered)
 *
 * The card shows the queued role + company + match score, a single
 * primary button "Fill on your behalf", and after fill: a per-field
 * status list + a "Review on page → Submit" CTA that closes the
 * card. The user dismisses with ✕ (suppresses for the tab) or
 * minimizes with ─ (collapses to a chip).
 *
 * Shadow DOM isolates styles so the page's CSS can't bleed in, and
 * z-index is set to int32 max so it sits above page modals.
 */

(function () {
  if (window.__onbehalfOverlayMounted) return;
  window.__onbehalfOverlayMounted = true;

  const HOST_ID = "__onbehalf_overlay_host__";
  const HIDDEN_KEY = "__onbehalf_overlay_hidden_for_session__";

  if (sessionStorage.getItem(HIDDEN_KEY) === "1") return;

  let host = null;
  let shadow = null;
  let state = "loading"; // loading | ready | filling | filled | error | minimized
  let job = null;
  let lastResult = null;

  function send(msg) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(msg, (resp) => {
          const lastErr = chrome.runtime.lastError;
          if (lastErr) {
            resolve({ ok: false, body: { error: lastErr.message } });
            return;
          }
          resolve(resp ?? { ok: false, body: { error: "no response" } });
        });
      } catch (e) {
        resolve({ ok: false, body: { error: e?.message ?? "send threw" } });
      }
    });
  }

  function mountHost() {
    host = document.createElement("div");
    host.id = HOST_ID;
    host.style.cssText = `
      all: initial;
      position: fixed;
      top: 16px;
      right: 16px;
      z-index: 2147483647;
      font-family: system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif;
    `;
    document.documentElement.appendChild(host);
    shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = SHADOW_CSS;
    shadow.appendChild(style);
    const root = document.createElement("div");
    root.className = "card";
    root.id = "onbehalf-root";
    shadow.appendChild(root);
    return root;
  }

  const SHADOW_CSS = `
    :host, * { box-sizing: border-box; }
    .card {
      width: 360px;
      max-height: calc(100vh - 32px);
      overflow: auto;
      background: #F3EFE6;
      color: #1B1B19;
      border: 1px solid #E5E0D2;
      border-radius: 14px;
      box-shadow: 0 12px 32px -8px rgba(20, 18, 12, 0.18);
      padding: 18px 18px 16px;
      font: 14px/1.45 system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
    }
    .chip {
      width: auto;
      min-width: 0;
      padding: 8px 14px 8px 12px;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
    }
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 10px;
    }
    .wordmark {
      font-family: Georgia, "Times New Roman", serif;
      font-size: 17px;
      font-weight: 600;
      letter-spacing: -0.01em;
      color: #1B1B19;
    }
    .nav {
      display: flex;
      gap: 4px;
    }
    .iconbtn {
      width: 26px;
      height: 26px;
      border: 1px solid transparent;
      border-radius: 8px;
      background: transparent;
      color: #6B6960;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      line-height: 1;
      padding: 0;
    }
    .iconbtn:hover { background: rgba(20, 18, 12, 0.05); color: #1B1B19; }
    .role {
      font-family: Georgia, "Times New Roman", serif;
      font-size: 19px;
      line-height: 1.2;
      letter-spacing: -0.01em;
      font-weight: 500;
      margin-top: 6px;
      margin-bottom: 4px;
    }
    .sub {
      font-size: 13px;
      color: #6B6960;
      margin-bottom: 16px;
    }
    .primary {
      width: 100%;
      padding: 11px 14px;
      border: 1px solid #1B1B19;
      background: #1B1B19;
      color: #F3EFE6;
      border-radius: 10px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.12s;
    }
    .primary:hover { background: #000; }
    .primary:disabled { opacity: 0.6; cursor: default; }
    .ghost {
      width: 100%;
      padding: 11px 14px;
      border: 1px solid #D9D3C2;
      background: transparent;
      color: #1B1B19;
      border-radius: 10px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
    }
    .ghost:hover { border-color: #1B1B19; }
    .footnote {
      font-size: 12.5px;
      color: #6B6960;
      margin-top: 12px;
      line-height: 1.45;
    }
    .progress {
      height: 4px;
      background: #E5E0D2;
      border-radius: 999px;
      overflow: hidden;
      margin: 10px 0 14px;
    }
    .progress > .bar {
      height: 100%;
      background: #2D5F4A;
      transition: width 0.4s ease;
    }
    .summary-line {
      font-family: Georgia, "Times New Roman", serif;
      font-size: 17px;
      font-weight: 500;
      letter-spacing: -0.005em;
      margin: 6px 0;
    }
    .field-list {
      list-style: none;
      margin: 0 0 14px;
      padding: 0;
      font-size: 13px;
    }
    .field-list li {
      padding: 4px 0;
      border: 0;
      color: #1B1B19;
      display: grid;
      grid-template-columns: 16px 1fr;
      gap: 8px;
      align-items: baseline;
    }
    .field-list li .mark { color: #6B6960; font-family: Georgia, serif; }
    .field-list li.skip { color: #6B6960; }
    .field-list li.skip .mark { color: #B7B1A0; }
    .field-list li.err { color: #8B2A1E; }
    .field-list li.err .mark { color: #8B2A1E; }
    .field-list li.fill .mark { color: #2D5F4A; }
    .more {
      font-size: 12.5px;
      color: #6B6960;
      margin-top: 2px;
      padding-left: 24px;
    }
    .err-banner {
      background: #F8EFEC;
      border: 1px solid #E6CFC8;
      color: #8B2A1E;
      padding: 9px 11px;
      border-radius: 8px;
      font-size: 13px;
      margin: 8px 0 12px;
    }
  `;

  function unmount() {
    if (host && host.parentNode) host.parentNode.removeChild(host);
    host = null;
    shadow = null;
  }

  function dismissForSession() {
    sessionStorage.setItem(HIDDEN_KEY, "1");
    unmount();
  }

  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "style" && typeof v === "object") Object.assign(node.style, v);
      else if (k.startsWith("on") && typeof v === "function") {
        node.addEventListener(k.slice(2).toLowerCase(), v);
      } else if (k === "className") node.className = v;
      else if (v !== false && v != null) node.setAttribute(k, v);
    }
    for (const c of children.flat()) {
      if (c == null || c === false) continue;
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    }
    return node;
  }

  function renderHeader(includeNav) {
    return el(
      "div",
      { className: "header" },
      el("span", { className: "wordmark" }, "Onbehalf"),
      includeNav
        ? el(
            "div",
            { className: "nav" },
            el(
              "button",
              {
                className: "iconbtn",
                title: "Minimize",
                onClick: () => {
                  state = "minimized";
                  renderChip();
                },
              },
              "─",
            ),
            el(
              "button",
              {
                className: "iconbtn",
                title: "Dismiss for this tab",
                onClick: dismissForSession,
              },
              "✕",
            ),
          )
        : null,
    );
  }

  function renderChip() {
    const root = shadow.getElementById("onbehalf-root");
    root.className = "card chip";
    root.innerHTML = "";
    const btn = el(
      "button",
      {
        className: "iconbtn",
        title: "Open Onbehalf",
        onClick: () => {
          state = lastResult ? "filled" : "ready";
          if (state === "filled") renderFilled(lastResult);
          else renderReady();
        },
      },
      "↗",
    );
    root.appendChild(el("span", { className: "wordmark" }, "Onbehalf"));
    root.appendChild(btn);
  }

  function renderReady() {
    if (!shadow) return;
    const root = shadow.getElementById("onbehalf-root");
    root.className = "card";
    root.innerHTML = "";
    root.appendChild(renderHeader(true));
    root.appendChild(
      el("div", { className: "role" }, job?.application?.title || "Queued application"),
    );
    const matchPct =
      typeof job?.application?.matchScore === "number" && job.application.matchScore > 0
        ? `${job.application.matchScore}% match`
        : null;
    root.appendChild(
      el(
        "div",
        { className: "sub" },
        job?.application?.company || "",
        matchPct ? ` · ${matchPct}` : "",
      ),
    );
    root.appendChild(
      el(
        "button",
        {
          className: "primary",
          onClick: runFill,
        },
        "Fill on your behalf",
      ),
    );
    root.appendChild(
      el(
        "div",
        { className: "footnote" },
        "Resume + cover letter included. Roughly $0.005 per application. We stop at submit — you review and click yourself.",
      ),
    );
  }

  function renderFilling(text) {
    if (!shadow) return;
    const root = shadow.getElementById("onbehalf-root");
    root.className = "card";
    root.innerHTML = "";
    root.appendChild(renderHeader(false));
    root.appendChild(el("div", { className: "summary-line" }, text || "Loading…"));
    root.appendChild(
      el(
        "div",
        { className: "progress" },
        el("div", { className: "bar", style: { width: "35%" } }),
      ),
    );
  }

  function statusToClass(s) {
    if (s === "filled" || s === "filled_partial") return "fill";
    if (s === "skipped") return "skip";
    return "err";
  }

  function statusToMark(s) {
    if (s === "filled" || s === "filled_partial") return "✓";
    if (s === "skipped") return "—";
    return "✗";
  }

  function renderFilled(payload) {
    if (!shadow) return;
    lastResult = payload;
    const root = shadow.getElementById("onbehalf-root");
    root.className = "card";
    root.innerHTML = "";
    root.appendChild(renderHeader(true));
    const r = payload.result;
    const cost = payload.cost ?? 0;
    const total = r.summary.total || 0;
    const filled = r.summary.filled || 0;
    const pct = total > 0 ? Math.round((filled / total) * 100) : 0;
    root.appendChild(
      el(
        "div",
        { className: "summary-line" },
        `${filled} of ${total} done · $${cost.toFixed(3)}`,
      ),
    );
    root.appendChild(
      el(
        "div",
        { className: "progress" },
        el("div", { className: "bar", style: { width: pct + "%" } }),
      ),
    );
    // Upload status as its own row if we did one
    if (payload.upload) {
      const u = payload.upload;
      const resTag = u.resume?.status === "filled" ? "✓" : "—";
      const covTag = u.coverLetter?.status === "filled" ? "✓" : "—";
      const resClass = u.resume?.status === "filled" ? "fill" : "skip";
      const covClass = u.coverLetter?.status === "filled" ? "fill" : "skip";
      const ul = el("ul", { className: "field-list" });
      ul.appendChild(
        el(
          "li",
          { className: resClass },
          el("span", { className: "mark" }, resTag),
          el("span", null, "Resume"),
        ),
      );
      ul.appendChild(
        el(
          "li",
          { className: covClass },
          el("span", { className: "mark" }, covTag),
          el("span", null, "Cover letter"),
        ),
      );
      root.appendChild(ul);
    }

    // Top 10 results from Claude's fill
    const items = (r.results || []).slice(0, 10);
    const ul = el("ul", { className: "field-list" });
    for (const it of items) {
      const cls = statusToClass(it.status);
      const mark = statusToMark(it.status);
      const valuePreview =
        it.action === "skip"
          ? `${it.label} · ${(it.reason ?? "skipped").slice(0, 32)}`
          : `${it.label}`;
      const li = el(
        "li",
        { className: cls, title: `${it.action} · ${it.confidence ?? ""} · ${it.detail ?? ""}` },
        el("span", { className: "mark" }, mark),
        el("span", null, valuePreview),
      );
      ul.appendChild(li);
    }
    root.appendChild(ul);
    if ((r.results?.length ?? 0) > 10) {
      root.appendChild(el("div", { className: "more" }, `+ ${r.results.length - 10} more`));
    }
    root.appendChild(
      el(
        "button",
        {
          className: "ghost",
          onClick: () => {
            // Scroll to first not-filled-required field on the page
            scrollToFirstUnfilledRequired();
          },
        },
        "Review on page → Submit",
      ),
    );
  }

  function renderError(msg) {
    if (!shadow) return;
    const root = shadow.getElementById("onbehalf-root");
    root.className = "card";
    root.innerHTML = "";
    root.appendChild(renderHeader(true));
    root.appendChild(el("div", { className: "err-banner" }, msg || "Something went wrong."));
    root.appendChild(
      el(
        "button",
        {
          className: "primary",
          onClick: () => {
            renderReady();
          },
        },
        "Try again",
      ),
    );
  }

  function scrollToFirstUnfilledRequired() {
    const fields = Array.from(
      document.querySelectorAll(
        "input[type='text'], input[type='email'], input[type='tel'], input[type='url'], textarea, [class*='select__control' i], select",
      ),
    );
    for (const f of fields) {
      const r = f.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (f.tagName === "INPUT" || f.tagName === "TEXTAREA") {
        if ((f.value || "").trim().length > 0) continue;
      } else if (f.tagName === "SELECT") {
        if (f.value && f.value.length > 0) continue;
      } else {
        if (!f.querySelector("[class*='placeholder' i]")) continue;
      }
      const required = f.required || f.getAttribute?.("aria-required") === "true";
      const lblTxt = (f.id ? document.querySelector(`label[for="${CSS.escape(f.id)}"]`)?.textContent : "") || "";
      const starred = /\*\s*$/.test(lblTxt);
      if (!required && !starred) continue;
      f.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
  }

  async function runFill() {
    if (!job) return;
    state = "filling";
    renderFilling("Loading…");

    // Stage 0 — file uploads via proven greenhouse.js path
    try {
      if (window.__onbehalfUploadFilesOnly) {
        await window.__onbehalfUploadFilesOnly({
          resume: job.resume ?? null,
          coverLetter: job.coverLetter ?? null,
        });
      }
    } catch (e) {
      console.warn("[Onbehalf overlay] upload stage threw:", e);
    }

    // Stage 1 — walk fields
    if (!window.__onbehalfWalkForm) {
      renderError("Field walker isn't loaded on this page.");
      return;
    }
    let inventory;
    try {
      inventory = window.__onbehalfWalkForm();
    } catch (e) {
      renderError(`Walker threw: ${e?.message ?? "unknown"}`);
      return;
    }
    if (!inventory.fields || inventory.fields.length === 0) {
      renderError("No fillable fields found on this page.");
      return;
    }

    // Stage 2 — Claude. Send through background to avoid CORS.
    const apiResp = await send({
      type: "AUTO_FILL_API",
      payload: {
        applicationId: job.application.id,
        fields: inventory.fields,
      },
    });
    if (!apiResp?.ok) {
      renderError(apiResp?.body?.error ?? "Server call failed.");
      return;
    }
    const { answers, coverLetterText, resumePdfBase64, resumeFileName, tokenCost } = apiResp.body;

    // Stage 3 — execute on the page
    if (!window.__onbehalfExecuteAnswers) {
      renderError("Auto-fill executor isn't loaded.");
      return;
    }
    let result;
    try {
      result = await window.__onbehalfExecuteAnswers(answers, inventory.refs, inventory.fields, {
        coverLetterText,
        resumePdfBase64,
        resumeFileName,
      });
    } catch (e) {
      renderError(`Filler threw: ${e?.message ?? "unknown"}`);
      return;
    }

    state = "filled";
    renderFilled({
      result,
      cost: tokenCost ?? 0,
      upload: {
        resume: { status: result.results.find((r) => r.label?.match(/resume|cv/i) && r.status === "filled") ? "filled" : "skipped" },
        coverLetter: { status: result.results.find((r) => r.label?.match(/cover.*letter/i) && r.status === "filled") ? "filled" : "skipped" },
      },
    });
  }

  async function init() {
    // Ask background: is there a queued application for this URL?
    const resp = await send({ type: "NEXT_JOB_FOR_URL", url: location.href });
    if (!resp?.ok || !resp.body?.match) return; // silent
    job = resp.body;
    mountHost();
    state = "ready";
    renderReady();
  }

  // Wait briefly so the page's React form gets a chance to mount before
  // we sample window.location / look for queued applications.
  setTimeout(init, 400);
})();
