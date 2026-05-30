/**
 * Onbehalf — background service worker.
 *
 * Responsibilities (Phase 2 scaffold, will grow in Phase 4):
 *   - Hold the API base URL (configurable via storage for dev)
 *   - Mediate fetch() calls from content scripts to our API. The
 *     extension has host_permissions for onbehalfai.vercel.app so
 *     fetch with `credentials: 'include'` sends the user's Clerk
 *     session cookie automatically — no token paste required.
 *   - Route messages between content scripts and the popup.
 *
 * No fill logic lives here. The content script does the DOM work;
 * this worker is a thin router.
 */

const DEFAULT_API_BASE = "https://onbehalfai.vercel.app";

async function getApiBase() {
  const { apiBase } = await chrome.storage.sync.get(["apiBase"]);
  return apiBase || DEFAULT_API_BASE;
}

/**
 * Centralized fetch — every call uses `credentials: 'include'` so the
 * user's Clerk cookie rides along.
 */
async function api(path, init = {}) {
  const base = await getApiBase();
  const url = `${base}${path}`;
  const res = await fetch(url, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { _raw: text };
  }
  return { ok: res.ok, status: res.status, body };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || typeof msg !== "object") return false;

  // From popup / content script: "give me my account state"
  if (msg.type === "WHOAMI") {
    api("/api/extension/whoami").then(sendResponse);
    return true; // async response
  }

  // From popup: open the sign-in page in a new tab
  if (msg.type === "OPEN_SIGN_IN") {
    getApiBase().then((base) => {
      chrome.tabs.create({ url: `${base}/sign-in?from=extension` });
      sendResponse({ ok: true });
    });
    return true;
  }

  // From content script: ask the server for the next queued application
  // for this user that's pointed at the current tab's URL. Used in
  // Phase 4 — stubbed here so the wiring is in place.
  if (msg.type === "NEXT_JOB_FOR_URL") {
    api(`/api/extension/next-job?url=${encodeURIComponent(msg.url)}`).then(sendResponse);
    return true;
  }

  // From content script: report fill result + screenshot back to the
  // server for the gate decision. Phase 4 wiring.
  if (msg.type === "REPORT_FILL_RESULT") {
    api(`/api/extension/screenshot`, {
      method: "POST",
      body: JSON.stringify(msg.payload),
    }).then(sendResponse);
    return true;
  }

  return false;
});
