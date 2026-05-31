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

  // Phase 8h — auto-fill API call from the in-page overlay.
  // Content scripts can't credentialed-fetch onbehalfai.vercel.app
  // directly (CORS), so the overlay sends this message and we make
  // the call from the extension's privileged origin.
  if (msg.type === "AUTO_FILL_API") {
    api(`/api/extension/auto-fill`, {
      method: "POST",
      body: JSON.stringify(msg.payload),
    }).then(sendResponse);
    return true;
  }

  // After the user clicks the page's Submit button via our overlay's
  // "Approve and submit" CTA: mark the application submitted on the
  // server, then open the tracker so they can see status updated.
  if (msg.type === "MARK_SUBMITTED_AND_OPEN_TRACKER") {
    (async () => {
      const resp = await api(`/api/applications/${msg.applicationId}/mark-submitted`, {
        method: "POST",
      });
      // Open tracker regardless of the API result — if the call failed,
      // the tracker page itself will surface the discrepancy.
      const base = await getApiBase();
      chrome.tabs.create({ url: `${base}/tracker?just=${msg.applicationId}` });
      sendResponse(resp);
    })();
    return true;
  }

  // Phase 7 — capture the visible tab as JPEG so the popup can include
  // it in a direct fetch to /api/extension/computer-use. Lives in
  // background because chrome.tabs.captureVisibleTab needs the
  // extension's privileged context.
  //
  // CRITICAL: captureVisibleTab returns the image at the device's pixel
  // resolution. On Retina (devicePixelRatio = 2), the image is 2x the
  // viewport's CSS pixels. document.elementFromPoint and Claude's plan
  // must agree on coordinate space, so we downscale the screenshot to
  // CSS pixel dimensions before sending it to Claude. Then 1 pixel in
  // the screenshot == 1 viewport pixel == what elementFromPoint uses.
  if (msg.type === "CAPTURE_TAB") {
    (async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        let viewportWidth = null;
        let viewportHeight = null;
        let dpr = 1;
        if (tab?.id) {
          try {
            const [{ result }] = await chrome.scripting.executeScript({
              target: { tabId: tab.id },
              func: () => ({
                w: window.innerWidth,
                h: window.innerHeight,
                dpr: window.devicePixelRatio || 1,
              }),
            });
            viewportWidth = result?.w ?? null;
            viewportHeight = result?.h ?? null;
            dpr = result?.dpr ?? 1;
          } catch {
            // best-effort
          }
        }
        const dataUrl = await chrome.tabs.captureVisibleTab(undefined, {
          format: "jpeg",
          quality: 80,
        });

        let screenshot;
        if (dpr === 1 || !viewportWidth || !viewportHeight) {
          screenshot = dataUrl.replace(/^data:image\/[^;]+;base64,/, "");
        } else {
          // Downscale to viewport dimensions. Service workers have
          // OffscreenCanvas + createImageBitmap, so we can do this
          // entirely in the background.
          const blob = await (await fetch(dataUrl)).blob();
          const bitmap = await createImageBitmap(blob);
          const canvas = new OffscreenCanvas(viewportWidth, viewportHeight);
          const ctx = canvas.getContext("2d");
          ctx.drawImage(bitmap, 0, 0, viewportWidth, viewportHeight);
          const resized = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.8 });
          const buf = await resized.arrayBuffer();
          // Convert ArrayBuffer to base64 without spreading (avoid the
          // 'arguments too long' crash on large buffers)
          const bytes = new Uint8Array(buf);
          let binary = "";
          const chunk = 0x8000;
          for (let i = 0; i < bytes.length; i += chunk) {
            binary += String.fromCharCode.apply(
              null,
              bytes.subarray(i, i + chunk),
            );
          }
          screenshot = btoa(binary);
        }

        sendResponse({
          ok: true,
          body: { screenshot, viewportWidth, viewportHeight, dpr },
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
