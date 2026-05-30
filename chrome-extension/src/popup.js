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

async function send(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (resp) => resolve(resp ?? { ok: false }));
  });
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

async function tellTab(tab, msg) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tab.id, msg, (resp) => resolve(resp ?? { ok: false }));
  });
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
  $("run-fill").onclick = runFill;
  $("run-vision-dryrun").onclick = () => runVisionFill({ dryRun: true });
  $("run-vision-real").onclick = () => runVisionFill({ dryRun: false });
}

async function runVisionFill({ dryRun }) {
  if (!cachedJob || cachedTabId == null) return;
  show("state-loading");

  const planResp = await send({
    type: "COMPUTER_USE_PLAN",
    payload: { applicationId: cachedJob.application.id, dryRun },
  });
  if (!planResp?.ok || !planResp.body?.plan) {
    setError(planResp?.body?.error ?? "Vision plan failed.");
    return;
  }
  const plan = planResp.body.plan;
  const cost = planResp.body.tokenCost ?? 0;

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
    li.textContent = `[${item.status}] ${item.targetLabel}: ${String(item.value ?? "—").slice(0, 50)}`;
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
