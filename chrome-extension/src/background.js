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

  // Phase 6b — smart-fill batched Claude call for free-text fields.
  // payload = { applicationId, fields: [{selector, label, kind, ...}] }
  if (msg.type === "SMART_FILL") {
    api(`/api/extension/smart-fill`, {
      method: "POST",
      body: JSON.stringify(msg.payload),
    }).then(sendResponse);
    return true;
  }

  // Phase 6c — LLM-picked option from a real list (React-Select, native
  // select, radio group). payload = { applicationId, label, options[] }
  if (msg.type === "RESOLVE_FIELD") {
    api(`/api/extension/resolve-field`, {
      method: "POST",
      body: JSON.stringify(msg.payload),
    }).then(sendResponse);
    return true;
  }

  // Phase 7 — capture the visible tab as JPEG so the popup can include
  // it in a direct fetch to /api/extension/computer-use. Lives in
  // background because chrome.tabs.captureVisibleTab needs the
  // extension's privileged context. Returns inside ~200ms — well
  // under the message-port lifetime.
  if (msg.type === "CAPTURE_TAB") {
    (async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        // Ask the page itself for its viewport dimensions — captureVisibleTab
        // returns CSS pixels and document.elementFromPoint expects the same,
        // so the dimensions we capture are what Claude should use to plan
        // coordinates against.
        let viewportWidth = null;
        let viewportHeight = null;
        if (tab?.id) {
          try {
            const [{ result }] = await chrome.scripting.executeScript({
              target: { tabId: tab.id },
              func: () => ({ w: window.innerWidth, h: window.innerHeight }),
            });
            viewportWidth = result?.w ?? null;
            viewportHeight = result?.h ?? null;
          } catch {
            // best-effort
          }
        }
        const dataUrl = await chrome.tabs.captureVisibleTab(undefined, {
          format: "jpeg",
          quality: 70,
        });
        const screenshot = dataUrl.replace(/^data:image\/[^;]+;base64,/, "");
        sendResponse({
          ok: true,
          body: { screenshot, viewportWidth, viewportHeight },
        });
      } catch (e) {
        sendResponse({
          ok: false,
          body: { error: e?.message ?? "captureVisibleTab threw" },
        });
      }
    })();
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
