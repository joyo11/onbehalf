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
      resume: cachedJob.resume,
      coverLetter: cachedJob.coverLetter,
    },
  });

  if (!resp?.ok || !resp.result) {
    setError(resp?.error ?? "Fill failed.");
    return;
  }

  $("filled-list").innerHTML = "";
  for (const f of resp.result.filled) {
    const li = document.createElement("li");
    li.textContent = `${f.field}: ${String(f.value).slice(0, 40)}`;
    $("filled-list").appendChild(li);
  }
  $("skipped-line").textContent =
    resp.result.skipped.length > 0
      ? `Skipped: ${resp.result.skipped.join(", ")}`
      : "All known fields filled.";

  show("state-filled");
  $("approve-submit").onclick = () => clickSubmit(tab, resp.result.submitButtonFound);
  $("cancel-fill").onclick = () => window.close();
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
