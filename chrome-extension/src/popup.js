/**
 * Onbehalf popup driver — Phase 4 wired to the real endpoints.
 *
 * State machine:
 *   loading → signed-out                            (no Clerk cookie)
 *   loading → no-match                              (no queued job for this URL)
 *   loading → ready-to-fill                         (job + profile loaded)
 *   ready-to-fill → filled                          (after FILL_GREENHOUSE)
 *   filled → done                                   (user approved + extension clicked Submit)
 *   any state → error                               (anything threw)
 *
 * The actual fill click happens in the extension by directly clicking
 * the page's Submit button — no server-side browser at all.
 */

const $ = (id) => document.getElementById(id);
const STATES = ["state-loading", "state-signed-out", "state-no-match", "state-ready-to-fill", "state-filled", "state-error"];

function show(state) {
  for (const s of STATES) {
    $(s).classList.toggle("hidden", s !== state);
  }
}

function setError(text) {
  $("error-text").textContent = text;
  show("state-error");
}

function setLoadingText(text) {
  const el = $("loading-text") || $("state-loading");
  if (el) el.textContent = text;
}

async function send(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (resp) => {
      // Read lastError so Chrome doesn't log the noisy warning. We
      // treat any missing response as `{ ok: false }` with an error
      // message that points at the failure.
      const lastErr = chrome.runtime.lastError;
      if (lastErr) {
        resolve({
          ok: false,
          body: { error: `background bridge: ${lastErr.message}` },
        });
        return;
      }
      resolve(resp ?? { ok: false, body: { error: "no response" } });
    });
  });
}

async function tellTabSafe(tab, msg) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tab.id, msg, (resp) => {
      const lastErr = chrome.runtime.lastError;
      if (lastErr) {
        resolve({
          ok: false,
          error: `content-script bridge: ${lastErr.message}`,
        });
        return;
      }
      resolve(resp ?? { ok: false, error: "no response" });
    });
  });
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

async function tellTab(tab, msg) {
  return tellTabSafe(tab, msg);
}

let cachedJob = null;
let cachedTabId = null;

async function init() {
  show("state-loading");

  const who = await send({ type: "WHOAMI" });
  if (!who?.ok || !who.body?.signedIn) {
    show("state-signed-out");
    $("open-sign-in").onclick = () => send({ type: "OPEN_SIGN_IN" });
    return;
  }

  const tab = await getActiveTab();
  cachedTabId = tab?.id ?? null;

  // Ask the server: is there a queued application matching this URL?
  const nextJob = await send({ type: "NEXT_JOB_FOR_URL", url: tab?.url ?? "" });
  if (!nextJob?.ok) {
    setError("Couldn't reach the server. Check your connection.");
    return;
  }

  if (!nextJob.body?.match) {
    $("no-match-email").textContent = who.body.email ?? "signed in";
    $("no-match-status").textContent =
      nextJob.body?.message ?? "No queued application for this page.";
    show("state-no-match");
    $("open-dashboard-2").onclick = openDashboard;
    return;
  }

  cachedJob = nextJob.body;
  $("ready-job-title").textContent = cachedJob.application.title;
  $("ready-job-company").textContent = cachedJob.application.company;
  show("state-ready-to-fill");
  $("run-auto-fill").onclick = runAutoFill;
  $("run-fill").onclick = runFill;
  $("run-vision-real").onclick = () => runVisionFill({ dryRun: false });
}

/**
 * Phase 8 — DOM walk → one Claude call → fill via DOM.
 * The primary path. Cheap, fast, no screenshots.
 */
async function runAutoFill() {
  if (!cachedJob || cachedTabId == null) return;
  show("state-loading");
  setLoadingText("Reading the form…");
  const tab = { id: cachedTabId };

  // Stage 1: ask the content script to walk the form and return an
  // inventory of every field.
  const walkResp = await tellTab(tab, { type: "WALK_FORM" });
  if (!walkResp?.ok) {
    setError(walkResp?.error ?? "Couldn't read the form on this page.");
    return;
  }
  const fields = walkResp.fields ?? [];
  if (fields.length === 0) {
    setError("No fillable fields found on this page.");
    return;
  }
  console.log(`[Onbehalf] walker found ${fields.length} fields:`, fields);

  // Stage 2: send the inventory to the server. Claude returns one
  // answer per field. (The "N" below is whatever the walker found on
  // THIS particular form — dynamic, not hard-coded.)
  setLoadingText(`Sending all ${fields.length} fields on this form to Claude…`);
  let resp;
  try {
    const res = await fetch("https://onbehalfai.vercel.app/api/extension/auto-fill", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        applicationId: cachedJob.application.id,
        fields,
      }),
    });
    resp = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(resp?.error ?? `Server returned ${res.status}.`);
      return;
    }
  } catch (e) {
    setError(`Network error: ${e?.message ?? "unknown"}`);
    return;
  }
  const answers = resp.answers ?? [];
  const cost = resp.tokenCost ?? 0;
  console.log(`[Onbehalf] Claude returned ${answers.length} answers (cost $${cost.toFixed(4)}):`, answers);

  // Stage 3: hand the answers to the executor to apply via DOM.
  setLoadingText(`Filling ${answers.filter((a) => a.action !== "skip").length} fields…`);
  const execResp = await tellTab(tab, {
    type: "EXECUTE_ANSWERS",
    answers,
    inventory: fields,
    extras: {
      coverLetterText: resp.coverLetterText ?? null,
      resumePdfBase64: resp.resumePdfBase64 ?? null,
      resumeFileName: resp.resumeFileName ?? null,
    },
  });
  if (!execResp?.ok || !execResp.result) {
    setError(execResp?.error ?? "Filler threw.");
    return;
  }
  const r = execResp.result;

  // Render summary in the popup
  $("filled-list").innerHTML = "";
  const head = document.createElement("li");
  head.textContent =
    `${r.summary.filled}/${r.summary.total} filled · ${r.summary.skipped} skipped · ${r.summary.errored} errored · cost ~$${cost.toFixed(3)}`;
  head.style.fontWeight = "700";
  head.style.borderBottom = "0";
  $("filled-list").appendChild(head);

  // Show details for filled (high-confidence first) and skipped fields.
  // Cap at 18 lines so the popup stays readable.
  const interesting = r.results.slice(0, 18);
  for (const item of interesting) {
    const li = document.createElement("li");
    const tag =
      item.status === "filled"
        ? "✓"
        : item.status === "filled_partial"
          ? "≈"
          : item.status === "skipped"
            ? "—"
            : "✗";
    const valuePreview =
      item.action === "skip"
        ? `(${item.reason ?? "no data"})`
        : String(item.value ?? "—").slice(0, 50);
    li.textContent = `${tag} ${item.label || item.id}: ${valuePreview}`;
    li.style.fontWeight = "400";
    li.style.fontSize = "12px";
    li.title = `${item.action} · confidence: ${item.confidence ?? "?"} · ${item.reason ?? ""}`;
    $("filled-list").appendChild(li);
  }
  if (r.results.length > 18) {
    const li = document.createElement("li");
    li.textContent = `+ ${r.results.length - 18} more`;
    li.style.color = "var(--ink-mute)";
    $("filled-list").appendChild(li);
  }

  $("skipped-line").textContent =
    r.summary.errored > 0
      ? `${r.summary.errored} fields couldn't be filled — review on the page before submitting.`
      : "Review the form on the page, then approve to submit.";
  show("state-filled");
  $("approve-submit").onclick = () => clickSubmit(tab, true);
  $("cancel-fill").onclick = () => window.close();
}

async function runVisionFill({ dryRun }) {
  if (!cachedJob || cachedTabId == null) return;
  show("state-loading");

  // Bypass the background service worker for this API call. MV3
  // service workers can close the message port if the round-trip
  // takes >2-3s, which Vercel cold-starts comfortably do. The popup
  // shares the same Clerk cookie via credentials: 'include', so
  // direct fetch works the same way.
  let screenshotBase64 = null;
  let viewportWidth = null;
  let viewportHeight = null;
  if (!dryRun) {
    // First, scroll the form into view in the active tab. captureVisibleTab
    // grabs whatever's currently in viewport, so if the user scrolled past
    // the form (or popped the popup before the page fully painted), Claude
    // would see a near-blank screenshot and return a tiny plan. Scrolling
    // the first form input to the top guarantees the form is in frame.
    try {
      await chrome.scripting.executeScript({
        target: { tabId: cachedTabId },
        func: () => {
          const sel =
            "input[name='first_name'], input[autocomplete='given-name'], " +
            "input[type='email'], form input:not([type='hidden']), form textarea";
          const firstInput = document.querySelector(sel);
          if (firstInput) {
            firstInput.scrollIntoView({ behavior: "instant", block: "start" });
            window.scrollBy(0, -80); // leave the section heading visible above
          }
        },
      });
      await new Promise((r) => setTimeout(r, 250));
    } catch {
      // best-effort scroll, don't block the capture
    }

    const ssResp = await send({ type: "CAPTURE_TAB" });
    if (!ssResp?.ok) {
      setError(ssResp?.body?.error ?? "Couldn't capture the page screenshot.");
      return;
    }
    screenshotBase64 = ssResp.body.screenshot;
    viewportWidth = ssResp.body.viewportWidth;
    viewportHeight = ssResp.body.viewportHeight;
    console.log(
      `[Onbehalf] captured viewport ${viewportWidth}x${viewportHeight} (dpr=${ssResp.body.dpr ?? "?"}), screenshot bytes=${screenshotBase64?.length ?? 0}`,
    );
  }

  const path = dryRun
    ? "/api/extension/computer-use?dryRun=1"
    : "/api/extension/computer-use";

  let planData;
  try {
    const res = await fetch(`https://onbehalfai.vercel.app${path}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        applicationId: cachedJob.application.id,
        screenshotBase64,
        viewportWidth,
        viewportHeight,
        dryRun,
      }),
    });
    planData = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(planData?.error ?? `Server returned ${res.status}.`);
      return;
    }
  } catch (e) {
    setError(`Network error: ${e?.message ?? "unknown"}`);
    return;
  }

  if (!planData?.plan) {
    setError("Server returned no plan.");
    return;
  }
  const plan = planData.plan;
  const cost = planData.tokenCost ?? 0;

  console.log(`[Onbehalf] plan returned (${plan.length} actions, cost $${cost.toFixed(4)}):`, plan);
  setLoadingText(`Plan received (${plan.length} actions). Executing…`);
  const tab = { id: cachedTabId };
  const execResp = await tellTab(tab, { type: "EXECUTE_PLAN", plan });
  if (!execResp?.ok || !execResp.result) {
    setError(execResp?.error ?? "Plan executor failed.");
    return;
  }
  const r = execResp.result;

  $("filled-list").innerHTML = "";
  const head = document.createElement("li");
  head.textContent = dryRun
    ? `[DRY-RUN] Plan had ${r.summary.total}, executed ${r.summary.filled}.`
    : `Vision plan: ${r.summary.filled}/${r.summary.total} filled · ${r.summary.abstained} abstained · cost ~$${cost.toFixed(3)}`;
  head.style.fontWeight = "700";
  head.style.borderBottom = "0";
  $("filled-list").appendChild(head);
  for (const item of r.results.slice(0, 14)) {
    const li = document.createElement("li");
    const label = item.fieldName ?? item.targetLabel ?? "(unnamed)";
    li.textContent = `[${item.status}] ${label}: ${String(item.value ?? "—").slice(0, 50)}`;
    li.style.fontWeight = "400";
    li.style.fontSize = "12px";
    $("filled-list").appendChild(li);
  }
  $("skipped-line").textContent =
    r.summary.notFound > 0
      ? `${r.summary.notFound} fields the plan named couldn't be found on the page.`
      : "";
  show("state-filled");
  $("approve-submit").onclick = () => clickSubmit(tab, true);
  $("cancel-fill").onclick = () => window.close();
}

async function runFill() {
  if (!cachedJob || cachedTabId == null) return;
  show("state-loading");

  const tab = { id: cachedTabId };
  const resp = await tellTab(tab, {
    type: "FILL_GREENHOUSE",
    profile: {
      applicationId: cachedJob.application.id,
      firstName: cachedJob.profile.firstName,
      lastName: cachedJob.profile.lastName,
      email: cachedJob.profile.email,
      phone: cachedJob.profile.phone,
      linkedinUrl: cachedJob.profile.linkedinUrl,
      githubUrl: cachedJob.profile.githubUrl,
      portfolioUrl: cachedJob.profile.portfolioUrl,
      resume: cachedJob.resume,
      coverLetter: cachedJob.coverLetter,
    },
  });

  if (!resp?.ok || !resp.result) {
    setError(resp?.error ?? "Fill failed.");
    return;
  }

  // Total a quick filled count + a hint at how many need eyes.
  const filledCount = resp.result.filled.length;
  const skippedCount = resp.result.skipped.length;

  // Top message: "Filled N. K still need your eyes on the page."
  $("filled-list").innerHTML = "";
  const head = document.createElement("li");
  head.textContent = `Filled ${filledCount} field${filledCount === 1 ? "" : "s"}.`;
  head.style.fontWeight = "700";
  head.style.borderBottom = "0";
  $("filled-list").appendChild(head);
  for (const f of resp.result.filled.slice(0, 12)) {
    const li = document.createElement("li");
    li.textContent = `${f.field}`;
    li.style.fontWeight = "400";
    $("filled-list").appendChild(li);
  }
  if (filledCount > 12) {
    const li = document.createElement("li");
    li.textContent = `+ ${filledCount - 12} more`;
    li.style.color = "var(--ink-mute)";
    $("filled-list").appendChild(li);
  }

  $("skipped-line").textContent =
    skippedCount > 0
      ? `${skippedCount} field${skippedCount === 1 ? "" : "s"} need your eyes — review on the page before submitting.`
      : "All known fields filled. Review on the page before submitting.";

  show("state-filled");
  $("approve-submit").onclick = () => clickSubmit(tab, resp.result.submitButtonFound);
  $("cancel-fill").onclick = () => window.close();

  // Scroll the page to the first visibly-required field that's still
  // empty so the user can finish without hunting.
  scrollToFirstUnfilled(tab);
}

async function scrollToFirstUnfilled(tab) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const fields = Array.from(
          document.querySelectorAll(
            "input[type='text'], input:not([type]), textarea, [class*='select__control' i], select",
          ),
        );
        for (const el of fields) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          // For inputs: value still empty
          if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
            const val = (el).value ?? "";
            if (val.trim().length > 0) continue;
          } else if (el.tagName === "SELECT") {
            if ((el).value && (el).value.length > 0) continue;
          } else {
            // React-Select control — placeholder visible?
            if (!el.querySelector("[class*='placeholder' i]")) continue;
          }
          // Required signals
          const required = el.required ?? false;
          const ariaRequired = el.getAttribute && el.getAttribute("aria-required") === "true";
          const labelStar = (() => {
            const l = el.id ? document.querySelector(`label[for='${CSS.escape(el.id)}']`) : null;
            const t = l?.textContent ?? "";
            return /\*\s*$/.test(t);
          })();
          if (!required && !ariaRequired && !labelStar) continue;
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          return;
        }
      },
    });
  } catch {
    // best-effort scroll, don't fail the popup
  }
}

async function clickSubmit(tab, hasSubmit) {
  if (!hasSubmit) {
    setError("Couldn't locate the Submit button on this page.");
    return;
  }
  // Execute a tiny script in the tab to click the submit button.
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      const sel = [
        "button[type='submit']",
        "input[type='submit']",
        "button[aria-label*='submit' i]",
      ];
      for (const s of sel) {
        const candidates = Array.from(document.querySelectorAll(s));
        for (const el of candidates) {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.height > 0) {
            el.click();
            return true;
          }
        }
      }
      return false;
    },
  });
  window.close();
}

async function openDashboard() {
  const tabs = await chrome.tabs.query({});
  const existing = tabs.find((t) => t.url?.includes("onbehalfai.vercel.app"));
  if (existing) {
    chrome.tabs.update(existing.id, { active: true });
  } else {
    chrome.tabs.create({ url: "https://onbehalfai.vercel.app/dashboard" });
  }
}

init().catch((e) => setError(e?.message ?? "Popup init threw."));
